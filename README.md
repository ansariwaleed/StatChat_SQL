# StatChat — Data Analytics Platform

StatChat is an AI-powered data analytics platform that allows you to easily ingest CSV datasets and chat with your data using natural language. Built with FastAPI and powered by Google's Gemini models, it bridges the gap between raw data and actionable insights without requiring you to write complex SQL queries.

## Features

- **Dynamic CSV Ingestion:** Upload any CSV file. StatChat automatically creates a database table, infers data types, and loads the data into a relational database (SQLite/PostgreSQL).
- **Automated Data Profiling:** Instantly get an overview of your dataset, including row counts, column types, statistical summaries for numeric data, and distribution for categorical data.
- **Natural Language to SQL:** Ask questions about your data in plain English. StatChat uses Google Gemini to translate your questions into optimized, read-only SQL queries.
- **Data Cleaning & Mutation:** In "cleaning mode", ask the AI to perform data mutations (UPDATE/DELETE). The platform automatically creates a backup table before proceeding.
- **AI Explanations:** Get human-readable, context-aware explanations of the query results, summarizing key takeaways and insights.
- **Persistent Chat Sessions:** Keep track of your analysis history. Chat sessions and the generated SQL queries are saved for future reference.
- **Manual SQL Execution:** View, edit, and manually run the AI-generated SQL queries for full control.

## Technology Stack

- **Backend:** FastAPI, Uvicorn, Python 3.9+
- **Database:** SQLAlchemy (Supports SQLite, PostgreSQL, etc.)
- **AI/LLM:** Google GenAI SDK (`gemini-3.1-flash-lite`)
- **Data Processing:** Pandas

## Prerequisites

- Python 3.9 or higher
- A Google Gemini API Key

## Installation & Setup

1. **Clone the repository (or navigate to the project directory):**
   ```bash
   cd StatChat_SQL
   ```

2. **Create a virtual environment (recommended):**
   ```bash
   python -m venv .venv
   # On Windows:
   .venv\Scripts\activate
   # On macOS/Linux:
   source .venv/bin/activate
   ```

3. **Install the dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables:**
   Copy the `.env.template` file to `.env` and fill in your API keys:
   ```bash
   cp .env.template .env
   ```
   Open `.env` and add your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   # Optional: Configure database URL if using PostgreSQL
   # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/analytics_db
   ```
   *Note: If `DATABASE_URL` is not set or uses SQLite, the app will create a local `analytics_db.db` file by default.*

## How to Run the App

Start the FastAPI development server using Uvicorn:

```bash
python -m app.main
```
Alternatively:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Once running, the web interface is available at:
**http://127.0.0.1:8000/**

## How to Use StatChat

1. **Upload Data:** Open the web app and upload a `.csv` file. It will be parsed and loaded into the database as a new table.
2. **View Overview:** Select your uploaded table to see the automated schema and statistical overview.
3. **Start a Chat:** Enter a question in the chat interface (e.g., *"What is the average sales amount per region?"* or *"Show me the top 5 customers by revenue"*).
4. **Review Insights:** StatChat will generate the SQL, execute it against your dataset, and return both the raw data and an AI-generated explanation of the findings.
5. **Data Cleaning:** Switch to cleaning mode to ask the AI to standardize columns, remove nulls, or perform other mutation operations.

## Project Structure

- `app/main.py`: The FastAPI application entry point.
- `app/api/endpoints/`: Contains API routes (`upload.py` handles CSV ingestion, table management, and chat routing).
- `app/database/`: Database connection setup, SQLAlchemy models, and session management.
- `app/services/`: Core business logic:
  - `csv_service.py`: Logic for parsing CSVs and creating dynamic tables.
  - `query_service.py`: LLM orchestration (Schema prompting, SQL generation, and insight explanation).
- `app/static/`: Frontend static files (HTML/CSS/JS).
