from pydantic import BaseModel
from typing import Optional


# Request schema used when creating a new community shelter.
class CommunityShelterCreate(BaseModel):
    # Basic shelter information provided by the user.
    name: str
    city: str
    address: str

    # Optional extra notes about the shelter.
    notes: Optional[str] = None

    # Indicates whether the shelter is accessible.
    is_accessible: bool = False


# Response schema returned for community shelter endpoints.
class CommunityShelterResponse(BaseModel):
    # Unique shelter identifier.
    id: int

    # Basic shelter information.
    name: str
    city: str
    address: str

    # Optional geographic coordinates for map and navigation usage.
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Optional notes and shelter flags.
    notes: Optional[str] = None
    is_accessible: bool
    is_active: bool
    show_only_during_emergency: bool

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True
