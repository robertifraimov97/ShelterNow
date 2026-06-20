from pydantic import BaseModel


# Request schema for asking the backend to calculate a walking route
# between a start location and an end location.
class WalkingRouteRequest(BaseModel):
    # Starting point latitude.
    start_latitude: float

    # Starting point longitude.
    start_longitude: float

    # Destination latitude.
    end_latitude: float

    # Destination longitude.
    end_longitude: float


# Represents a single coordinate point along the returned route path.
class RoutePoint(BaseModel):
    # Point latitude.
    latitude: float

    # Point longitude.
    longitude: float


# Represents one navigation instruction along the walking route.
class RouteInstruction(BaseModel):
    # Human-readable navigation instruction.
    instruction: str

    # Distance covered by this instruction segment in meters.
    distance_meters: float

    # Estimated duration for this instruction segment in seconds.
    duration_seconds: float


# Response schema returned after calculating a walking route.
class WalkingRouteResponse(BaseModel):
    # Total route distance in meters.
    distance_meters: float

    # Total route duration in seconds.
    duration_seconds: float

    # Full list of coordinate points that describe the route geometry.
    route_coordinates: list[RoutePoint]

    # Step-by-step navigation instructions for the route.
    instructions: list[RouteInstruction]
