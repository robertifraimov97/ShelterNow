import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import (
    CommunityShelter,
    EmergencyAccessState,
    Shelter,
    ShelterJourney,
    ShelterVisitSession,
    User,
)
from app.services.area_inference import (
    _debug_trace,
    find_matching_emergency_state,
    get_active_emergency_state,
    get_eligible_community_shelters,
    infer_area_name_from_coordinates,
)
from app.services.emergency_access import is_emergency_access_active
from app.services.shelter_ranking import calculate_distance_meters, estimate_walk_minutes, rank_shelters_for_user

logger = logging.getLogger(__name__)

# Prevent creating duplicate open visit sessions for the same user and shelter
# within a short time window during repeated tests or repeated button presses.
# Only relevant to starting a brand-new journey (see get_or_create_initial_visit_session).
SESSION_REUSE_WINDOW_MINUTES = 30

# How many ranked candidates to request when looking for an alternative.
# Kept generous so there is still something left after excluding every
# shelter already attempted in a journey.
ALTERNATIVE_CANDIDATE_LIMIT = 20


def normalize_shelter_source(source: str) -> str:
    """Normalizes a shelter source string for storage and comparison.

    The frontend already lower-cases this value before sending it, but the
    ranking/recommendation layer labels sources with a capital letter
    ("Official"/"Community"). Every place that compares or stores a shelter
    source must go through this function first.
    """
    return (source or "").strip().lower()


def build_shelter_key(source: str, shelter_id: int) -> str:
    """Builds the identity key used to track attempted shelters within a
    journey: normalized source + id, since shelter ids are not unique across
    sources (an Official shelter and a Community shelter can share an id).
    """
    return f"{normalize_shelter_source(source)}:{shelter_id}"


# get_active_emergency_state now lives in app.services.area_inference,
# imported above. It takes latitude/longitude (never a client-supplied
# area_name/current_city string) — see that module for the security
# rationale.


def _maybe_expire_journey(db: Session, journey: ShelterJourney) -> ShelterJourney:
    """Lazily transitions an 'active' journey to 'expired' if it can no
    longer be verified as belonging to a live Emergency Context. Called at
    the top of every path that reads or mutates a journey, since this
    project has no background scheduler.

    - A journey with NO linked emergency context (emergency_access_state_id
      IS NULL) is expired immediately, never left alone. This used to be
      treated as "legacy, leave it untouched" — that was a real bug: an
      active journey with no linked context can never be evaluated for
      liveness by the check below, so it would stay 'active' forever,
      surviving indefinitely across app/server restarts, and would keep
      being reused, displayed on Home, and treated as authorizing
      Alternative/Community operations. This is a data-compatibility fix,
      not an EmergencyAccessState resurrection — it never creates, reads,
      or reactivates any EmergencyAccessState row.
    - Otherwise, the check is against the *current* state row (a live
      join), not a snapshot taken at journey-creation time. This is
      intentional: if a fresh relevant alert extends the same area's
      window while this journey is still active, the journey must keep
      going, not close just because the original 900 seconds were about
      to elapse.
    - Expiry is one-way. Once a journey is 'expired' it can never become
      'active' again, even if the linked area's state is later extended by
      an unrelated, later alert — that must always produce a brand-new
      journey, never a revived one.
    """
    if journey.status != "active":
        return journey

    if not journey.emergency_access_state_id:
        journey.status = "expired"
        journey.ended_at = datetime.utcnow()
        db.commit()
        db.refresh(journey)
        return journey

    state = (
        db.query(EmergencyAccessState)
        .filter(EmergencyAccessState.id == journey.emergency_access_state_id)
        .first()
    )

    if not state or not is_emergency_access_active(state):
        journey.status = "expired"
        journey.ended_at = datetime.utcnow()
        db.commit()
        db.refresh(journey)

    return journey


def get_shelter_by_source_and_id(
    db: Session, source: str, shelter_id: int
):
    """Looks up the underlying shelter row (Official or Community) for a
    normalized source + id pair. Returns None if it no longer exists.
    """
    normalized_source = normalize_shelter_source(source)

    if normalized_source == "community":
        return db.query(CommunityShelter).filter(CommunityShelter.id == shelter_id).first()

    return db.query(Shelter).filter(Shelter.id == shelter_id).first()


def get_attempted_shelter_keys(db: Session, journey_id: int) -> set[str]:
    """Loads every shelter already attempted in a journey, straight from the
    database. This is the source of truth for exclusion — never route params,
    never client-supplied lists.
    """
    rows = (
        db.query(ShelterVisitSession.shelter_source, ShelterVisitSession.shelter_id)
        .filter(ShelterVisitSession.journey_id == journey_id)
        .all()
    )

    return {build_shelter_key(source, shelter_id) for source, shelter_id in rows}


def get_ranked_candidates(
    db: Session, user_latitude: float, user_longitude: float
) -> list[dict]:
    """Reuses the existing production ranking (rank_shelters_for_user, from
    shelter_ranking.py) unchanged, over the same official + emergency-eligible
    community shelter pool used by /recommendations/nearby-emergency-shelters.
    Does not use shelter_decision_engine.py and does not introduce a second
    ranking algorithm.

    Community shelters are only included when user_latitude/user_longitude —
    the CURRENT request's own coordinates, never the Journey's original
    creation-time area — resolve to a verified active EmergencyAccessState.
    A Journey does not carry any stored authorization of its own: owning an
    active Journey never implies Community-shelter eligibility by itself.
    This is the same centralized check (get_active_emergency_state) and the
    same candidate pool (get_eligible_community_shelters) used by
    /recommendations/best-emergency-shelter, /recommendations/nearby-
    emergency-shelters, and /community-shelters/emergency, so Alternative
    Preview and Accept-alternative revalidation (both call this function)
    can never see a different Community pool than the initial recommendation
    for the same coordinates and context.

    ---
    Future Safety Decision Layer seam:
    A future layer would sit right after this function returns (the ranked,
    order-preserved candidate list) and before select_first_eligible_candidate
    picks/presents one — e.g. to suppress movement entirely, prefer official
    shelters during an active alert, or factor in remaining protection time.
    It would need to be re-applied inside accept_alternative's re-validation
    too, not just at preview time.
    """
    official_shelters = db.query(Shelter).all()

    active_state = get_active_emergency_state(db, user_latitude, user_longitude)
    community_shelters = get_eligible_community_shelters(db) if active_state else []

    # TEMP DIAGNOSTIC LOGGING -- to be removed after diagnosis is confirmed.
    _debug_trace(
        "alternative_get_ranked_candidates_pool",
        latitude=user_latitude,
        longitude=user_longitude,
        official_count=len(official_shelters),
        community_count=len(community_shelters),
    )

    all_shelters = official_shelters + community_shelters

    ranked = rank_shelters_for_user(
        shelters=all_shelters,
        user_latitude=user_latitude,
        user_longitude=user_longitude,
    )

    candidates = []

    for item in ranked[:ALTERNATIVE_CANDIDATE_LIMIT]:
        shelter_obj = item["shelter"]
        source = "community" if isinstance(shelter_obj, CommunityShelter) else "official"

        candidates.append(
            {
                "id": shelter_obj.id,
                "source": source,
                "name": shelter_obj.name,
                "city": shelter_obj.city,
                "address": getattr(shelter_obj, "address", None),
                "latitude": shelter_obj.latitude,
                "longitude": shelter_obj.longitude,
                "distance_meters": item["distance_meters"],
                "estimated_walk_minutes": item["estimated_walk_minutes"],
            }
        )

    # TEMP DIAGNOSTIC LOGGING -- to be removed after diagnosis is confirmed.
    _debug_trace(
        "alternative_get_ranked_candidates_result",
        top_5=[(c["source"], c["distance_meters"]) for c in candidates[:5]],
    )

    return candidates


def select_first_eligible_candidate(
    ranked_candidates: list[dict], attempted_keys: set[str]
) -> Optional[dict]:
    """Preserves the ranking order returned by the backend and returns the
    first candidate whose (source, id) key is not already attempted. Returns
    None when every candidate has already been attempted (or there are no
    candidates at all). Pure function — no I/O — so it can be unit tested
    without a database.
    """
    for candidate in ranked_candidates:
        key = build_shelter_key(candidate["source"], candidate["id"])

        if key not in attempted_keys:
            return candidate

    return None


# The three outcomes GET /shelter-journeys/active can report. Deliberately
# has no "area_mismatch": a Journey is a personal shelter-seeking process,
# not fixed to the coordinates/city/area where it was created — the user
# moving to a different city, even a distant one, must never by itself
# expire, hide, or invalidate it. What DOES depend on the current area is
# emergency-sensitive authorization (Alternative/Community), which is
# reported separately via the capability flags below.
ACTIVE_JOURNEY_OUTCOMES = ("applicable", "location_unavailable", "no_active_journey")


def determine_active_journey_outcome(
    is_structurally_valid: bool,
    coordinates_provided: bool,
    area_confidently_inferred: bool,
    current_area_has_verified_emergency: bool,
) -> tuple[str, bool, bool, bool]:
    """Pure decision logic for GET /shelter-journeys/active — no I/O, so it
    is fully unit-testable independent of get_active_journey_for_user.

    Returns (outcome, can_continue_current_navigation, can_request_alternative,
    can_expose_community).

    - is_structurally_valid: the Journey row is 'active' after lazy expiry,
      has a current_visit_session_id, and that session's shelter resolves.
      False here always means no_active_journey — this also covers the
      "structural integrity failure" case (session/shelter missing); the
      caller is responsible for logging that separately, never for
      resurrecting or deleting anything.
    - coordinates_provided / area_confidently_inferred: whether the CURRENT
      request supplied usable coordinates and whether area_inference.py's
      existing confidence rule (nearest-3, >=2 agree, <=2000m) could place
      them. Either being false means we cannot safely evaluate
      emergency-sensitive authorization right now — this is reported as
      location_unavailable, never silently treated as fully applicable.
    - current_area_has_verified_emergency: whether the CURRENT (not the
      Journey's original) coordinates matched a live EmergencyAccessState.
      Only meaningful, and only computed by the caller, when the area was
      confidently inferred.
    """
    if not is_structurally_valid:
        return ("no_active_journey", False, False, False)

    if not coordinates_provided or not area_confidently_inferred:
        return ("location_unavailable", True, False, False)

    return (
        "applicable",
        True,
        current_area_has_verified_emergency,
        current_area_has_verified_emergency,
    )


def _resolve_or_create_active_journey(
    db: Session,
    current_user: User,
    active_state: EmergencyAccessState,
) -> tuple[ShelterJourney, bool]:
    """Resolves the user's single active Journey for a verified active_state:
    reuses an existing one (after a lazy-expiry check) or creates a new one
    linked to it. Never touches any Visit Session — callers attach their own
    afterward. Returns (journey, was_freshly_created) so the caller knows
    whether the journey already has a current_visit_session_id to compare
    attempts against, or is brand new and needs its first one.

    Shared by both get_or_create_initial_visit_session's "no eligible
    existing session" path and _upgrade_visit_session_into_journey's
    emergency-upgrade path, so "one active Journey per user" is resolved in
    exactly one place rather than two implementations that could drift.
    """
    existing_active_journey = (
        db.query(ShelterJourney)
        .filter(
            ShelterJourney.user_id == current_user.id,
            ShelterJourney.status == "active",
        )
        .first()
    )

    if existing_active_journey:
        existing_active_journey = _maybe_expire_journey(db, existing_active_journey)

    if existing_active_journey and existing_active_journey.status == "active":
        return existing_active_journey, False

    journey = ShelterJourney(
        user_id=current_user.id,
        status="active",
        emergency_access_state_id=active_state.id,
    )
    db.add(journey)
    db.flush()  # obtain journey.id before the caller attaches a session

    return journey, True


def _upgrade_visit_session_into_journey(
    db: Session,
    current_user: User,
    visit_session_id: int,
    active_state: EmergencyAccessState,
) -> ShelterVisitSession:
    """Implements the emergency-upgrade path for a Visit Session that was
    created while normal mode was active (journey_id IS NULL) but is still
    eligible for reuse under the existing 30-minute window: once a verified
    Emergency Context opens for the CURRENT coordinates, the session must be
    linked into the user's Journey rather than left stranded outside any
    Journey (and rather than creating a duplicate session for the exact
    same shelter attempt just because Emergency Mode started after it was
    created).

    Re-fetches and row-locks the Visit Session by id (never trusts the
    caller's earlier, now possibly-stale read) so a double tap — two
    near-simultaneous requests both finding the same eligible session —
    serializes instead of racing. Re-checks journey_id under the lock:

    - Still NULL: this request performs the upgrade, sets both
      visit_session.journey_id and journey.current_visit_session_id, and
      commits both changes in the same transaction (atomically — either
      both land or neither does).
    - Already set to the journey we resolved to (a concurrent request won
      the race and upgraded it first): return it unchanged, not an error.
    - Already set to a DIFFERENT journey: never silently reassign it —
      raise a structured conflict describing the data state instead.

    Also refuses to upgrade if the exact same shelter (source + id) is
    already attempted under the target journey via a different row, which
    would otherwise violate uq_visit_session_journey_shelter.
    """
    visit_session = (
        db.query(ShelterVisitSession)
        .filter(ShelterVisitSession.id == visit_session_id)
        .with_for_update()
        .first()
    )

    journey, _ = _resolve_or_create_active_journey(db, current_user, active_state)

    if visit_session.journey_id is not None:
        if visit_session.journey_id == journey.id:
            return visit_session

        raise HTTPException(
            status_code=409,
            detail={
                "error": "visit_session_journey_conflict",
                "message": (
                    "This visit session is already linked to a different "
                    "journey and cannot be reassigned."
                ),
                "visit_session_id": visit_session.id,
                "existing_journey_id": visit_session.journey_id,
                "target_journey_id": journey.id,
            },
        )

    conflicting_attempt = (
        db.query(ShelterVisitSession)
        .filter(
            ShelterVisitSession.journey_id == journey.id,
            ShelterVisitSession.shelter_source == visit_session.shelter_source,
            ShelterVisitSession.shelter_id == visit_session.shelter_id,
        )
        .first()
    )

    if conflicting_attempt:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "visit_session_journey_conflict",
                "message": (
                    "This shelter is already attempted under the active "
                    "journey via a different visit session."
                ),
                "visit_session_id": visit_session.id,
                "conflicting_visit_session_id": conflicting_attempt.id,
                "target_journey_id": journey.id,
            },
        )

    visit_session.journey_id = journey.id
    journey.current_visit_session_id = visit_session.id

    db.commit()
    db.refresh(visit_session)

    return visit_session


def get_or_create_initial_visit_session(
    db: Session,
    current_user: User,
    shelter_id: int,
    shelter_source: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> ShelterVisitSession:
    """Implements POST /shelter-feedback/visit-sessions.

    A Journey (and therefore the Alternative Shelter capability) only ever
    exists inside an active Emergency Context — this is enforced here, on
    the backend, not left to frontend visibility choices.

    Security note: this function intentionally takes latitude/longitude,
    never a client-supplied area_name/current_city string. The caller's
    claimed city (if any) must never reach this function — see
    app.services.area_inference for how the real area is derived instead.
    If coordinates are missing (permission denied, etc.), this fails closed
    into normal mode rather than fabricating a location.

    1. Preserves the existing recent-open-session reuse behavior (same
       30-minute window, same eligibility filters) — but before returning
       an eligible session whose journey_id is NULL, evaluates the CURRENT
       Emergency Context using the CURRENT request's coordinates and
       upgrades it into the user's Journey if one is now verified (see
       _upgrade_visit_session_into_journey). This is what a plain-normal
       -mode session created before Emergency Mode opened needs, instead
       of being returned as-is forever until its reuse window lapses.
    2. A session whose journey (if any) is still genuinely active after a
       lazy expiry check is reused unchanged — an expired journey's old
       session must never be silently resurrected.
    3. If the user's current area has no active Emergency Context: creates a
       plain Visit Session with journey_id=None. Normal mode never creates
       or touches a Journey.
    4. If the area has an active Emergency Context: resumes the user's
       single active Journey if one exists (attaching this shelter as a new
       attempt under it, never a second competing Journey — the database's
       partial unique index guarantees there is at most one to find).
       Otherwise creates a new Journey linked to this Emergency Context and
       its first Visit Session, atomically.
    """
    normalized_source = normalize_shelter_source(shelter_source)

    reuse_threshold = datetime.utcnow() - timedelta(minutes=SESSION_REUSE_WINDOW_MINUTES)

    existing_open_session = (
        db.query(ShelterVisitSession)
        .filter(
            ShelterVisitSession.user_id == current_user.id,
            ShelterVisitSession.shelter_id == shelter_id,
            ShelterVisitSession.shelter_source == normalized_source,
            ShelterVisitSession.feedback_submitted == False,
            ShelterVisitSession.route_started_at >= reuse_threshold,
        )
        .order_by(ShelterVisitSession.route_started_at.desc())
        .first()
    )

    if existing_open_session:
        if existing_open_session.journey_id is None:
            active_state_for_upgrade = get_active_emergency_state(db, latitude, longitude)

            if not active_state_for_upgrade:
                return existing_open_session

            return _upgrade_visit_session_into_journey(
                db, current_user, existing_open_session.id, active_state_for_upgrade
            )

        existing_journey = (
            db.query(ShelterJourney)
            .filter(ShelterJourney.id == existing_open_session.journey_id)
            .first()
        )

        if not existing_journey:
            return existing_open_session

        existing_journey = _maybe_expire_journey(db, existing_journey)

        if existing_journey.status == "active":
            return existing_open_session

        # The journey behind this old session is no longer active (expired,
        # entered, or abandoned) — fall through to normal creation instead
        # of resurrecting it.

    active_state = get_active_emergency_state(db, latitude, longitude)

    if not active_state:
        # Normal mode: a plain Visit Session, no Journey involved at all.
        visit_session = ShelterVisitSession(
            user_id=current_user.id,
            shelter_id=shelter_id,
            shelter_source=normalized_source,
            journey_id=None,
        )
        db.add(visit_session)
        db.commit()
        db.refresh(visit_session)
        return visit_session

    # Emergency mode: resume the user's single active Journey if one
    # exists, else start a new one linked to this Emergency Context.
    journey, is_new_journey = _resolve_or_create_active_journey(db, current_user, active_state)

    if is_new_journey:
        visit_session = ShelterVisitSession(
            user_id=current_user.id,
            shelter_id=shelter_id,
            shelter_source=normalized_source,
            journey_id=journey.id,
        )
        db.add(visit_session)
        db.flush()  # obtain visit_session.id before pointing the journey at it

        journey.current_visit_session_id = visit_session.id

        db.commit()
        db.refresh(visit_session)

        return visit_session

    # Attach this shelter as a new attempt under the existing Journey
    # instead of creating a second, competing one (the DB invariant would
    # reject a second 'active' row for this user anyway).
    requested_key = build_shelter_key(normalized_source, shelter_id)
    attempted_keys = get_attempted_shelter_keys(db, journey.id)

    if requested_key in attempted_keys:
        already_existing = (
            db.query(ShelterVisitSession)
            .filter(
                ShelterVisitSession.journey_id == journey.id,
                ShelterVisitSession.shelter_source == normalized_source,
                ShelterVisitSession.shelter_id == shelter_id,
            )
            .first()
        )

        if already_existing:
            return already_existing

    return create_visit_session_in_journey(
        db=db,
        journey_id=journey.id,
        current_user=current_user,
        shelter_source=normalized_source,
        shelter_id=shelter_id,
        update_current_pointer=True,
    )


def _load_active_owned_journey(
    db: Session, journey_id: int, current_user: User, lock: bool
) -> ShelterJourney:
    """Loads a journey, validating ownership and 'active' status. When
    lock=True, acquires a row-level lock (SELECT ... FOR UPDATE) so concurrent
    requests against the same journey serialize instead of racing.

    Applies the lazy expiry check before validating status, so a journey
    whose linked Emergency Context has since ended is correctly rejected as
    'not active' rather than allowing an alternative-preview/accept to
    proceed against a dead journey.
    """
    query = db.query(ShelterJourney).filter(ShelterJourney.id == journey_id)

    if lock:
        query = query.with_for_update()

    journey = query.first()

    if not journey or journey.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Journey not found")

    journey = _maybe_expire_journey(db, journey)

    if journey.status != "active":
        raise HTTPException(status_code=409, detail="Journey is not active")

    return journey


def create_visit_session_in_journey(
    db: Session,
    journey_id: int,
    current_user: User,
    shelter_source: str,
    shelter_id: int,
    update_current_pointer: bool = True,
) -> ShelterVisitSession:
    """Shared helper for creating a Visit Session inside an existing,
    already-started Journey. Used by accept_alternative.

    - Validates journey ownership and 'active' status.
    - Row-locks the journey for the duration of the operation so a double tap
      serializes against itself instead of racing.
    - Normalizes shelter_source.
    - Rejects an already-attempted shelter.
    - Creates the Visit Session; if two requests race past the attempted-key
      check anyway, the database unique constraint is the final safeguard —
      the resulting IntegrityError is caught and the already-created session
      is reused instead of failing the request.
    - Optionally updates journey.current_visit_session_id (skip this when the
      caller only wants to record an attempt without changing the active
      destination — not used by any endpoint yet, but keeps the helper
      general-purpose as requested).
    """
    journey = _load_active_owned_journey(db, journey_id, current_user, lock=True)

    normalized_source = normalize_shelter_source(shelter_source)
    requested_key = build_shelter_key(normalized_source, shelter_id)

    attempted_keys = get_attempted_shelter_keys(db, journey_id)

    if requested_key in attempted_keys:
        raise HTTPException(
            status_code=409,
            detail={"error": "already_attempted", "shelter_key": requested_key},
        )

    visit_session = ShelterVisitSession(
        user_id=current_user.id,
        shelter_id=shelter_id,
        shelter_source=normalized_source,
        journey_id=journey_id,
    )
    db.add(visit_session)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()

        # A concurrent request already created this exact
        # (journey_id, shelter_source, shelter_id) session. Reuse it instead
        # of failing — this is the database-level backstop for a double tap.
        existing = (
            db.query(ShelterVisitSession)
            .filter(
                ShelterVisitSession.journey_id == journey_id,
                ShelterVisitSession.shelter_source == normalized_source,
                ShelterVisitSession.shelter_id == shelter_id,
            )
            .first()
        )

        if existing:
            return existing

        raise

    if update_current_pointer:
        journey.current_visit_session_id = visit_session.id

    db.commit()
    db.refresh(visit_session)

    return visit_session


def _require_confident_current_area(
    db: Session, user_latitude: Optional[float], user_longitude: Optional[float]
) -> None:
    """Guards build_alternative_preview and accept_alternative against
    proceeding when the CURRENT coordinates can't be confidently placed.

    Missing coordinates and an uncertain area_inference.py result (the
    existing nearest-3/>=2-agree/<=2000m confidence rule) are treated
    identically here: both mean "current-location authorization cannot be
    verified right now", matching the same location_unavailable
    classification determine_active_journey_outcome already reports for
    GET /shelter-journeys/active — this is that same rule enforced as a
    hard gate on the two operations that can actually change the Journey's
    destination, not just an advisory read-model flag.

    Called as the very first statement in both callers, before either of
    them touches the Journey/Visit Session at all — a rejection here is
    guaranteed to leave every row completely untouched, never a partial
    read followed by a decline.
    """
    if user_latitude is None or user_longitude is None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "location_unavailable",
                "message": "Current location could not be verified.",
            },
        )

    if infer_area_name_from_coordinates(db, user_latitude, user_longitude) is None:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "location_unavailable",
                "message": "Current location could not be verified.",
            },
        )


def build_alternative_preview(
    db: Session,
    journey_id: int,
    current_user: User,
    user_latitude: float,
    user_longitude: float,
) -> dict:
    """Implements GET /shelter-journeys/{journey_id}/alternative-preview.
    Entirely read-only: no Visit Session is created, no Journey field is
    changed, no navigation happens.

    Rejects with a location_unavailable conflict before touching the
    Journey at all if the current coordinates cannot be confidently placed
    — see _require_confident_current_area. This is a hard gate, not just
    the Community-shelter filter inside get_ranked_candidates: an
    Official-only alternative must never be silently returned when current
    location is uncertain, since the whole Alternative operation is
    location-dependent, not only its Community-eligibility slice.
    """
    _require_confident_current_area(db, user_latitude, user_longitude)

    journey = _load_active_owned_journey(db, journey_id, current_user, lock=False)

    if not journey.current_visit_session_id:
        raise HTTPException(
            status_code=409,
            detail="Active journey has no current visit session",
        )

    current_session = (
        db.query(ShelterVisitSession)
        .filter(ShelterVisitSession.id == journey.current_visit_session_id)
        .first()
    )

    if not current_session:
        raise HTTPException(
            status_code=409,
            detail="Journey's current visit session could not be found",
        )

    current_shelter_row = get_shelter_by_source_and_id(
        db, current_session.shelter_source, current_session.shelter_id
    )

    if not current_shelter_row:
        raise HTTPException(
            status_code=409,
            detail="Journey's current shelter could not be found",
        )

    # Estimates only: straight-line (Haversine) distance and the existing
    # 80m/min walking heuristic — not a routed walking distance or exact
    # travel time.
    current_distance_meters = calculate_distance_meters(
        user_latitude,
        user_longitude,
        current_shelter_row.latitude,
        current_shelter_row.longitude,
    )
    current_walk_minutes = estimate_walk_minutes(current_distance_meters)

    current_shelter_payload = {
        "id": current_shelter_row.id,
        "source": normalize_shelter_source(current_session.shelter_source),
        "name": current_shelter_row.name,
        "estimated_distance_meters": current_distance_meters,
        "estimated_walk_minutes": current_walk_minutes,
    }

    attempted_keys = get_attempted_shelter_keys(db, journey_id)
    ranked_candidates = get_ranked_candidates(db, user_latitude, user_longitude)
    recommended = select_first_eligible_candidate(ranked_candidates, attempted_keys)

    if not recommended:
        return {
            "journey_id": journey_id,
            "current_visit_session_id": journey.current_visit_session_id,
            "current_shelter": current_shelter_payload,
            "alternative_available": False,
            "recommended_alternative": None,
            "comparison": None,
        }

    return {
        "journey_id": journey_id,
        "current_visit_session_id": journey.current_visit_session_id,
        "current_shelter": current_shelter_payload,
        "alternative_available": True,
        "recommended_alternative": {
            "id": recommended["id"],
            "source": recommended["source"],
            "name": recommended["name"],
            "latitude": recommended["latitude"],
            "longitude": recommended["longitude"],
            "estimated_distance_meters": recommended["distance_meters"],
            "estimated_walk_minutes": recommended["estimated_walk_minutes"],
        },
        "comparison": {
            "additional_estimated_distance_meters": (
                recommended["distance_meters"] - current_distance_meters
            ),
            "additional_estimated_walk_minutes": (
                recommended["estimated_walk_minutes"] - current_walk_minutes
            ),
        },
    }


def get_active_journey_for_user(
    db: Session,
    current_user: User,
    user_latitude: Optional[float],
    user_longitude: Optional[float],
) -> dict:
    """Returns the user's current active Journey (if any), its current
    shelter, and what the caller is currently allowed to do with it.

    This is what makes the Journey the source of truth for screens like Home:
    instead of recomputing a fresh recommendation from scratch every time the
    screen loads (which would show stale data after an accepted alternative
    moved the Journey's destination elsewhere in the app), callers check here
    first. Read-only — does not touch ranking, does not create anything, and
    never mutates the Journey based on the caller's current coordinates.

    There is at most one 'active' journey per user by database invariant
    (uq_one_active_journey_per_user), so no "most recent" ordering is
    needed — the lookup is exact. The lazy expiry check still runs, since a
    journey can be genuinely active in the database but its own linked
    Emergency Context may have ended since it was last checked.

    Journey validity vs. current authorization are deliberately separate
    axes (see area_inference.py's module docstring for the same split
    applied to Community-shelter exposure):
    - Whether the Journey itself is still applicable depends only on ITS
      OWN linked EmergencyAccessState (via _maybe_expire_journey) and its
      structural integrity — never on the caller's current coordinates.
      Moving to a different city, however far, never expires, hides, or
      replaces the Journey.
    - Whether the caller may currently request an alternative or see
      Community shelters depends only on THIS call's own coordinates
      resolving to a verified, live EmergencyAccessState — never on the
      area the Journey happened to be created in.
    Missing coordinates or a low-confidence area inference can never
    determine the first axis, and always drives the second axis's
    capabilities to False (fail closed) rather than guessing.
    """
    journey = (
        db.query(ShelterJourney)
        .filter(
            ShelterJourney.user_id == current_user.id,
            ShelterJourney.status == "active",
        )
        .first()
    )

    if journey:
        journey = _maybe_expire_journey(db, journey)

    is_structurally_valid = False
    current_session = None
    shelter_row = None

    if journey and journey.status == "active":
        if not journey.current_visit_session_id:
            logger.error(
                "Active journey %s (user %s) has no current_visit_session_id; "
                "treating as no_active_journey without modifying the row.",
                journey.id,
                current_user.id,
            )
        else:
            current_session = (
                db.query(ShelterVisitSession)
                .filter(ShelterVisitSession.id == journey.current_visit_session_id)
                .first()
            )

            if not current_session:
                logger.error(
                    "Active journey %s (user %s) references missing visit "
                    "session %s; treating as no_active_journey without "
                    "modifying the row.",
                    journey.id,
                    current_user.id,
                    journey.current_visit_session_id,
                )
            else:
                shelter_row = get_shelter_by_source_and_id(
                    db, current_session.shelter_source, current_session.shelter_id
                )

                if not shelter_row:
                    logger.error(
                        "Active journey %s (user %s) current shelter %s:%s "
                        "could not be resolved; treating as no_active_journey "
                        "without modifying the row.",
                        journey.id,
                        current_user.id,
                        current_session.shelter_source,
                        current_session.shelter_id,
                    )
                else:
                    is_structurally_valid = True

    coordinates_provided = user_latitude is not None and user_longitude is not None
    area_confidently_inferred = False
    current_area_has_verified_emergency = False

    # Only worth inferring the current area at all when there is a Journey
    # to evaluate authorization for, and coordinates to infer from.
    if is_structurally_valid and coordinates_provided:
        inferred_city = infer_area_name_from_coordinates(db, user_latitude, user_longitude)
        area_confidently_inferred = inferred_city is not None

        if area_confidently_inferred:
            matching_state = find_matching_emergency_state(db, inferred_city)
            current_area_has_verified_emergency = bool(
                matching_state and is_emergency_access_active(matching_state)
            )

    outcome, can_continue, can_request_alternative, can_expose_community = (
        determine_active_journey_outcome(
            is_structurally_valid=is_structurally_valid,
            coordinates_provided=coordinates_provided,
            area_confidently_inferred=area_confidently_inferred,
            current_area_has_verified_emergency=current_area_has_verified_emergency,
        )
    )

    capabilities = {
        "can_continue_current_navigation": can_continue,
        "can_request_alternative": can_request_alternative,
        "can_expose_community": can_expose_community,
    }

    if not is_structurally_valid:
        return {
            "outcome": outcome,
            "has_active_journey": False,
            "journey_id": None,
            "visit_session_id": None,
            "shelter": None,
            "capabilities": capabilities,
        }

    # Distance/walk-time only need raw coordinates (pure Haversine math), not
    # a confident city inference — populate them whenever we have a fix at
    # all, even under location_unavailable caused by uncertain inference.
    distance_meters = None
    walk_minutes = None

    if coordinates_provided:
        distance_meters = calculate_distance_meters(
            user_latitude,
            user_longitude,
            shelter_row.latitude,
            shelter_row.longitude,
        )
        walk_minutes = estimate_walk_minutes(distance_meters)

    return {
        "outcome": outcome,
        # Kept for the current frontend's existing contract: it only ever
        # branches on this boolean to decide "should I display this
        # destination." True whenever the Journey itself exists and is
        # displayable (applicable OR location_unavailable) — the whole
        # point of location_unavailable is that the destination is still
        # shown, just without new location-dependent operations.
        "has_active_journey": is_structurally_valid,
        "journey_id": journey.id,
        "visit_session_id": current_session.id,
        "shelter": {
            "id": shelter_row.id,
            "source": normalize_shelter_source(current_session.shelter_source),
            "name": shelter_row.name,
            "city": shelter_row.city,
            "address": getattr(shelter_row, "address", None),
            "latitude": shelter_row.latitude,
            "longitude": shelter_row.longitude,
            "estimated_distance_meters": distance_meters,
            "estimated_walk_minutes": walk_minutes,
        },
        "capabilities": capabilities,
    }


def accept_alternative(
    db: Session,
    journey_id: int,
    current_user: User,
    shelter_id: int,
    shelter_source: str,
    user_latitude: float,
    user_longitude: float,
):
    """Implements POST /shelter-journeys/{journey_id}/accept-alternative.
    The only operation that changes the journey's active destination.

    Re-validates everything at accept time rather than trusting the client's
    held preview: re-locks the journey, re-reads attempted shelters, and
    recomputes the current highest-ranked eligible alternative. If the
    requested shelter no longer matches that recomputation, returns a
    structured stale-preview response instead of silently accepting a
    different shelter or a stale one.

    Rejects with a location_unavailable conflict before touching the
    Journey at all if the current coordinates cannot be confidently placed
    — see _require_confident_current_area. Without this, a client could
    accept an Official-only "alternative" computed under uncertain
    location, silently moving the Journey's destination on data this phase
    considers too unreliable to authorize a location-dependent operation.
    """
    _require_confident_current_area(db, user_latitude, user_longitude)

    journey = _load_active_owned_journey(db, journey_id, current_user, lock=True)

    normalized_source = normalize_shelter_source(shelter_source)
    requested_key = build_shelter_key(normalized_source, shelter_id)

    attempted_keys = get_attempted_shelter_keys(db, journey_id)

    if requested_key in attempted_keys:
        raise HTTPException(
            status_code=409,
            detail={"error": "already_attempted", "shelter_key": requested_key},
        )

    ranked_candidates = get_ranked_candidates(db, user_latitude, user_longitude)
    recommended = select_first_eligible_candidate(ranked_candidates, attempted_keys)

    if not recommended:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_alternative_available"},
        )

    recommended_key = build_shelter_key(recommended["source"], recommended["id"])

    if recommended_key != requested_key:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "stale_preview",
                "message": "The recommended alternative has changed. Request a new preview.",
                "journey_id": journey_id,
                "current_recommended_alternative": recommended,
            },
        )

    # Extension point for a future explicit Journey action such as "חזור
    # ליעד קודם" (revert to previous destination): previous_visit_session_id
    # is already tracked and returned to the client below, but nothing acts
    # on it today beyond display. A future revert action would be a new,
    # explicit endpoint (e.g. POST /shelter-journeys/{id}/revert) that reads
    # this same value and moves current_visit_session_id back to it — not
    # browser/navigation Back behavior. Not implemented now.
    previous_visit_session_id = journey.current_visit_session_id

    # Reuses the same locked-journey + attempted-check + constraint-safe
    # creation logic as the standalone helper, instead of duplicating it here.
    visit_session = create_visit_session_in_journey(
        db=db,
        journey_id=journey_id,
        current_user=current_user,
        shelter_source=normalized_source,
        shelter_id=shelter_id,
        update_current_pointer=True,
    )

    shelter_row = get_shelter_by_source_and_id(db, normalized_source, shelter_id)

    return visit_session, previous_visit_session_id, shelter_row


def complete_journey(
    db: Session, journey_id: int, current_user: User
) -> ShelterJourney:
    """Implements POST /shelter-journeys/{journey_id}/complete.

    Marks the journey as successfully resolved: the user confirmed they
    entered the shelter. Populates entered_shelter_id/entered_shelter_source
    from the journey's current Visit Session — these columns exist on the
    model but were never written by any code path before this endpoint.

    A journey that has already reached a terminal state (entered, expired,
    abandoned) cannot be completed again — terminal states are one-way.
    """
    journey = _load_active_owned_journey(db, journey_id, current_user, lock=True)

    if journey.current_visit_session_id:
        current_session = (
            db.query(ShelterVisitSession)
            .filter(ShelterVisitSession.id == journey.current_visit_session_id)
            .first()
        )

        if current_session:
            journey.entered_shelter_id = current_session.shelter_id
            journey.entered_shelter_source = current_session.shelter_source

    journey.status = "entered"
    journey.ended_at = datetime.utcnow()

    db.commit()
    db.refresh(journey)

    return journey


def abandon_journey(
    db: Session, journey_id: int, current_user: User
) -> ShelterJourney:
    """Implements POST /shelter-journeys/{journey_id}/abandon.

    Marks the journey as explicitly given up on by the user. No frontend
    screen calls this yet — this is the extension point for a future
    explicit "leave journey" action (see navigation.tsx's extension-point
    comment). Terminal and one-way, same as complete_journey.
    """
    journey = _load_active_owned_journey(db, journey_id, current_user, lock=True)

    journey.status = "abandoned"
    journey.ended_at = datetime.utcnow()

    db.commit()
    db.refresh(journey)

    return journey
