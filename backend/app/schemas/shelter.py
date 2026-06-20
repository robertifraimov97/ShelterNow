from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# Base schema that contains the shared shelter fields
# used across create and response models.
class ShelterBase(BaseModel):
    # Basic shelter identity and location information.
    name: str
    city: str
    address: Optional[str] = None

    # Geographic coordinates used for map display and routing.
    latitude: float
    longitude: float

    # Metadata about the shelter type and the source of the information.
    shelter_type: str
    source_type: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None

    # Optional operational and accessibility information.
    accessibility_notes: Optional[str] = None
    status: str = "unknown"
    last_verified_at: Optional[datetime] = None


# Schema used when creating a new shelter.
# It inherits all fields from ShelterBase.
class ShelterCreate(ShelterBase):
    pass


# Schema returned by shelter endpoints.
# It includes all base shelter fields plus the database ID.
class ShelterResponse(ShelterBase):
    id: int

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True
