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

# Create a router for shelter recommendation-related endpoints.
router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.post("/best-shelter", response_model=BestShelterResponse)
def get_best_shelter_recommendation(
    request: BestShelterRequest,
    db: Session = Depends(get_db),
):
    # Fetch all official shelters from the database.
    shelters = db.query(Shelter).all()

    # Choose the single best shelter for the user's current location.
    result = choose_best_shelter_for_user(
        shelters=shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    # Return 404 if no suitable shelter could be found.
    if not result:
        raise HTTPException(status_code=404, detail="No suitable shelter found")

    # Extract the selected shelter from the ranking result.
    shelter = result["shelter"]

    # Return the best shelter recommendation in the API response format.
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
    # Fetch all official shelters from the database.
    shelters = db.query(Shelter).all()

    # Rank all shelters by suitability for the user's current location.
    ranked_shelters = rank_shelters_for_user(
        shelters=shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    # Clamp the requested result limit to a safe range.
    safe_limit = max(1, min(request.limit, 50))
    top_shelters = ranked_shelters[:safe_limit]

    # Return the closest/best nearby shelters up to the allowed limit.
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
    # Fetch all official shelters.
    official_shelters = db.query(Shelter).all()

    # Fetch active community shelters that should be shown during emergencies
    # and already have usable coordinates.
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

    # Combine official and community shelters into one list for emergency ranking.
    all_shelters = official_shelters + community_shelters

    # Choose the single best shelter for emergency mode.
    result = choose_best_shelter_for_user(
        shelters=all_shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    # Return 404 if no suitable emergency shelter could be found.
    if not result:
        raise HTTPException(status_code=404, detail="No suitable emergency shelter found")

    # Extract the chosen shelter from the ranking result.
    shelter = result["shelter"]

    # Determine whether the selected shelter came from the official or community source.
    source = "Community" if isinstance(shelter, CommunityShelter) else "Official"

    # Return the best emergency shelter recommendation.
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
    # Fetch all official shelters.
    official_shelters = db.query(Shelter).all()

    # Fetch active community shelters that are emergency-only
    # and have valid coordinates.
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

    # Combine all eligible shelters into one list for emergency ranking.
    all_shelters = official_shelters + community_shelters

    # Rank all emergency shelters for the user.
    ranked_shelters = rank_shelters_for_user(
        shelters=all_shelters,
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
    )

    # Clamp the number of returned shelters to a safe range.
    safe_limit = max(1, min(request.limit, 50))
    top_shelters = ranked_shelters[:safe_limit]

    # Return the top-ranked nearby emergency shelters,
    # marking each one by its source type.
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
