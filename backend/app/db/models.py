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


class SubmittedShelter(Base):
    __tablename__ = "submitted_shelters"

    id = Column(BigInteger, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    city = Column(String(100), nullable=False)
    address = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    accessibility_notes = Column(Text, nullable=True)
    submitted_by_name = Column(String(255), nullable=True)
    submitted_by_email = Column(String(255), nullable=True)
    submission_status = Column(String(30), nullable=False, default="pending")
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

class FollowedArea(Base):
    __tablename__ = "followed_areas"

    id = Column(BigInteger, primary_key=True, index=True)
    user_identifier = Column(String(255), nullable=False)
    area_name = Column(String(100), nullable=False)
    city_code = Column(String(20), nullable=True)
    label = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
