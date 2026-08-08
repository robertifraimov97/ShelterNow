from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import (
    Shelter,
    CommunityShelter,
    ShelterFeedback,
    User,
)
from app.schemas.recommendation import (
    BestShelterRequest,
    NearbySheltersRequest,
    BestShelterResponse,
    NearbyShelterResponse,
)
from app.services.area_inference import (
    _debug_trace,
    get_active_emergency_state,
    get_eligible_community_shelters,
)
from app.services.auth import get_current_user
from app.services.shelter_decision_engine import (
    build_emergency_recommendation_bundle,
)
from app.services.shelter_ranking import (
    choose_best_shelter_for_user,
    rank_shelters_for_user,
)


router = APIRouter(
    prefix="/recommendations",
    tags=["Recommendations"],
)


@router.post(
    "/best-shelter",
    response_model=BestShelterResponse,
)
def get_best_shelter_recommendation(
    request: BestShelterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Normal mode uses official shelters only.
    official_shelters = db.query(Shelter).all()

    # Feedback is used for open status and accessibility.
    feedback_items = db.query(ShelterFeedback).all()

    mobility_status = (
        current_user.mobility_status
        or "regular"
    ).strip().lower()

    prefer_accessible = bool(
        current_user.prefer_accessible_route
        or mobility_status != "regular"
    )

    result = build_emergency_recommendation_bundle(
        official_shelters=official_shelters,
        community_shelters=[],
        user_latitude=request.user_latitude,
        user_longitude=request.user_longitude,
        event_type=None,
        feedback_items=feedback_items,
        prefer_accessible=prefer_accessible,
    )

    primary = result["primary"]

    if not primary:
        raise HTTPException(
            status_code=404,
            detail="No suitable shelter found",
        )

    return {
        "id": primary["id"],
        "name": primary["name"],
        "city": primary["city"],
        "address": primary["address"],
        "latitude": primary["latitude"],
        "longitude": primary["longitude"],
        "distance_meters": primary["distance_meters"],
        "estimated_walk_minutes": primary[
            "estimated_walk_minutes"
        ],
        "source": "Official",
        "recommendation_reason": result[
        "recommendation_reason"
    ],
    }


@router.post(
    "/nearby-shelters",
    response_model=list[NearbyShelterResponse],
)
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

    safe_limit = max(
        1,
        min(request.limit, 50),
    )

    top_shelters = ranked_shelters[
        :safe_limit
    ]

    return [
        {
            "id": item["shelter"].id,
            "name": item["shelter"].name,
            "city": item["shelter"].city,
            "address": item["shelter"].address,
            "latitude": item["shelter"].latitude,
            "longitude": item["shelter"].longitude,
            "distance_meters": item["distance_meters"],
            "estimated_walk_minutes": item[
                "estimated_walk_minutes"
            ],
            "source": "Official",
        }
        for item in top_shelters
    ]


@router.post(
    "/best-emergency-shelter",
    response_model=BestShelterResponse,
)
def get_best_emergency_shelter_recommendation(
    request: BestShelterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Official shelters are always available as candidates.
    official_shelters = (
        db.query(Shelter).all()
    )

    # Community shelters are available only during
    # an active emergency context.
    active_emergency_state = (
        get_active_emergency_state(
            db,
            request.user_latitude,
            request.user_longitude,
        )
    )

    community_shelters = (
        get_eligible_community_shelters(db)
        if active_emergency_state
        else []
    )

    # Feedback is used by the decision engine for
    # current open status and accessibility information.
    feedback_items = (
        db.query(ShelterFeedback).all()
    )

    mobility_status = (
        current_user.mobility_status
        or "regular"
    ).strip().lower()

    prefer_accessible = bool(
        current_user.prefer_accessible_route
        or mobility_status != "regular"
    )

    event_type = (
        active_emergency_state.last_event_type
        if active_emergency_state
        else None
    )

    result = (
        build_emergency_recommendation_bundle(
            official_shelters=official_shelters,
            community_shelters=community_shelters,
            user_latitude=request.user_latitude,
            user_longitude=request.user_longitude,
            event_type=event_type,
            feedback_items=feedback_items,
            prefer_accessible=prefer_accessible,
        )
    )

    primary = result["primary"]

    if not primary:
        raise HTTPException(
            status_code=404,
            detail=(
                "No suitable emergency shelter found"
            ),
        )

    # Keep the existing API source format.
    source = (
        "Community"
        if primary["source"] == "community"
        else "Official"
    )

    # Keep the existing BestShelterResponse contract.
    return {
        "id": primary["id"],
        "name": primary["name"],
        "city": primary["city"],
        "address": primary["address"],
        "latitude": primary["latitude"],
        "longitude": primary["longitude"],
        "distance_meters": primary[
            "distance_meters"
        ],
        "estimated_walk_minutes": primary[
            "estimated_walk_minutes"
        ],
        "source": source,
        "recommendation_reason": result[
        "recommendation_reason"
        ],
    }


@router.post(
    "/nearby-emergency-shelters",
    response_model=list[NearbyShelterResponse],
)
def get_nearby_emergency_shelters_recommendation(
    request: NearbySheltersRequest,
    db: Session = Depends(get_db),
):
    official_shelters = (
        db.query(Shelter).all()
    )

    active_emergency_state = (
        get_active_emergency_state(
            db,
            request.user_latitude,
            request.user_longitude,
        )
    )

    community_shelters = (
        get_eligible_community_shelters(db)
        if active_emergency_state
        else []
    )

    _debug_trace(
        "nearby_emergency_shelters_pool",
        latitude=request.user_latitude,
        longitude=request.user_longitude,
        official_count=len(
            official_shelters
        ),
        community_count=len(
            community_shelters
        ),
    )

    all_shelters = (
        official_shelters
        + community_shelters
    )

    ranked_shelters = (
        rank_shelters_for_user(
            shelters=all_shelters,
            user_latitude=request.user_latitude,
            user_longitude=request.user_longitude,
        )
    )

    safe_limit = max(
        1,
        min(request.limit, 50),
    )

    top_shelters = ranked_shelters[
        :safe_limit
    ]

    _debug_trace(
        "nearby_emergency_shelters_result",
        top_5=[
            (
                (
                    "Community"
                    if isinstance(
                        item["shelter"],
                        CommunityShelter,
                    )
                    else "Official"
                ),
                item["distance_meters"],
            )
            for item in top_shelters[:5]
        ],
    )

    return [
        {
            "id": item["shelter"].id,
            "name": item["shelter"].name,
            "city": item["shelter"].city,
            "address": item["shelter"].address,
            "latitude": item["shelter"].latitude,
            "longitude": item["shelter"].longitude,
            "distance_meters": item[
                "distance_meters"
            ],
            "estimated_walk_minutes": item[
                "estimated_walk_minutes"
            ],
            "source": (
                "Community"
                if isinstance(
                    item["shelter"],
                    CommunityShelter,
                )
                else "Official"
            ),
        }
        for item in top_shelters
    ]
