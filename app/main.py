import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints.upload import router as upload_router

app = FastAPI(
    title="AI Analytics Platform API",
    description="A FastAPI backend for the AI Analytics Platform. Supports dynamic CSV loading, SQL orchestration, and natural-language insights.",
    version="0.1.0"
)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(upload_router, tags=["Ingestion & Chat"])

from app.database.connection import engine, Base
from app.database import models # Import to register models

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Serve index.html directly from the static directory for the root endpoint
@app.get("/")
async def root():
    static_file_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    return FileResponse(static_file_path)

# Mount the static directory for CSS/JS
static_dir_path = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=static_dir_path), name="static")

if __name__ == "__main__":
    import uvicorn
    from dotenv import load_dotenv
    load_dotenv(override=True)
    
    host = os.getenv("API_HOST", "127.0.0.1")
    port = int(os.getenv("API_PORT", 8000))
    
    uvicorn.run("app.main:app", host=host, port=port, reload=True)
