from pydantic import BaseModel


class WalkingRouteRequest(BaseModel):
    start_latitude: float
    start_longitude: float
    end_latitude: float
    end_longitude: float


class RoutePoint(BaseModel):
    latitude: float
    longitude: float


class RouteInstruction(BaseModel):
    instruction: str
    distance_meters: float
    duration_seconds: float


class WalkingRouteResponse(BaseModel):
    distance_meters: float
    duration_seconds: float
    route_coordinates: list[RoutePoint]
    instructions: list[RouteInstruction]
