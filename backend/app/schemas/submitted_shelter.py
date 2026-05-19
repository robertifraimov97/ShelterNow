from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class SubmittedShelterBase(BaseModel):
    name: str
    city: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None
    accessibility_notes: Optional[str] = None
    submitted_by_name: Optional[str] = None
    submitted_by_email: Optional[str] = None
    submission_status: str = "pending"
    review_notes: Optional[str] = None


class SubmittedShelterCreate(SubmittedShelterBase):
    pass


class SubmittedShelterResponse(SubmittedShelterBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
