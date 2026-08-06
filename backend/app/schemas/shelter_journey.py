from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class CurrentShelterPreview(BaseModel):
    id: int
    source: str
    name: str

    # Estimates only: straight-line (Haversine) distance and the existing
    # 80m/min walking heuristic — not a routed walking distance or exact
    # travel time.
    estimated_distance_meters: int
    estimated_walk_minutes: int


class RecommendedAlternativeShelter(BaseModel):
    id: int
    source: str
    name: str
    latitude: float
    longitude: float

    # Estimates only — see CurrentShelterPreview.
    estimated_distance_meters: int
    estimated_walk_minutes: int


class AlternativeComparison(BaseModel):
    # Estimates only — derived from the same estimated values above.
    additional_estimated_distance_meters: int
    additional_estimated_walk_minutes: int


class AlternativePreviewResponse(BaseModel):
    journey_id: int
    current_visit_session_id: int
    current_shelter: CurrentShelterPreview
    alternative_available: bool
    recommended_alternative: Optional[RecommendedAlternativeShelter] = None
    comparison: Optional[AlternativeComparison] = None


class AcceptAlternativeRequest(BaseModel):
    shelter_id: int
    shelter_source: str

    # Required so the backend can recompute the ranking and confirm the
    # requested shelter still matches the current top recommendation before
    # accepting it (see accept_alternative's stale-preview check).
    latitude: float
    longitude: float


class AcceptedShelterData(BaseModel):
    id: int
    source: str
    name: str
    city: str
    address: Optional[str] = None
    latitude: float
    longitude: float


class AcceptAlternativeResponse(BaseModel):
    journey_id: int
    previous_visit_session_id: Optional[int] = None
    visit_session_id: int
    shelter: AcceptedShelterData


class ActiveJourneyShelter(BaseModel):
    id: int
    source: str
    name: str
    city: str
    address: Optional[str] = None
    latitude: float
    longitude: float

    # Estimates only — see CurrentShelterPreview. Optional: computable only
    # when the request supplied usable coordinates (null under
    # location_unavailable caused by missing coordinates; still populated
    # under location_unavailable caused by uncertain area inference, since
    # that only means the city couldn't be confidently named, not that the
    # raw coordinates are unusable for a Haversine distance).
    estimated_distance_meters: Optional[int] = None
    estimated_walk_minutes: Optional[int] = None


# Deliberately excludes "area_mismatch": a Journey is not fixed to the
# coordinates/city/area where it was created, so moving to a different area
# is never by itself a reason to flag or hide it. See
# shelter_journey.determine_active_journey_outcome for the full rationale.
ActiveJourneyOutcome = Literal["applicable", "location_unavailable", "no_active_journey"]


class ActiveJourneyCapabilities(BaseModel):
    # Whether the previously-accepted destination may still be displayed and
    # navigated to. True for both "applicable" and "location_unavailable" —
    # only false when there is no Journey to continue at all.
    can_continue_current_navigation: bool

    # Both of the following depend ONLY on the CURRENT request's own
    # coordinates resolving to a verified, live EmergencyAccessState — never
    # on the Journey's original creation-time area. Both are false whenever
    # location is unavailable/uncertain (fail closed) and whenever the
    # current area confidently resolves but has no active emergency window.
    can_request_alternative: bool
    can_expose_community: bool


class ActiveJourneyResponse(BaseModel):
    outcome: ActiveJourneyOutcome

    # Backward-compatible convenience field for existing callers: true
    # whenever there is a Journey to display, i.e. outcome != "no_active_journey"
    # (equivalent to capabilities.can_continue_current_navigation). Existing
    # frontend code that only checks this boolean already does the right
    # thing under location_unavailable — it keeps showing the accepted
    # destination — without needing to read the new fields.
    has_active_journey: bool

    journey_id: Optional[int] = None
    visit_session_id: Optional[int] = None
    shelter: Optional[ActiveJourneyShelter] = None
    capabilities: ActiveJourneyCapabilities


class JourneyStatusResponse(BaseModel):
    journey_id: int
    status: str
    ended_at: Optional[datetime] = None
