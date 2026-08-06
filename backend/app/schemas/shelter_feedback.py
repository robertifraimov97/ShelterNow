from datetime import datetime
from pydantic import BaseModel


class ShelterVisitSessionCreate(BaseModel):
    # Shelter chosen by the user when starting navigation.
    shelter_id: int
    shelter_source: str

    # The user's latest available device coordinates. These — not
    # current_city — determine whether an Emergency Context is active and
    # therefore whether a Journey is attached. Optional: if unavailable
    # (e.g. location permission denied), the backend fails closed into
    # normal mode rather than the client fabricating a value. See
    # services/area_inference.py and
    # services/shelter_journey.py:get_or_create_initial_visit_session.
    latitude: float | None = None
    longitude: float | None = None

    # Kept for display/backward compatibility only. NEVER used to decide
    # Emergency Mode, Journey creation, or Community shelter exposure — a
    # client-supplied city string is not a trustworthy security boundary.
    current_city: str | None = None


class ShelterVisitSessionResponse(BaseModel):
    id: int
    user_id: int
    shelter_id: int
    shelter_source: str

    # Nullable: legacy pre-journey sessions have no journey_id.
    journey_id: int | None = None

    route_started_at: datetime
    feedback_prompted: bool
    feedback_submitted: bool
    feedback_prompted_at: datetime | None = None
    feedback_submitted_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ShelterFeedbackCreate(BaseModel):
    # Question 1
    was_open: str

    # Question 2
    was_accessible: str

    # Question 3
    condition_rating: str


class ShelterFeedbackResponse(BaseModel):
    id: int
    user_id: int
    visit_session_id: int
    shelter_id: int
    shelter_source: str
    was_open: str
    was_accessible: str
    condition_rating: str
    created_at: datetime

    class Config:
        from_attributes = True
