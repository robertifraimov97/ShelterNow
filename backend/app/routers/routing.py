from fastapi import APIRouter, HTTPException

from app.schemas.routing import WalkingRouteRequest, WalkingRouteResponse
from app.services.routing import get_walking_route

router = APIRouter(prefix="/routing", tags=["Routing"])


@router.post("/walking-route", response_model=WalkingRouteResponse)
def get_walking_route_endpoint(request: WalkingRouteRequest):
    result = get_walking_route(
        start_latitude=request.start_latitude,
        start_longitude=request.start_longitude,
        end_latitude=request.end_latitude,
        end_longitude=request.end_longitude,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Walking route not found")

    return result
