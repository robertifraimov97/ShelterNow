from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime

from app.db.database import Base


# Stores official shelter records that come from trusted municipal or external sources.
class Shelter(Base):
    __tablename__ = "shelters"

    # Unique database identifier for each shelter.
    id = Column(Integer, primary_key=True, index=True)

    # Basic shelter identification and location details.
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)

    # Geographic coordinates used for map display and routing calculations.
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)

    # Metadata that describes the type of shelter and where the information came from.
    shelter_type = Column(String, nullable=False, default="public_shelter")
    source_type = Column(String, nullable=False, default="official_municipality")
    source_name = Column(String, nullable=True)
    source_url = Column(String, nullable=True)

    # Extra operational or accessibility-related information about the shelter.
    accessibility_notes = Column(String, nullable=True)
    status = Column(String, nullable=False, default="unknown")
    last_verified_at = Column(DateTime, nullable=True)


# Stores shelters submitted manually by users through the app.
class SubmittedShelter(Base):
    __tablename__ = "submitted_shelters"

    # Unique database identifier for each submitted shelter.
    id = Column(Integer, primary_key=True, index=True)

    # Basic submitted shelter information provided by the user.
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)

    # Optional user notes and accessibility flag for the submitted shelter.
    notes = Column(String, nullable=True)
    is_accessible = Column(Boolean, default=False)

    # Timestamp for when the shelter was submitted.
    created_at = Column(DateTime, default=datetime.utcnow)


# Stores areas that the user chose to follow for alerts and updates.
class FollowedArea(Base):
    __tablename__ = "followed_areas"

    # Unique database identifier for each followed area entry.
    id = Column(Integer, primary_key=True, index=True)

    # Identifier used to associate followed areas with a specific user.
    user_identifier = Column(String, nullable=False)

    # Name of the area the user wants to follow.
    area_name = Column(String, nullable=False)

    # Timestamp for when the area was added to the followed list.
    created_at = Column(DateTime, default=datetime.utcnow)


# Stores community-provided shelters that can be shown during emergency situations.
class CommunityShelter(Base):
    __tablename__ = "community_shelters"

    # Unique database identifier for each community shelter.
    id = Column(Integer, primary_key=True, index=True)

    # Basic community shelter details.
    name = Column(String, nullable=False)
    city = Column(String, nullable=False)
    address = Column(String, nullable=False)

    # Optional geographic coordinates for map display and navigation.
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Additional shelter notes and operational flags.
    notes = Column(String, nullable=True)
    is_accessible = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    show_only_during_emergency = Column(Boolean, default=True)

    # Timestamp for when the community shelter was created.
    created_at = Column(DateTime, default=datetime.utcnow)


# Stores device push notification tokens for sending alerts to users.
class PushToken(Base):
    __tablename__ = "push_tokens"

    # Unique database identifier for each saved push token.
    id = Column(Integer, primary_key=True, index=True)

    # The actual push token, kept unique so the same device token is not stored twice.
    token = Column(String, nullable=False, unique=True)

    # Optional platform name such as iOS or Android.
    platform = Column(String, nullable=True)

    # Timestamp for when the token was first saved.
    created_at = Column(DateTime, default=datetime.utcnow)
