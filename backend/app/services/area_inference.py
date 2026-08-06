"""
Server-side area inference from device coordinates.

Security note:
current_city (a client-supplied free-text string) must never be trusted for
any security/privacy decision — a client can set it to any string, including
one that currently has an active Emergency Context, regardless of where the
device actually is. The only inputs trusted here are the request's own
latitude/longitude, matched against official Shelter records already
curated in our own database.

Each official Shelter was geocoded once, offline, at data-import time (see
app/services/geocoding.py and the import scripts under app/scripts/) — that
work is already paid for. This module deliberately adds no live external
geocoding call to the emergency request path; it only re-uses data and
Haversine distance calculations already present in this codebase.

CommunityShelter is deliberately never used for this inference: its city
field is user-submitted, not curated/authoritative, and using it here would
reintroduce an indirect version of the same trust problem this module exists
to close.
"""

from collections import Counter
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.db.models import CommunityShelter, EmergencyAccessState, Shelter
from app.services.alert_matching import area_matches_city, normalize_area_name
from app.services.emergency_access import is_emergency_access_active
from app.services.shelter_ranking import calculate_distance_meters

# TEMP DIAGNOSTIC LOGGING -- to be removed after the Home-vs-Alternative
# candidate-pool diagnosis is confirmed. Writes to a plain file (not the
# app logger) so it can be read back directly regardless of how uvicorn's
# stdout is captured.
_DEBUG_TRACE_PATH = r"C:\Users\Ran\projects\ShelterNow\backend\debug_trace_temp.log"


def _debug_trace(label: str, **fields) -> None:
    try:
        with open(_DEBUG_TRACE_PATH, "a", encoding="utf-8") as f:
            f.write(f"{datetime.utcnow().isoformat()} | {label} | {fields}\n")
    except Exception:
        pass

# How many of the nearest official shelters to sample when inferring area.
NEAREST_SHELTER_SAMPLE_SIZE = 3

# At least this many of the sampled shelters must agree on the normalized
# city before the inference is trusted.
AREA_INFERENCE_MIN_AGREEMENT_COUNT = 2

# The single nearest official shelter must be within this distance for the
# inference to be attempted at all.
#
# Why 2000 meters, and why deliberately conservative (tight):
# A false negative here (failing to infer a city) just falls back to normal
# mode — safe, private, and explicitly acceptable per product decision. A
# false positive (inferring the wrong city) would incorrectly unlock
# Community shelter exposure for someone who isn't really in an affected
# area, which is exactly the outcome this module exists to prevent. Official
# shelters in Israeli cities are typically dense in the areas already
# imported into this dataset (Tel Aviv, Ramat Gan, Givatayim, Herzliya,
# Haifa, Jerusalem, Be'er Sheva, and others — see backend/data/), so 2km
# comfortably covers a user genuinely inside one of those cities, while
# staying well short of a distance that could plausibly span into a
# neighboring city or region. This constant is deliberately isolated so it
# can be tuned from real-world false-negative telemetry later without
# touching the decision logic itself.
AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS = 2000


def infer_area_name_from_shelter_samples(
    nearest_shelter_distances: list[tuple[float, str]]
) -> Optional[str]:
    """Pure decision logic — no I/O, unit-testable without a database.

    Expects nearest_shelter_distances already sorted ascending by distance,
    as (distance_meters, city) tuples. Only the first
    NEAREST_SHELTER_SAMPLE_SIZE entries are considered. Notably, this
    function has no "claimed city" input at all — there is nothing for a
    client-supplied city string to influence here, by construction.
    """
    sample = nearest_shelter_distances[:NEAREST_SHELTER_SAMPLE_SIZE]

    if not sample:
        return None

    nearest_distance = sample[0][0]

    if nearest_distance > AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS:
        return None

    normalized_cities = [normalize_area_name(city) for _, city in sample]
    normalized_cities = [city for city in normalized_cities if city]

    if not normalized_cities:
        return None

    top_city, top_count = Counter(normalized_cities).most_common(1)[0]

    if top_count >= AREA_INFERENCE_MIN_AGREEMENT_COUNT:
        return top_city

    return None


def infer_area_name_from_coordinates(
    db: Session, latitude: float, longitude: float
) -> Optional[str]:
    """Derives a normalized city name from coordinates using ONLY official
    Shelter records. No external service call — reuses calculate_distance_meters,
    the same Haversine function already used throughout the ranking layer.
    """
    official_shelters = db.query(Shelter).all()

    if not official_shelters:
        return None

    distances_with_city = sorted(
        (
            (
                calculate_distance_meters(
                    latitude, longitude, shelter.latitude, shelter.longitude
                ),
                shelter.city,
            )
            for shelter in official_shelters
        ),
        key=lambda item: item[0],
    )

    return infer_area_name_from_shelter_samples(distances_with_city)


def find_matching_emergency_state(
    db: Session, normalized_city: str
) -> Optional[EmergencyAccessState]:
    """Matches an already-normalized city against every currently-unexpired
    EmergencyAccessState using the existing area_matches_city() matching
    layer — never raw string equality. EmergencyAccessState.area_name stores
    unnormalized Home Front Command alert-area strings (e.g. "תל אביב - מרכז
    העיר"), which area_matches_city()/normalize_area_name() already know how
    to reconcile against a canonical city name.
    """
    if not normalized_city:
        return None

    candidate_states = (
        db.query(EmergencyAccessState)
        .filter(EmergencyAccessState.expires_at > datetime.utcnow())
        .all()
    )

    for state in candidate_states:
        if area_matches_city(state.area_name, normalized_city):
            return state

    return None


def get_eligible_community_shelters(db: Session) -> list[CommunityShelter]:
    """The single, centralized Community-shelter candidate-pool filter:
    active, emergency-only-flagged, and geocoded. This is deliberately just
    the pool definition — it carries no authorization logic of its own.

    Every backend path that can return Community shelters (initial emergency
    recommendation, Alternative Preview, Accept-alternative revalidation,
    /community-shelters/emergency, and any future one) must call this same
    function, gated behind the SAME check — get_active_emergency_state(db,
    <that path's own current coordinates>) — rather than each maintaining
    its own copy of this filter or its own gating logic. This is what
    guarantees the pool is identical across those paths for the same
    coordinates and context, not just similar by convention.
    """
    return (
        db.query(CommunityShelter)
        .filter(
            CommunityShelter.is_active == True,
            CommunityShelter.show_only_during_emergency == True,
            CommunityShelter.latitude.isnot(None),
            CommunityShelter.longitude.isnot(None),
        )
        .all()
    )


def get_active_emergency_state(
    db: Session, latitude: Optional[float], longitude: Optional[float]
) -> Optional[EmergencyAccessState]:
    """The single entry point every endpoint must use to decide whether the
    user's real, coordinate-derived area is under an active Emergency
    Context.

    Deliberately takes only latitude/longitude — there is no area_name or
    current_city parameter here at all, so a client-claimed city string
    structurally cannot influence this decision.
    """
    if latitude is None or longitude is None:
        _debug_trace(
            "get_active_emergency_state",
            latitude=latitude,
            longitude=longitude,
            inferred_city=None,
            matched_area=None,
            is_active=False,
            reason="no_coordinates",
        )
        return None

    inferred_city = infer_area_name_from_coordinates(db, latitude, longitude)

    if not inferred_city:
        _debug_trace(
            "get_active_emergency_state",
            latitude=latitude,
            longitude=longitude,
            inferred_city=None,
            matched_area=None,
            is_active=False,
            reason="uncertain_inference",
        )
        return None

    state = find_matching_emergency_state(db, inferred_city)
    is_active = bool(state and is_emergency_access_active(state))

    _debug_trace(
        "get_active_emergency_state",
        latitude=latitude,
        longitude=longitude,
        inferred_city=inferred_city,
        matched_area=(state.area_name if state else None),
        is_active=is_active,
        reason="ok",
    )

    if is_active:
        return state

    return None
