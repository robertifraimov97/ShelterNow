from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# Base schema that contains the shared fields
# for user-submitted shelters.
class SubmittedShelterBase(BaseModel):
    # Basic shelter details provided by the user.
    name: str
    city: str
    address: Optional[str] = None

    # Optional coordinates that may be added after geocoding.
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Optional submission and accessibility details.
    notes: Optional[str] = None
    accessibility_notes: Optional[str] = None

    # Optional information about the person who submitted the shelter.
    submitted_by_name: Optional[str] = None
    submitted_by_email: Optional[str] = None

    # Review workflow fields for tracking the submission state.
    submission_status: str = "pending"
    review_notes: Optional[str] = None


# Schema used when creating a new submitted shelter.
# It inherits all shared fields from SubmittedShelterBase.
class SubmittedShelterCreate(SubmittedShelterBase):
    pass


# Schema returned by submitted shelter endpoints.
# It includes all shared fields plus database-managed metadata.
class SubmittedShelterResponse(SubmittedShelterBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True
