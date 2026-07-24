from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session


from app.schemas.shelter_feedback_summary import ShelterFeedbackSummaryResponse

from app.db.database import get_db
from app.db.models import ShelterVisitSession, ShelterFeedback, User
from app.schemas.shelter_feedback import (
    ShelterVisitSessionCreate,
    ShelterVisitSessionResponse,
    ShelterFeedbackCreate,
    ShelterFeedbackResponse,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/shelter-feedback", tags=["Shelter Feedback"])

# Prevent creating duplicate open visit sessions for the same user and shelter
# within a short time window during repeated tests or repeated button presses.
SESSION_REUSE_WINDOW_MINUTES = 30


@router.post("/visit-sessions", response_model=ShelterVisitSessionResponse)
def create_visit_session(
    request: ShelterVisitSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = datetime.utcnow()
    reuse_threshold = now - timedelta(minutes=SESSION_REUSE_WINDOW_MINUTES)

    # Reuse an existing open visit session for the same shelter if it was
    # created recently and feedback has not yet been submitted.
    existing_open_session = (
        db.query(ShelterVisitSession)
        .filter(
            ShelterVisitSession.user_id == current_user.id,
            ShelterVisitSession.shelter_id == request.shelter_id,
            ShelterVisitSession.shelter_source == request.shelter_source,
            ShelterVisitSession.feedback_submitted == False,
            ShelterVisitSession.route_started_at >= reuse_threshold,
        )
        .order_by(ShelterVisitSession.route_started_at.desc())
        .first()
    )

    if existing_open_session:
        return existing_open_session

    # Create a new visit session when no suitable open session exists.
    visit_session = ShelterVisitSession(
        user_id=current_user.id,
        shelter_id=request.shelter_id,
        shelter_source=request.shelter_source,
    )

    db.add(visit_session)
    db.commit()
    db.refresh(visit_session)

    return visit_session


@router.post(
    "/visit-sessions/{visit_session_id}/submit",
    response_model=ShelterFeedbackResponse,
)
def submit_shelter_feedback(
    visit_session_id: int,
    request: ShelterFeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load the visit session and make sure it belongs to the current user.
    visit_session = (
        db.query(ShelterVisitSession)
        .filter(
            ShelterVisitSession.id == visit_session_id,
            ShelterVisitSession.user_id == current_user.id,
        )
        .first()
    )

    if not visit_session:
        raise HTTPException(status_code=404, detail="Visit session not found")

    if visit_session.feedback_submitted:
        raise HTTPException(
            status_code=400,
            detail="Feedback already submitted",
        )

    allowed_open_values = {"yes", "partial", "no"}
    allowed_accessible_values = {"yes", "partial", "no", "unknown"}
    allowed_condition_values = {"good", "okay", "poor"}

    # Validate answer values to keep analytics clean and consistent.
    if request.was_open not in allowed_open_values:
        raise HTTPException(
            status_code=400,
            detail="Invalid value for was_open",
        )

    if request.was_accessible not in allowed_accessible_values:
        raise HTTPException(
            status_code=400,
            detail="Invalid value for was_accessible",
        )

    if request.condition_rating not in allowed_condition_values:
        raise HTTPException(
            status_code=400,
            detail="Invalid value for condition_rating",
        )

    # Save the feedback entry.
    feedback = ShelterFeedback(
        user_id=current_user.id,
        visit_session_id=visit_session.id,
        shelter_id=visit_session.shelter_id,
        shelter_source=visit_session.shelter_source,
        was_open=request.was_open,
        was_accessible=request.was_accessible,
        condition_rating=request.condition_rating,
    )

    db.add(feedback)

    # Mark the visit session as fully completed.
    visit_session.feedback_prompted = True
    visit_session.feedback_submitted = True
    visit_session.feedback_submitted_at = datetime.utcnow()

    db.commit()
    db.refresh(feedback)

    return feedback


@router.get(
    "/summary/{shelter_source}/{shelter_id}",
    response_model=ShelterFeedbackSummaryResponse,
)
def get_shelter_feedback_summary(
    shelter_source: str,
    shelter_id: int,
    db: Session = Depends(get_db),
):
    # Load all feedback rows for the requested shelter.
    feedback_items = (
        db.query(ShelterFeedback)
        .filter(
            ShelterFeedback.shelter_id == shelter_id,
            ShelterFeedback.shelter_source == shelter_source,
        )
        .all()
    )

    total_feedback_count = len(feedback_items)

    # Return an empty summary when the shelter has no feedback yet.
    if total_feedback_count == 0:
        return ShelterFeedbackSummaryResponse(
            shelter_id=shelter_id,
            shelter_source=shelter_source,
            total_feedback_count=0,
            open_yes_count=0,
            open_partial_count=0,
            open_no_count=0,
            recent_open_yes_count=0,
            recent_open_partial_count=0,
            recent_open_no_count=0,
            last_feedback_at=None,
            accessible_yes_count=0,
            accessible_partial_count=0,
            accessible_no_count=0,
            accessible_unknown_count=0,
            condition_good_count=0,
            condition_okay_count=0,
            condition_poor_count=0,
            reliability_score=0.0,
            summary_label="No feedback yet",
        )

    # Count all historical openness feedback.
    open_yes_count = sum(
        1 for item in feedback_items if item.was_open == "yes"
    )
    open_partial_count = sum(
        1 for item in feedback_items if item.was_open == "partial"
    )
    open_no_count = sum(
        1 for item in feedback_items if item.was_open == "no"
    )

    # Open status can change quickly, so recommendation logic should use
    # feedback submitted during the last 24 hours.
    recent_feedback_threshold = datetime.utcnow() - timedelta(hours=24)

    recent_feedback_items = [
        item
        for item in feedback_items
        if item.created_at and item.created_at >= recent_feedback_threshold
    ]

    recent_open_yes_count = sum(
        1 for item in recent_feedback_items if item.was_open == "yes"
    )
    recent_open_partial_count = sum(
        1 for item in recent_feedback_items if item.was_open == "partial"
    )
    recent_open_no_count = sum(
        1 for item in recent_feedback_items if item.was_open == "no"
    )

    # Store the newest feedback timestamp so the frontend can show
    # how fresh the available information is.
    last_feedback_at = max(
        item.created_at
        for item in feedback_items
        if item.created_at is not None
    )

    accessible_yes_count = sum(
        1 for item in feedback_items if item.was_accessible == "yes"
    )
    accessible_partial_count = sum(
        1 for item in feedback_items if item.was_accessible == "partial"
    )
    accessible_no_count = sum(
        1 for item in feedback_items if item.was_accessible == "no"
    )
    accessible_unknown_count = sum(
        1 for item in feedback_items if item.was_accessible == "unknown"
    )

    condition_good_count = sum(
        1 for item in feedback_items if item.condition_rating == "good"
    )
    condition_okay_count = sum(
        1 for item in feedback_items if item.condition_rating == "okay"
    )
    condition_poor_count = sum(
        1 for item in feedback_items if item.condition_rating == "poor"
    )

    # Simple weighted scoring model:
    # - openness has the highest impact
    # - accessibility has medium impact
    # - condition has medium impact
    open_score = (
        (open_yes_count * 1.0)
        + (open_partial_count * 0.5)
        + (open_no_count * 0.0)
    ) / total_feedback_count

    accessibility_score = (
        (accessible_yes_count * 1.0)
        + (accessible_partial_count * 0.5)
        + (accessible_no_count * 0.0)
        + (accessible_unknown_count * 0.25)
    ) / total_feedback_count

    condition_score = (
        (condition_good_count * 1.0)
        + (condition_okay_count * 0.6)
        + (condition_poor_count * 0.0)
    ) / total_feedback_count

    # Final score in a 0-100 range.
    reliability_score = round(
        (
            (open_score * 0.45)
            + (accessibility_score * 0.25)
            + (condition_score * 0.30)
        )
        * 100,
        1,
    )

    # Map the numeric score into a short label for the UI.
    if reliability_score >= 80:
        summary_label = "Highly reliable"
    elif reliability_score >= 60:
        summary_label = "Generally reliable"
    elif reliability_score >= 40:
        summary_label = "Mixed feedback"
    else:
        summary_label = "Needs verification"

    return ShelterFeedbackSummaryResponse(
        shelter_id=shelter_id,
        shelter_source=shelter_source,
        total_feedback_count=total_feedback_count,
        open_yes_count=open_yes_count,
        open_partial_count=open_partial_count,
        open_no_count=open_no_count,
        recent_open_yes_count=recent_open_yes_count,
        recent_open_partial_count=recent_open_partial_count,
        recent_open_no_count=recent_open_no_count,
        last_feedback_at=last_feedback_at,
        accessible_yes_count=accessible_yes_count,
        accessible_partial_count=accessible_partial_count,
        accessible_no_count=accessible_no_count,
        accessible_unknown_count=accessible_unknown_count,
        condition_good_count=condition_good_count,
        condition_okay_count=condition_okay_count,
        condition_poor_count=condition_poor_count,
        reliability_score=reliability_score,
        summary_label=summary_label,
    )
