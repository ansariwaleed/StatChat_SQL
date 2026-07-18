import os
import re
from google import genai
from sqlalchemy import text, inspect
from app.database.connection import engine

def get_gemini_client():
    gemini_key = os.getenv("GEMINI_API_KEY")
    google_key = os.getenv("GOOGLE_API_KEY")
    
    if gemini_key:
        # Temporarily remove GOOGLE_API_KEY to force SDK to use the .env-configured GEMINI_API_KEY
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
    
    # If a specific table is requested, only include that one
    tables_to_include = [table_name] if table_name and table_name in all_tables else all_tables
    
    for tbl in tables_to_include:
        # Skip spatial ref or system tables
        if tbl == "spatial_ref_sys":
            continue
        schema_str += f"Table: {tbl}\nColumns:\n"
        for column in inspector.get_columns(tbl):
            schema_str += f"  - {column['name']} ({column['type']})\n"
        schema_str += "\n"
        
    return schema_str

def clean_sql_query(raw_response: str) -> str:
    """
    Extracts the SQL query from the model's markdown/text output.
    """
    # Look for sql code blocks
    sql_match = re.search(r"```sql\s*(.*?)\s*```", raw_response, re.DOTALL | re.IGNORECASE)
    if sql_match:
        return sql_match.group(1).strip()
    
    # Check for general code blocks
    code_match = re.search(r"```\s*(.*?)\s*```", raw_response, re.DOTALL)
    if code_match:
        return code_match.group(1).strip()
        
    # Return raw text if no code blocks are found
    return raw_response.strip()

def generate_sql(question: str, schema: str, active_table: str = None, mode: str = "analysis") -> str:
    """
    Generates a SELECT query based on the user's question and schema, or a mutation query if in cleaning mode.
    """
    client = get_gemini_client()
    
    db_type = "SQLite" if engine.url.drivername.startswith("sqlite") else "PostgreSQL"
    
    table_instruction = ""
    if active_table:
        table_instruction = f"6. The user is currently analyzing the table '{active_table}'. Prioritize this table, but you may JOIN with others if requested.\n"
    
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
            f"Your task is to generate a valid, optimized, read-only {db_type} SELECT query based on the provided database schema and user question.\n\n"
            "Strict Guidelines:\n"
            "1. ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, or other data modifying queries.\n"
            "2. Do not explain the code. Do not write any conversational text. Only output the SQL code block.\n"
            "3. Pay close attention to table names and column names. Match them exactly as they are defined in the schema.\n"
            "4. If standard aggregations (SUM, AVG, COUNT, MAX, MIN) or sorting/grouping are needed, include them.\n"
            "5. Output the query inside a ```sql ... ``` markdown code block.\n"
            f"{table_instruction}"
        )
    
    user_prompt = f"Schema:\n{schema}\n\nUser Question:\n{question}\n\nSQL Query:"
    
    interaction = client.interactions.create(
        model="gemini-3.1-flash-lite",
        system_instruction=system_prompt,
        input=user_prompt,
        generation_config={"temperature": 0.0}
    )
    
    sql = clean_sql_query(interaction.output_text)
    
    # Basic safety check
    sql_upper = sql.upper()
    if mode == "analysis":
        for forbidden in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE"]:
            if re.search(rf"\b{forbidden}\b", sql_upper):
                raise ValueError(f"Security check failed: generated SQL contains forbidden keyword '{forbidden}' in analysis mode.")
    else:
        # In cleaning mode, only DROP is forbidden
        if re.search(rf"\bDROP\b", sql_upper):
            raise ValueError("Security check failed: DROP queries are never allowed.")
            
    return sql

def execute_query(sql_query: str) -> list:
    """
    Executes the SQL query on database and returns results as list of dicts.
    Handles both read and mutation queries.
    """
    with engine.connect() as conn:
        result = conn.execute(text(sql_query))
        
        # If it's a mutation, commit and return affected rows
        if not result.returns_rows:
            conn.commit()
            return [{"affected_rows": result.rowcount, "message": "Query executed successfully."}]
        
        keys = result.keys()
        rows = [dict(zip(keys, row)) for row in result.fetchall()]
        return rows

def generate_explanation(question: str, sql_query: str, results: list) -> str:
    """
    Generates a human-readable explanation of the query results.
    """
    client = get_gemini_client()
    
    system_prompt = (
        "You are a helpful business intelligence and data analyst assistant. "
        "Given a user's analytical question, the SQL query executed, and the raw query results, "
        "provide a concise, easy-to-understand explanation of the findings.\n"
        "Summarize the key takeaways and insights. Format numbers nicely (e.g., currency, percentages) and present lists/tables where appropriate.\n"
        "Do not explain the SQL query itself; focus purely on the data and the answer to the user's question."
    )
    
    user_prompt = (
        f"User Question: {question}\n\n"
        f"SQL Query Executed: {sql_query}\n\n"
        f"Query Results:\n{results}\n\n"
        f"Explanation:"
    )
    
    interaction = client.interactions.create(
        model="gemini-3.1-flash-lite",
        system_instruction=system_prompt,
        input=user_prompt,
        generation_config={"temperature": 0.3}
    )
    
    return interaction.output_text.strip()

def process_analytical_question(question: str, active_table: str = None, mode: str = "analysis") -> dict:
    """
    Orchestrates the workflow of reading the schema, generating SQL, executing it,
    and explaining the result.
    """
    schema = get_database_schema() # Pass all tables for joins
    if not schema:
        return {
            "error": "No database tables found. Please upload a CSV file first to create a table."
        }
        
    try:
        # Auto-backup the active table before any cleaning operations
        if mode == "cleaning" and active_table:
            backup_table_name = f"{active_table}_backup"
            inspector = inspect(engine)
            if not inspector.has_table(backup_table_name):
                with engine.connect() as conn:
                    conn.execute(text(f"CREATE TABLE {backup_table_name} AS SELECT * FROM {active_table}"))
                    conn.commit()

        sql = generate_sql(question, schema, active_table=active_table, mode=mode)
        results = execute_query(sql)
        explanation = generate_explanation(question, sql, results)
        
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
