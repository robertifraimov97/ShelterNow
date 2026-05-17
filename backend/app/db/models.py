from sqlalchemy import Column, BigInteger, String, Text, Float, DateTime
from sqlalchemy.sql import func

from app.db.database import Base


class Shelter(Base):
    __tablename__ = "shelters"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    city = Column(String(100), nullable=False)
    address = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    shelter_type = Column(String(50), nullable=False)
    source_type = Column(String(50), nullable=False)
    source_name = Column(String(255), nullable=True)
    source_url = Column(Text, nullable=True)
    accessibility_notes = Column(Text, nullable=True)
    status = Column(String(30), nullable=False, default="unknown")
    last_verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
