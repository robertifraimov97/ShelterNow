from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ShelterBase(BaseModel):
    name: str
    city: str
    address: Optional[str] = None
    latitude: float
    longitude: float
    shelter_type: str
    source_type: str
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    accessibility_notes: Optional[str] = None
    status: str = "unknown"
    last_verified_at: Optional[datetime] = None


class ShelterCreate(ShelterBase):
    pass


class ShelterResponse(ShelterBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
