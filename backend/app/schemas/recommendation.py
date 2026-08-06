from pydantic import BaseModel
from typing import Optional


# Request schema for finding the single best shelter for the user's location.
class BestShelterRequest(BaseModel):
    # User's current latitude.
    user_latitude: float

    # User's current longitude.
    user_longitude: float

    # Kept for display/backward compatibility only. NEVER used to decide
    # Emergency Mode or Community shelter exposure — that decision is
    # derived server-side from user_latitude/user_longitude alone. See
    # app/services/area_inference.py.
    current_city: Optional[str] = None


# Request schema for finding multiple nearby shelters for the user's location.
class NearbySheltersRequest(BaseModel):
    # User's current latitude.
    user_latitude: float

    # User's current longitude.
    user_longitude: float

    # Maximum number of shelters to return.
    limit: int = 3

    # Kept for display/backward compatibility only. NEVER used to decide
    # Emergency Mode or Community shelter exposure — a client-supplied city
    # string is not a trustworthy security boundary. That decision is
    # derived server-side from user_latitude/user_longitude alone. See
    # app/services/area_inference.py.
    current_city: Optional[str] = None


# Response schema for the best shelter recommendation endpoint.
class BestShelterResponse(BaseModel):
    # Unique shelter identifier.
    id: int

    # Basic shelter details.
    name: str
    city: str
    address: Optional[str] = None

    # Shelter geographic coordinates.
    latitude: float
    longitude: float

    # Calculated distance from the user to the shelter in meters.
    distance_meters: int

    # Estimated walking time to the shelter in minutes.
    estimated_walk_minutes: int

    # Indicates whether the shelter came from an official or community source.
    source: str

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True


# Response schema for endpoints that return a list of nearby shelters.
class NearbyShelterResponse(BaseModel):
    # Unique shelter identifier.
    id: int

    # Basic shelter details.
    name: str
    city: str
    address: Optional[str] = None

    # Shelter geographic coordinates.
    latitude: float
    longitude: float

    # Calculated distance from the user to the shelter in meters.
    distance_meters: int

    # Estimated walking time to the shelter in minutes.
    estimated_walk_minutes: int

    # Indicates whether the shelter came from an official or community source.
    source: str

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True
