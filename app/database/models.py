from sqlalchemy import Column, String, Integer, Text, DateTime, ForeignKey
from datetime import datetime
from app.database.connection import Base
import uuid

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    table_name = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String, ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True, nullable=False)
    role = Column(String, nullable=False) # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    sql_query = Column(Text, nullable=True)
    results_json = Column(Text, nullable=True) # Store JSON string of results
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

