import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables from .env
load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///analytics_db.db")

# Create SQLAlchemy engine depending on DB type
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
    )

# Session local factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Declarative Base for models
Base = declarative_base()

def get_db():
    """
    Dependency generator that yields a database session
    and closes it when the request is complete.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
