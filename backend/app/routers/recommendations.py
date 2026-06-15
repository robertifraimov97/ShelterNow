from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.models import Shelter, CommunityShelter

from app.db.database import get_db
from app.db.models import Shelter
from app.schemas.recommendation import (
    BestShelterRequest,
    NearbySheltersRequest,
    BestShelterResponse,
    NearbyShelterResponse,
)
from app.services.shelter_ranking import (
    choose_best_shelter_for_user,
    rank_shelters_for_user,
)

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.post("/best-shelter", response_model=BestShelterResponse)
def get_best_shelter_recommendation(
    request: BestShelterRequest,
    db: Session = Depends(get_db),
):
    shelters = db.query(Shelter).all()

    result = choose_best_shelter_for_user(
        shelters=shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    if not result:
        raise HTTPException(status_code=404, detail="No suitable shelter found")

    shelter = result["shelter"]

    return {
        "id": shelter.id,
        "name": shelter.name,
        "city": shelter.city,
        "address": shelter.address,
        "latitude": shelter.latitude,
        "longitude": shelter.longitude,
        "distance_meters": result["distance_meters"],
        "estimated_walk_minutes": result["estimated_walk_minutes"],
        "source": "Official",
    }


@router.post("/nearby-shelters", response_model=list[NearbyShelterResponse])
def get_nearby_shelters_recommendation(
    request: NearbySheltersRequest,
    db: Session = Depends(get_db),
):
    shelters = db.query(Shelter).all()

    ranked_shelters = rank_shelters_for_user(
        shelters=shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    safe_limit = max(1, min(request.limit, 50))
    top_shelters = ranked_shelters[:safe_limit]

    return [
        {
            "id": item["shelter"].id,
            "name": item["shelter"].name,
            "city": item["shelter"].city,
            "address": item["shelter"].address,
            "latitude": item["shelter"].latitude,
            "longitude": item["shelter"].longitude,
            "distance_meters": item["distance_meters"],
            "estimated_walk_minutes": item["estimated_walk_minutes"],
            "source": "Official",
        }
        for item in top_shelters
    ]
    
@router.post("/best-emergency-shelter", response_model=BestShelterResponse)
def get_best_emergency_shelter_recommendation(
    request: BestShelterRequest,
    db: Session = Depends(get_db),
):
    official_shelters = db.query(Shelter).all()

    community_shelters = (
        db.query(CommunityShelter)
        .filter(
            CommunityShelter.is_active == True,
            CommunityShelter.show_only_during_emergency == True,
            CommunityShelter.latitude.isnot(None),
            CommunityShelter.longitude.isnot(None),
        )
        .all()
    )

    all_shelters = official_shelters + community_shelters

    result = choose_best_shelter_for_user(
        shelters=all_shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    if not result:
        raise HTTPException(status_code=404, detail="No suitable emergency shelter found")

    shelter = result["shelter"]

    source = "Community" if isinstance(shelter, CommunityShelter) else "Official"

    return {
        "id": shelter.id,
        "name": shelter.name,
        "city": shelter.city,
        "address": shelter.address,
        "latitude": shelter.latitude,
        "longitude": shelter.longitude,
        "distance_meters": result["distance_meters"],
        "estimated_walk_minutes": result["estimated_walk_minutes"],
        "source": source,
    }

@router.post("/nearby-emergency-shelters", response_model=list[NearbyShelterResponse])
def get_nearby_emergency_shelters_recommendation(
    request: NearbySheltersRequest,
    db: Session = Depends(get_db),
):
    official_shelters = db.query(Shelter).all()

    community_shelters = (
        db.query(CommunityShelter)
        .filter(
            CommunityShelter.is_active == True,
            CommunityShelter.show_only_during_emergency == True,
            CommunityShelter.latitude.isnot(None),
            CommunityShelter.longitude.isnot(None),
        )
        .all()
    )

    all_shelters = official_shelters + community_shelters

    ranked_shelters = rank_shelters_for_user(
        shelters=all_shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    safe_limit = max(1, min(request.limit, 50))
    top_shelters = ranked_shelters[:safe_limit]

    return [
        {
            "id": item["shelter"].id,
            "name": item["shelter"].name,
            "city": item["shelter"].city,
            "address": item["shelter"].address,
            "latitude": item["shelter"].latitude,
            "longitude": item["shelter"].longitude,
            "distance_meters": item["distance_meters"],
            "estimated_walk_minutes": item["estimated_walk_minutes"],
            "source": "Community"
            if isinstance(item["shelter"], CommunityShelter)
            else "Official",
        }
        for item in top_shelters
    ]
