from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv
import os

# Load environment variables from the .env file into the application environment.
load_dotenv()

# Read the database connection string from the environment variables.
DATABASE_URL = os.getenv("DATABASE_URL")

# Stop the application early if the database URL is missing.
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in the .env file")

# Create the main SQLAlchemy engine that will be used to connect to the database.
engine = create_engine(DATABASE_URL)

# Create a configured session factory for database sessions.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for all SQLAlchemy ORM models in the project.
Base = declarative_base()


# Dependency function for FastAPI routes.
# It creates a database session, provides it to the route,
# and makes sure the session is closed afterward.
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
