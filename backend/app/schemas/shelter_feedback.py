from datetime import datetime
from pydantic import BaseModel


class ShelterVisitSessionCreate(BaseModel):
    # Shelter chosen by the user when starting navigation.
    shelter_id: int
    shelter_source: str


class ShelterVisitSessionResponse(BaseModel):
    id: int
    user_id: int
    shelter_id: int
    shelter_source: str
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
