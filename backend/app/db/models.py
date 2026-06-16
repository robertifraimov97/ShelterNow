from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime

from app.db.database import Base


class Shelter(Base):
    __tablename__ = "shelters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    shelter_type = Column(String, nullable=False, default="public_shelter")
    source_type = Column(String, nullable=False, default="official_municipality")
    source_name = Column(String, nullable=True)
    source_url = Column(String, nullable=True)
    accessibility_notes = Column(String, nullable=True)
    status = Column(String, nullable=False, default="unknown")
    last_verified_at = Column(String, nullable=True)


class SubmittedShelter(Base):
    __tablename__ = "submitted_shelters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)
    notes = Column(String, nullable=True)
    is_accessible = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class FollowedArea(Base):
    __tablename__ = "followed_areas"

    id = Column(Integer, primary_key=True, index=True)
    area_name = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CommunityShelter(Base):
    __tablename__ = "community_shelters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    is_accessible = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    show_only_during_emergency = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class PushToken(Base):
    __tablename__ = "push_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, nullable=False, unique=True)
    platform = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
