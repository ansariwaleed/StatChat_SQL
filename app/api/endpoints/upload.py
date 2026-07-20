from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json
from app.services.csv_service import import_csv_to_db, get_all_tables
from app.services.query_service import (
    process_analytical_question, execute_query, generate_explanation,
    generate_sql, clean_sql_query, get_database_schema, generate_explanation_stream,
    generate_followup_suggestions, _execute_with_retry, clear_schema_cache
)
from app.database.connection import get_db, engine
from app.database.models import ChatSession, ChatMessage
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text

router = APIRouter()

class ChatRequest(BaseModel):
    question: str
    table_name: str = None
    session_id: str = None
    mode: str = "analysis"

class RunSqlRequest(BaseModel):
    sql: str
    table_name: str = None
    session_id: str = None
    question: str = "Manual SQL Execution"



class ChatSessionCreate(BaseModel):
    table_name: str

class ChatSessionResponse(BaseModel):
    id: str
    table_name: str
    title: str
    created_at: str

    class Config:
        from_attributes = True

@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a CSV file and load it into PostgreSQL.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    
    try:
        # Read file contents and import into DB
        # file.file is a file-like object
        result = import_csv_to_db(file.file, file.filename)
        # Invalidate schema cache since a new table was created
        clear_schema_cache()
        return {
            "message": "CSV imported successfully.",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import CSV: {str(e)}")



@router.get("/tables")
async def list_tables():
    """
    Get a list of all user-created tables in the database.
    """
    try:
        tables = get_all_tables()
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {str(e)}")

@router.get("/tables/{table_name}/schema")
async def get_table_schema(table_name: str):
    """
    Get the columns and data types of a specific table.
    """
    try:
        inspector = inspect(engine)
        if table_name not in inspector.get_table_names():
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
        
        columns = [
            {"name": col["name"], "type": str(col["type"])}
            for col in inspector.get_columns(table_name)
        ]
        return {"table": table_name, "columns": columns}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve schema: {str(e)}")

@router.delete("/tables/{table_name}")
async def delete_table(table_name: str, db: Session = Depends(get_db)):
    """
    Deletes a dataset (table) and all its associated chat sessions.
    """
    try:
        inspector = inspect(engine)
        if table_name not in inspector.get_table_names():
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
        
        # 1. Delete associated chat sessions (chat messages will cascade if foreign keys are enforced, 
        # but let's be explicit just in case).
        sessions = db.query(ChatSession).filter(ChatSession.table_name == table_name).all()
        for session in sessions:
            db.delete(session)
        db.commit()
        
        # 2. Drop the table
        with engine.begin() as conn:
            conn.execute(text(f'DROP TABLE "{table_name}"'))
        
        # Invalidate schema cache since a table was deleted
        clear_schema_cache()
            
        return {"message": f"Table '{table_name}' and its chat history deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete table: {str(e)}")

@router.get("/tables/{table_name}/overview")
async def get_table_overview(table_name: str):
    """
    Generate a basic overview and statistics for the chosen table.
    """
    try:
        inspector = inspect(engine)
        if table_name not in inspector.get_table_names():
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found.")
        
        columns = inspector.get_columns(table_name)
        
        # 1. Total row count
        row_count_query = text(f'SELECT COUNT(*) FROM "{table_name}"')
        with engine.connect() as conn:
            row_count = conn.execute(row_count_query).scalar()
            
            # 2. Get first 10 rows for preview
            preview_query = text(f'SELECT * FROM "{table_name}" LIMIT 10')
            preview_res = conn.execute(preview_query)
            keys = preview_res.keys()
            preview_rows = [dict(zip(keys, row)) for row in preview_res.fetchall()]

        # Identify numeric vs categorical columns
        numeric_cols = []
        categorical_cols = []
        
        for col in columns:
            col_name = col["name"]
            col_type = str(col["type"]).lower()
            
            is_num = any(t in col_type for t in ["int", "float", "double", "real", "numeric", "decimal"])
            if is_num:
                numeric_cols.append(col_name)
            else:
                categorical_cols.append(col_name)
                
        # 3. Compute numeric summaries (AVG, MIN, MAX)
        numeric_summary = []
        if numeric_cols:
            selects = ", ".join([
                f'AVG("{col}") AS "avg_{col}", MIN("{col}") AS "min_{col}", MAX("{col}") AS "max_{col}"'
                for col in numeric_cols
            ])
            summary_query = text(f'SELECT {selects} FROM "{table_name}"')
            with engine.connect() as conn:
                res = conn.execute(summary_query).fetchone()
                if res:
                    row_dict = res._mapping
                    for col in numeric_cols:
                        try:
                            avg_val = row_dict.get(f"avg_{col}")
                            min_val = row_dict.get(f"min_{col}")
                            max_val = row_dict.get(f"max_{col}")
                            
                            avg_float = None
                            if avg_val is not None:
                                try:
                                    avg_float = round(float(avg_val), 2)
                                except (ValueError, TypeError):
                                    pass
                                    
                            min_float = None
                            if min_val is not None:
                                try:
                                    min_float = float(min_val)
                                except (ValueError, TypeError):
                                    pass
                                    
                            max_float = None
                            if max_val is not None:
                                try:
                                    max_float = float(max_val)
                                except (ValueError, TypeError):
                                    pass
                                    
                            numeric_summary.append({
                                "column": col,
                                "avg": avg_float,
                                "min": min_float,
                                "max": max_float
                            })
                        except Exception:
                            continue

        # 4. Compute top categorical distributions
        categorical_summary = {}
        with engine.connect() as conn:
            # Analyze categorical columns, limit to top 5 to avoid excessive load
            for col in categorical_cols[:5]:
                try:
                    # Exclude columns that act like unique IDs (distinct count close to row count)
                    dist_query = text(f'SELECT COUNT(DISTINCT "{col}") FROM "{table_name}"')
                    dist_count = conn.execute(dist_query).scalar()
                    
                    # Skip if it has too many unique values (e.g. name, ticket id) or only 1 value
                    if dist_count is not None and 1 < dist_count < 100:
                        dist_query = text(f'SELECT "{col}", COUNT(*) as cnt FROM "{table_name}" WHERE "{col}" IS NOT NULL GROUP BY "{col}" ORDER BY cnt DESC LIMIT 5')
                        res = conn.execute(dist_query).fetchall()
                        categorical_summary[col] = [
                            {"value": str(row[0]), "count": int(row[1])}
                            for row in res
                        ]
                except Exception:
                    continue

        return {
            "table_name": table_name,
            "row_count": row_count,
            "column_count": len(columns),
            "columns": [{"name": c["name"], "type": str(c["type"])} for c in columns],
            "numeric_summary": numeric_summary,
            "categorical_summary": categorical_summary,
            "preview_rows": preview_rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate table overview: {str(e)}")

@router.post("/chat")
async def chat_query(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Ask a natural language question about the imported database schemas
    and receive an SQL query, execution results, and text explanation.
    Supports dialogue memory and multi-query visualizations.
    """
    try:
        # Load conversation history first (excluding current message)
        history = []
        if request.session_id:
            db_messages = db.query(ChatMessage).filter(ChatMessage.session_id == request.session_id).order_by(ChatMessage.created_at.asc()).all()
            for m in db_messages:
                history.append({
                    "role": m.role,
                    "content": m.content,
                    "sql_query": m.sql_query
                })

        # Generate title for new chat
        if request.session_id:
            session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            title = request.question[:30] + "..." if len(request.question) > 30 else request.question
            session = ChatSession(table_name=request.table_name, title=title)
            db.add(session)
            db.commit()
            db.refresh(session)
            request.session_id = session.id
            
        # Save user message
        user_msg = ChatMessage(
            session_id=request.session_id,
            role="user",
            content=request.question
        )
        db.add(user_msg)
        db.commit()

        # Process via LLM (incorporating history context)
        result = process_analytical_question(request.question, active_table=request.table_name, mode=request.mode, history=history)
        if "error" in result and not result.get("sql") and not result.get("is_multi_query"):
            # Save error message
            err_msg = ChatMessage(
                session_id=request.session_id,
                role="assistant",
                content=result["error"]
            )
            db.add(err_msg)
            db.commit()
            raise HTTPException(status_code=400, detail=result["error"])
            
        # Save AI message
        if result.get("is_multi_query"):
            ai_msg = ChatMessage(
                session_id=request.session_id,
                role="assistant",
                content=result.get("explanation", ""),
                sql_query=json.dumps([q["sql"] for q in result.get("queries", [])]),
                results_json=json.dumps(result.get("queries")),
                explanation=result.get("explanation")
            )
        else:
            ai_msg = ChatMessage(
                session_id=request.session_id,
                role="assistant",
                content=result.get("explanation", ""),
                sql_query=result.get("sql"),
                results_json=json.dumps(result.get("results")) if result.get("results") else None,
                explanation=result.get("explanation")
            )
        db.add(ai_msg)
        db.commit()
        
        result["session_id"] = request.session_id
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process query: {str(e)}")

@router.get("/tables/{table_name}/chats")
async def get_chats_for_table(table_name: str, db: Session = Depends(get_db)):
    sessions = db.query(ChatSession).filter(ChatSession.table_name == table_name).order_by(ChatSession.created_at.desc()).all()
    return [{"id": s.id, "title": s.title, "created_at": s.created_at.isoformat()} for s in sessions]

@router.delete("/chats/{session_id}")
async def delete_chat(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Chat deleted"}

@router.get("/chats/{session_id}")
async def get_chat_history(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()
    
    history = []
    for m in messages:
        if m.role == "user":
            history.append({"role": "user", "content": m.content})
        else:
            history.append({
                "role": "assistant",
                "explanation": m.explanation,
                "sql": m.sql_query,
                "results": json.loads(m.results_json) if m.results_json else []
            })
            
    return {"session_id": session.id, "title": session.title, "table_name": session.table_name, "history": history}

@router.post("/chat/run_sql")
async def manual_run_sql(request: RunSqlRequest, db: Session = Depends(get_db)):
    """
    Manually execute a user-edited SQL query and generate a new explanation.
    """
    try:
        results = execute_query(request.sql)
        explanation = generate_explanation(request.question, request.sql, results)
        
        # Save user edited SQL message as an AI message so it renders as a response
        if request.session_id:
            ai_msg = ChatMessage(
                session_id=request.session_id,
                role="assistant",
                content=explanation,
                sql_query=request.sql,
                results_json=json.dumps(results) if results else None,
                explanation=explanation
            )
            db.add(ai_msg)
            db.commit()
            
        return {
            "sql": request.sql,
            "results": results,
            "explanation": explanation,
            "session_id": request.session_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to execute manual SQL: {str(e)}")

@router.post("/chat/stream")
async def chat_query_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Streaming version of the chat endpoint using Server-Sent Events (SSE).
    SQL generation + execution happen first, then the explanation is streamed.
    """
    import re as _re
    
    try:
        # Load conversation history
        history = []
        if request.session_id:
            db_messages = db.query(ChatMessage).filter(
                ChatMessage.session_id == request.session_id
            ).order_by(ChatMessage.created_at.asc()).all()
            for m in db_messages:
                history.append({
                    "role": m.role,
                    "content": m.content,
                    "sql_query": m.sql_query
                })

        # Create or load session
        if request.session_id:
            session = db.query(ChatSession).filter(ChatSession.id == request.session_id).first()
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            title = request.question[:30] + "..." if len(request.question) > 30 else request.question
            session = ChatSession(table_name=request.table_name, title=title)
            db.add(session)
            db.commit()
            db.refresh(session)
            request.session_id = session.id

        # Save user message
        user_msg = ChatMessage(
            session_id=request.session_id,
            role="user",
            content=request.question
        )
        db.add(user_msg)
        db.commit()

        # --- Phase 1: Generate + Execute SQL (non-streamed) ---
        schema = get_database_schema(table_name=request.table_name)
        if not schema:
            raise HTTPException(status_code=400, detail="No database tables found.")

        raw_response = generate_sql(
            request.question, schema,
            active_table=request.table_name,
            mode=request.mode,
            history=history
        )
        cleaned_content = clean_sql_query(raw_response)

        is_multi_query = False
        parsed_queries = []
        
        if cleaned_content.strip().startswith("["):
            try:
                parsed_queries = json.loads(cleaned_content)
                if isinstance(parsed_queries, list) and len(parsed_queries) > 0 and all(isinstance(q, dict) and "sql" in q for q in parsed_queries):
                    is_multi_query = True
            except Exception:
                pass

        final_sql = None
        results = []
        multi_queries_payload = []

        if is_multi_query:
            final_sql = "Multi-Query Dashboard"
            for item in parsed_queries:
                sql_sub = item["sql"]
                sql_upper = sql_sub.upper()
                if request.mode == "analysis":
                    for forbidden in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]:
                        if _re.search(rf"\b{forbidden}\b", sql_upper):
                            raise HTTPException(status_code=400, detail=f"Security check failed: forbidden keyword '{forbidden}'")
                
                # Execute each sub-query with self-correction
                sub_sql, sub_results = _execute_with_retry(sql_sub, request.question, schema, request.table_name, request.mode, history)
                multi_queries_payload.append({
                    "title": item.get("title", "Metric Report"),
                    "sql": sub_sql,
                    "chart_type": item.get("chart_type", "bar"),
                    "results": sub_results
                })
            results = multi_queries_payload
        else:
            final_sql = cleaned_content
            # Safety check
            sql_upper = final_sql.upper()
            if request.mode == "analysis":
                for forbidden in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]:
                    if _re.search(rf"\b{forbidden}\b", sql_upper):
                        raise HTTPException(
                            status_code=400,
                            detail=f"Security check failed: forbidden keyword '{forbidden}'"
                        )

            # Execute with self-correcting retry
            final_sql, results = _execute_with_retry(
                final_sql, request.question, schema,
                request.table_name, request.mode, history
            )

        # Generate follow-up suggestions
        suggestions = generate_followup_suggestions(
            request.question, results if not is_multi_query else [], table_name=request.table_name
        )

        # --- Phase 2: Stream explanation via SSE ---
        def event_stream():
            full_explanation = ""
            
            # First event: metadata (SQL, results, session_id)
            metadata = {
                "type": "metadata",
                "sql": final_sql,
                "results": results[:100] if not is_multi_query else None,
                "queries": results if is_multi_query else None,
                "is_multi_query": is_multi_query,
                "session_id": request.session_id,
                "suggestions": suggestions,
                "mode": request.mode
            }
            yield f"data: {json.dumps(metadata)}\n\n"
            
            # Stream explanation chunks
            try:
                for chunk in generate_explanation_stream(
                    request.question, final_sql, results, history=history, mode=request.mode
                ):
                    full_explanation += chunk
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
            except Exception as e:
                full_explanation = f"Error generating explanation: {str(e)}"
                yield f"data: {json.dumps({'type': 'chunk', 'text': full_explanation})}\n\n"
            
            # Final event: done
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
            # Save AI message to DB (after streaming completes)
            try:
                from app.database.connection import SessionLocal
                save_db = SessionLocal()
                ai_msg = ChatMessage(
                    session_id=request.session_id,
                    role="assistant",
                    content=full_explanation,
                    sql_query=final_sql,
                    results_json=json.dumps(results) if results else None,
                    explanation=full_explanation
                )
                save_db.add(ai_msg)
                save_db.commit()
                save_db.close()
            except Exception:
                pass

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming failed: {str(e)}")

