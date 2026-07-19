import os
import re
import json
from google import genai
from sqlalchemy import text, inspect
from app.database.connection import engine

def get_gemini_client():
    gemini_key = os.getenv("GEMINI_API_KEY")
    google_key = os.getenv("GOOGLE_API_KEY")
    
    if gemini_key:
        original_google_key = os.environ.pop("GOOGLE_API_KEY", None)
        try:
            client = genai.Client(api_key=gemini_key)
        finally:
            if original_google_key is not None:
                os.environ["GOOGLE_API_KEY"] = original_google_key
        return client
        
    if google_key:
        return genai.Client(api_key=google_key)
        
    raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY is set in environment or .env file.")

def get_database_schema(table_name: str = None) -> str:
    """
    Retrieves the column schemas for tables in the database
    and formats them as a readable string for the LLM.
    If table_name is provided, only that table's schema is returned.
    """
    inspector = inspect(engine)
    schema_str = ""
    all_tables = inspector.get_table_names()
    
    tables_to_include = [table_name] if table_name and table_name in all_tables else all_tables
    
    for tbl in tables_to_include:
        if tbl == "spatial_ref_sys":
            continue
        schema_str += f"Table: {tbl}\nColumns:\n"
        for column in inspector.get_columns(tbl):
            schema_str += f"  - {column['name']} ({column['type']})\n"
        schema_str += "\n"
        
    return schema_str

def clean_sql_query(raw_response: str) -> str:
    """
    Extracts the SQL query or JSON block from the model's markdown/text output.
    """
    json_match = re.search(r"```json\s*(.*?)\s*```", raw_response, re.DOTALL | re.IGNORECASE)
    if json_match:
        return json_match.group(1).strip()

    sql_match = re.search(r"```sql\s*(.*?)\s*```", raw_response, re.DOTALL | re.IGNORECASE)
    if sql_match:
        return sql_match.group(1).strip()
    
    code_match = re.search(r"```\s*(.*?)\s*```", raw_response, re.DOTALL)
    if code_match:
        return code_match.group(1).strip()
        
    return raw_response.strip()

def generate_sql(question: str, schema: str, active_table: str = None, mode: str = "analysis", history: list = None) -> str:
    """
    Generates a SELECT query or JSON query block based on the user's question, schema, and history.
    """
    client = get_gemini_client()
    db_type = "SQLite" if engine.url.drivername.startswith("sqlite") else "PostgreSQL"
    
    table_instruction = ""
    if active_table:
        table_instruction = f"6. The user is currently analyzing the table '{active_table}'. Prioritize this table, but you may JOIN with others if requested.\n"
        
    history_context = ""
    if history:
        history_context = "Previous Conversation History (use this for context/pronoun resolution):\n"
        for msg in history:
            role_label = "User" if msg.get("role") == "user" else "Assistant"
            history_context += f"{role_label}: {msg.get('content')}\n"
            if msg.get("sql_query"):
                history_context += f"Executed SQL: {msg.get('sql_query')}\n"
        history_context += "\n"
    
    if mode == "cleaning":
        system_prompt = (
            f"You are an expert data analyst and database administrator. "
            f"Your task is to generate a valid, optimized {db_type} query to clean or mutate data based on the user question.\n\n"
            "Strict Guidelines:\n"
            "1. You MAY generate UPDATE, DELETE, or ALTER queries for data cleaning. NEVER generate DROP queries.\n"
            "2. Do not explain the code. Do not write any conversational text. Only output the SQL code block.\n"
            "3. Pay close attention to table names and column names. Match them exactly as they are defined in the schema.\n"
            "4. Output the query inside a ```sql ... ``` markdown code block.\n"
            f"{table_instruction}"
        )
    else:
        system_prompt = (
            f"You are an expert data analyst and database administrator. "
            f"Your task is to generate a valid, optimized, read-only {db_type} SELECT query based on the database schema, previous conversation history, and user question.\n\n"
            "Strict Guidelines:\n"
            "1. ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, or other data modifying queries.\n"
            "2. Do not explain the code. Do not write any conversational text. Only output the code block.\n"
            "3. Pay close attention to table names and column names. Match them exactly as they are defined in the schema.\n"
            "4. If standard aggregations (SUM, AVG, COUNT, MAX, MIN) or sorting/grouping are needed, include them.\n"
            "5. Output the query inside markdown code blocks: either ```sql ... ``` for a single query, or ```json ... ``` for multiple queries.\n"
            "6. If the user question is broad (e.g. requests an 'overview', 'report', 'dashboard', 'summary', or broad analysis of multiple attributes), you MUST return a JSON list of query configurations wrapped inside a ```json ... ``` block. Each item must have 'title' (a short descriptive title of the sub-metric), 'sql' (the optimized SELECT query), and 'chart_type' ('bar', 'line', 'pie', 'scatter', or 'heatmap'). Otherwise, return a single SQL query wrapped in a ```sql ... ``` code block.\n"
            f"{table_instruction}"
        )
    
    user_prompt = f"Schema:\n{schema}\n\n{history_context}User Question:\n{question}\n\nQuery/JSON Output:"
    
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    interaction = client.interactions.create(
        model=model_name,
        system_instruction=system_prompt,
        input=user_prompt,
        generation_config={"temperature": 0.0}
    )
    
    return interaction.output_text.strip()

def execute_query(sql_query: str) -> list:
    """
    Executes the SQL query on database and returns results as list of dicts.
    Handles both read and mutation queries.
    """
    with engine.connect() as conn:
        result = conn.execute(text(sql_query))
        
        if not result.returns_rows:
            conn.commit()
            return [{"affected_rows": result.rowcount, "message": "Query executed successfully."}]
        
        keys = result.keys()
        rows = [dict(zip(keys, row)) for row in result.fetchall()]
        return rows

def format_results_for_llm(results: list) -> str:
    """
    Formatting helper to serialize records into a brief text representation.
    """
    if not results:
        return "No rows returned."
    if len(results) > 15:
        results = results[:15]
    return str(results)

def generate_explanation(question: str, sql_query: str, results: list, history: list = None) -> str:
    """
    Generates a human-readable explanation of the query results.
    """
    client = get_gemini_client()
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    
    system_prompt = (
        "You are a helpful business intelligence and data analyst assistant. "
        "Given a user's analytical question, the SQL query (or queries) executed, and the resulting records, "
        "provide a concise, easy-to-understand explanation of the findings.\n"
        "Summarize the key takeaways and insights. Format numbers nicely (e.g., currency, percentages) and present lists/tables where appropriate.\n"
        "Do not explain the SQL query itself; focus purely on the data and the answer to the user's question."
    )
    
    history_context = ""
    if history:
        history_context = "Previous Conversation History:\n"
        for msg in history:
            role_label = "User" if msg.get("role") == "user" else "Assistant"
            history_context += f"{role_label}: {msg.get('content')}\n"
        history_context += "\n"
        
    if isinstance(results, list) and len(results) > 0 and isinstance(results[0], dict) and "results" in results[0]:
        formatted_results = ""
        for i, item in enumerate(results, 1):
            sub_title = item.get("title", f"Report {i}")
            sub_sql = item.get("sql", "")
            sub_records = item.get("results", [])
            formatted_sub = format_results_for_llm(sub_records)
            formatted_results += f"Sub-Report {i}: {sub_title}\nSQL: {sub_sql}\nResults:\n{formatted_sub}\n\n"
    else:
        formatted_results = format_results_for_llm(results)
    
    user_prompt = (
        f"{history_context}"
        f"User Question: {question}\n\n"
        f"SQL Query Executed: {sql_query}\n\n"
        f"Query Results:\n{formatted_results}\n\n"
        f"Explanation:"
    )
    
    interaction = client.interactions.create(
        model=model_name,
        system_instruction=system_prompt,
        input=user_prompt,
        generation_config={"temperature": 0.3}
    )
    
    return interaction.output_text.strip()

def process_analytical_question(question: str, active_table: str = None, mode: str = "analysis", history: list = None) -> dict:
    """
    Orchestrates the workflow of reading the schema, generating SQL, executing it,
    and explaining the result. Supports both single-query and multi-query dashboard flows.
    """
    schema = get_database_schema(table_name=active_table)
    if not schema:
        return {
            "error": "No database tables found. Please upload a CSV file first to create a table."
        }
        
    try:
        if mode == "cleaning" and active_table:
            backup_table_name = f"{active_table}_backup"
            inspector = inspect(engine)
            if not inspector.has_table(backup_table_name):
                with engine.connect() as conn:
                    conn.execute(text(f"CREATE TABLE {backup_table_name} AS SELECT * FROM {active_table}"))
                    conn.commit()

        raw_response = generate_sql(question, schema, active_table=active_table, mode=mode, history=history)
        cleaned_content = clean_sql_query(raw_response)
        
        is_multi_query = False
        parsed_queries = []
        
        if cleaned_content.strip().startswith("["):
            try:
                parsed_queries = json.loads(cleaned_content)
                if isinstance(parsed_queries, list) and len(parsed_queries) > 0 and all(isinstance(q, dict) and "sql" in q for q in parsed_queries):
                    is_multi_query = True
                else:
                    raise ValueError("JSON block is not a valid list of SQL queries.")
            except Exception as e:
                if isinstance(e, NameError):
                    raise e
                raise ValueError(f"Failed to parse generated dashboard configuration as JSON: {str(e)}")
                
        if is_multi_query:
            results_list = []
            for item in parsed_queries:
                sql_sub = item["sql"]
                sql_upper = sql_sub.upper()
                for forbidden in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]:
                    if re.search(rf"\b{forbidden}\b", sql_upper):
                        raise ValueError(f"Security check failed: generated SQL contains forbidden keyword '{forbidden}' in analysis mode.")
                
                sub_results = execute_query(sql_sub)
                results_list.append({
                    "title": item.get("title", "Metric Report"),
                    "sql": sql_sub,
                    "chart_type": item.get("chart_type", "bar"),
                    "results": sub_results
                })
                
            explanation = generate_explanation(question, "Multi-Query Dashboard", results_list, history=history)
            
            return {
                "question": question,
                "is_multi_query": True,
                "queries": results_list,
                "explanation": explanation
            }
            
        else:
            sql = cleaned_content
            sql_upper = sql.upper()
            
            if mode == "analysis":
                for forbidden in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]:
                    if re.search(rf"\b{forbidden}\b", sql_upper):
                        raise ValueError(f"Security check failed: generated SQL contains forbidden keyword '{forbidden}' in analysis mode.")
            else:
                if re.search(rf"\bDROP\b", sql_upper):
                    raise ValueError("Security check failed: DROP queries are never allowed.")
                    
            results = execute_query(sql)
            explanation = generate_explanation(question, sql, results, history=history)
            
            return {
                "question": question,
                "sql": sql,
                "results": results,
                "explanation": explanation
            }
            
    except Exception as e:
        return {
            "question": question,
            "error": str(e),
            "sql": locals().get("sql", None)
        }
