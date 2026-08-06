from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.schemas.shelter_journey import (
    AcceptAlternativeRequest,
    AcceptAlternativeResponse,
    AcceptedShelterData,
    ActiveJourneyResponse,
    AlternativePreviewResponse,
    JourneyStatusResponse,
)
from app.services.auth import get_current_user
from app.services.shelter_journey import (
    abandon_journey,
    accept_alternative,
    build_alternative_preview,
    complete_journey,
    get_active_journey_for_user,
)

router = APIRouter(prefix="/shelter-journeys", tags=["Shelter Journeys"])


@router.get("/active", response_model=ActiveJourneyResponse)
def get_active_journey(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Read-only: lets a screen (e.g. Home) check whether the Journey is
    # already the source of truth for the user's destination, instead of
    # recomputing a fresh recommendation and showing stale data. Coordinates
    # are optional — missing/unusable location must never hide an existing
    # Journey, it only limits which capabilities are currently available
    # (see ActiveJourneyResponse.capabilities and the location_unavailable
    # outcome).
    return get_active_journey_for_user(
        db=db,
        current_user=current_user,
        user_latitude=latitude,
        user_longitude=longitude,
    )


@router.get(
    "/{journey_id}/alternative-preview",
    response_model=AlternativePreviewResponse,
)
def get_alternative_preview(
    journey_id: int,
    latitude: float,
    longitude: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Read-only: does not create a Visit Session, does not change the
    # Journey, does not navigate the user.
    return build_alternative_preview(
        db=db,
        journey_id=journey_id,
        current_user=current_user,
        user_latitude=latitude,
        user_longitude=longitude,
    )


@router.post(
    "/{journey_id}/accept-alternative",
    response_model=AcceptAlternativeResponse,
)
def post_accept_alternative(
    journey_id: int,
    request: AcceptAlternativeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # The only endpoint that changes the Journey's active destination.
    visit_session, previous_visit_session_id, shelter_row = accept_alternative(
        db=db,
        journey_id=journey_id,
        current_user=current_user,
        shelter_id=request.shelter_id,
        shelter_source=request.shelter_source,
        user_latitude=request.latitude,
        user_longitude=request.longitude,
    )

    return AcceptAlternativeResponse(
        journey_id=journey_id,
        previous_visit_session_id=previous_visit_session_id,
        visit_session_id=visit_session.id,
        shelter=AcceptedShelterData(
            id=shelter_row.id,
            source=visit_session.shelter_source,
            name=shelter_row.name,
            city=shelter_row.city,
            address=getattr(shelter_row, "address", None),
            latitude=shelter_row.latitude,
            longitude=shelter_row.longitude,
        ),
    )


@router.post("/{journey_id}/complete", response_model=JourneyStatusResponse)
def post_complete_journey(
    journey_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Called when the user confirms successful shelter arrival. Terminal,
    # one-way — an entered journey can never become active again.
    journey = complete_journey(db=db, journey_id=journey_id, current_user=current_user)

    return JourneyStatusResponse(
        journey_id=journey.id,
        status=journey.status,
        ended_at=journey.ended_at,
    )


@router.post("/{journey_id}/abandon", response_model=JourneyStatusResponse)
def post_abandon_journey(
    journey_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Extension point: no frontend screen calls this yet. Terminal, one-way.
    journey = abandon_journey(db=db, journey_id=journey_id, current_user=current_user)

    return JourneyStatusResponse(
        journey_id=journey.id,
        status=journey.status,
        ended_at=journey.ended_at,
    )
