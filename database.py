"""
Database connection setup.
Reads DATABASE_URL from .env so you can change credentials without touching code.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:bhavesh2008@localhost:5432/er_ai_studio"
)

# SQLAlchemy 2.x uses psycopg3 by default for postgresql://.
# Force psycopg2 since that's what's installed.
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
elif DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_timeout=30,
    pool_pre_ping=True,
    connect_args={"sslmode": "require"} if "neon.tech" in DATABASE_URL else {},
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Session:
    """
    FastAPI dependency — yields a DB session and closes it after the request.
    Usage in a route:
        @app.get("/something")
        def route(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
