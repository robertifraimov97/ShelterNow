from pydantic import BaseModel
from typing import Optional


class CommunityShelterCreate(BaseModel):
    name: str
    city: str
    address: str
    notes: Optional[str] = None
    is_accessible: bool = False


class CommunityShelterResponse(BaseModel):
    id: int
    name: str
    city: str
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes: Optional[str] = None
    is_accessible: bool
    is_active: bool
    show_only_during_emergency: bool

    class Config:
        from_attributes = True
