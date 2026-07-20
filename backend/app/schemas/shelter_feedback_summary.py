from pydantic import BaseModel


class ShelterFeedbackSummaryResponse(BaseModel):
    shelter_id: int
    shelter_source: str
    total_feedback_count: int

    open_yes_count: int
    open_partial_count: int
    open_no_count: int

    accessible_yes_count: int
    accessible_partial_count: int
    accessible_no_count: int
    accessible_unknown_count: int

    condition_good_count: int
    condition_okay_count: int
    condition_poor_count: int

    # A simple score from 0 to 100 based on user feedback.
    reliability_score: float

    # Human-readable summary label for fast UI display.
    summary_label: str
