from pydantic import BaseModel
from typing import Optional


class BestShelterRequest(BaseModel):
    user_latitude: float
    user_longitude: float


class BestShelterResponse(BaseModel):
    id: int
    name: str
    city: str
    address: Optional[str] = None
    latitude: float
    longitude: float
    distance_meters: int
    estimated_walk_minutes: int
    source: str

    class Config:
        from_attributes = True


class NearbyShelterResponse(BaseModel):
    id: int
    name: str
    city: str
    address: Optional[str] = None
    latitude: float
    longitude: float
    distance_meters: int
    estimated_walk_minutes: int
    source: str

    class Config:
        from_attributes = True
