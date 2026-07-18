import re
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database.connection import engine

def clean_name(name: str) -> str:
    """
    Cleans a string to make it a safe PostgreSQL identifier (table or column name).
    - Lowercases the name.
    - Replaces spaces and non-alphanumeric characters with underscores.
    - Trims leading numbers or invalid characters if necessary.
    """
    # Lowercase
    name = name.lower().strip()
    # Replace non-alphanumeric with underscores
    name = re.sub(r"[^a-z0-9_]", "_", name)
    # Replace multiple underscores with a single one
    name = re.sub(r"_+", "_", name)
    # Ensure it starts with a letter (Postgres identifiers shouldn't start with numbers)
    if name and name[0].isdigit():
        name = "tbl_" + name
    # Trim leading/trailing underscores
    name = name.strip("_")
    return name

def import_csv_to_db(file_path_or_buffer, original_filename: str) -> dict:
    """
    Reads a CSV file, cleans its column names, generates a clean table name,
    and uploads it to the database. Handles multiple file encodings.
    """
    import io

    # Extract base filename without extension
    base_name = original_filename.rsplit(".", 1)[0]
    table_name = clean_name(base_name)
    
    if not table_name:
        raise ValueError("Invalid file name. Cannot derive table name.")

    # Read raw bytes so we can retry with different encodings
    raw_bytes = file_path_or_buffer.read()

    # Try multiple encodings in order of likelihood
    encodings_to_try = ["utf-8", "latin-1", "cp1252", "iso-8859-1", "utf-8-sig"]
    df = None
    last_error = None

    for enc in encodings_to_try:
        try:
            decoded = raw_bytes.decode(enc)
            df = pd.read_csv(io.StringIO(decoded))
            break  # success
        except (UnicodeDecodeError, UnicodeError) as e:
            last_error = e
            continue
        except Exception as e:
            last_error = e
            # For non-encoding errors (e.g. parse errors), try next encoding too
            continue

    if df is None:
        raise ValueError(f"Failed to read CSV with any supported encoding. Last error: {last_error}")
    
    if df.empty:
        raise ValueError("The uploaded CSV file is empty.")

    # Clean column names
    df.columns = [clean_name(col) for col in df.columns]

    # Write to database (replace if exists)
    # This automatically infers data types and creates the table structure
    df.to_sql(
        name=table_name,
        con=engine,
        if_exists="replace",
        index=False
    )
    
    return {
        "table_name": table_name,
        "row_count": len(df),
        "columns": list(df.columns)
    }

from sqlalchemy import inspect

def get_all_tables() -> list:
    """
    Queries database schema to list all user tables.
    Filters out internal application tables and auto-generated backups.
    """
    inspector = inspect(engine)
    all_tables = inspector.get_table_names()
    
    # Internal tables to hide
    internal_tables = {"chat_sessions", "chat_messages", "pinned_items"}
    
    user_tables = []
    for t in all_tables:
        if t in internal_tables:
            continue
        if t.endswith("_backup"):
            continue
        user_tables.append(t)
        
    return user_tables
