import os
import sys
from dotenv import load_dotenv

# Add the project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv(override=True)

from app.services.csv_service import import_csv_to_db, get_all_tables
from app.services.query_service import process_analytical_question

def main():
    print("--- Starting AI Analytics Platform Verification ---")
    
    # 1. Verify CSV Import
    csv_path = "data/csv/sales.csv"
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        sys.exit(1)
        
    print(f"Importing {csv_path} into PostgreSQL...")
    try:
        with open(csv_path, "rb") as f:
            result = import_csv_to_db(f, "sales.csv")
        print("Import successful!")
        print(f"Table name created: {result['table_name']}")
        print(f"Row count: {result['row_count']}")
        print(f"Columns: {result['columns']}")
    except Exception as e:
        print(f"Failed to import CSV: {e}")
        sys.exit(1)
        
    # 2. Verify List Tables
    print("\nListing all database tables...")
    try:
        tables = get_all_tables()
        print(f"Database tables: {tables}")
    except Exception as e:
        print(f"Failed to list tables: {e}")
        sys.exit(1)
        
    # 3. Verify Query Execution
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        print("\n[WARNING] GEMINI_API_KEY is not set in .env. Skipping the Natural Language Chat agent test.")
        print("To test the complete chat flow, please edit the '.env' file and add your GEMINI_API_KEY.")
    else:
        question = "What is the total revenue by category?"
        print(f"\nProcessing analytical question: '{question}'...")
        try:
            chat_result = process_analytical_question(question)
            if "error" in chat_result:
                print(f"Query process failed with error: {chat_result['error']}")
            else:
                print("Query process completed successfully!")
                print(f"Generated SQL:\n{chat_result['sql']}")
                print(f"\nQuery Results:\n{chat_result['results']}")
                print(f"\nGemini Explanation:\n{chat_result['explanation']}")
        except Exception as e:
            print(f"Query process encountered an exception: {e}")
            
    print("\n--- Verification Completed ---")

if __name__ == "__main__":
    main()
