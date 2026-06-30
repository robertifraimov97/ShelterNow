from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SubmittedShelterBase(BaseModel):
    # Basic shelter information.
    name: str
    city: str
    address: Optional[str] = None

    # Coordinates may be added later by the backend geocoding service.
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Optional user-provided notes.
    notes: Optional[str] = None
    accessibility_notes: Optional[str] = None

    # Optional submitter information.
    submitted_by_name: Optional[str] = None
    submitted_by_email: Optional[str] = None

    # Review workflow fields.
    submission_status: str = "pending"
    review_notes: Optional[str] = None


class SubmittedShelterCreate(SubmittedShelterBase):
    # This model is used when a new submitted shelter is created.
    pass


class SubmittedShelterUpdate(BaseModel):
    # Editable fields for updating an existing submitted shelter.
    name: str
    city: str
    address: str
    notes: Optional[str] = None
    accessibility_notes: Optional[str] = None


class SubmittedShelterReviewAction(BaseModel):
    # Optional notes written by the reviewer during approval or rejection.
    review_notes: Optional[str] = None


class SubmittedShelterResponse(SubmittedShelterBase):
    # Database-generated fields returned to the client.
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        # Allow returning SQLAlchemy model instances directly.
        from_attributes = True
