from datetime import datetime, timedelta
from typing import Any, Optional

from app.db.models import (
    Shelter,
    CommunityShelter,
    ShelterFeedback,
)
from app.services.shelter_ranking import (
    calculate_distance_meters,
    estimate_walk_minutes,
)


# Maximum number of alternative shelters returned with the primary shelter.
MAX_ALTERNATIVES = 3

# Only recent feedback affects the current open status.
OPEN_STATUS_WINDOW_HOURS = 24

# Maximum additional distance allowed when avoiding a likely closed shelter.
OPEN_STATUS_MAX_EXTRA_DISTANCE_METERS = 150

# Maximum additional distance or walking time allowed for accessibility.
ACCESSIBILITY_MAX_EXTRA_DISTANCE_METERS = 150
ACCESSIBILITY_MAX_EXTRA_WALK_MINUTES = 2


def get_policy_for_event(event_type: str | None) -> dict[str, Any]:
    """Return the policy name for the current emergency type."""

    if event_type == "prepare_near_shelter":
        return {
            "name": "preparation_policy",
        }

    return {
        "name": "immediate_shelter_policy",
    }


def _normalize_source(source: str) -> str:
    """Normalize shelter source values for comparison."""

    return (source or "").strip().lower()


def _notes_indicate_accessible(notes: Optional[str]) -> bool:
    """Check whether accessibility notes indicate an accessible shelter."""

    if not notes:
        return False

    normalized = notes.lower()

    negative_terms = [
        "not accessible",
        "לא נגיש",
    ]

    positive_terms = [
        "accessible",
        "נגיש",
    ]

    # Check negative wording first because "not accessible"
    # also contains the word "accessible".
    if any(term in normalized for term in negative_terms):
        return False

    return any(
        term in normalized
        for term in positive_terms
    )


def _notes_indicate_not_accessible(
    notes: Optional[str],
) -> bool:
    """Check whether accessibility notes indicate accessibility problems."""

    if not notes:
        return False

    normalized = notes.lower()

    return (
        "not accessible" in normalized
        or "לא נגיש" in normalized
    )


def build_official_candidate(
    shelter: Shelter,
    user_latitude: float,
    user_longitude: float,
    policy: dict[str, Any],
) -> dict[str, Any] | None:
    """Convert an official shelter into a recommendation candidate."""

    if (
        shelter.latitude is None
        or shelter.longitude is None
    ):
        return None

    distance_meters = calculate_distance_meters(
        user_latitude,
        user_longitude,
        shelter.latitude,
        shelter.longitude,
    )

    return {
        "id": shelter.id,
        "source": "official",
        "name": shelter.name,
        "city": shelter.city,
        "address": shelter.address,
        "latitude": shelter.latitude,
        "longitude": shelter.longitude,
        "distance_meters": distance_meters,
        "estimated_walk_minutes": estimate_walk_minutes(
            distance_meters
        ),
        "accessibility_notes": shelter.accessibility_notes,
        "open_status": "unclear",
        "accessibility_status": "unclear",
        "recent_open_report_count": 0,
        "debug": {
            "policy": policy["name"],
            "official_status": shelter.status,
        },
    }


def build_community_candidate(
    shelter: CommunityShelter,
    user_latitude: float,
    user_longitude: float,
    policy: dict[str, Any],
) -> dict[str, Any] | None:
    """Convert a community shelter into a recommendation candidate."""

    if not shelter.is_active:
        return None

    if not shelter.show_only_during_emergency:
        return None

    if (
        shelter.latitude is None
        or shelter.longitude is None
    ):
        return None

    distance_meters = calculate_distance_meters(
        user_latitude,
        user_longitude,
        shelter.latitude,
        shelter.longitude,
    )

    return {
        "id": shelter.id,
        "source": "community",
        "name": shelter.name,
        "city": shelter.city,
        "address": shelter.address,
        "latitude": shelter.latitude,
        "longitude": shelter.longitude,
        "distance_meters": distance_meters,
        "estimated_walk_minutes": estimate_walk_minutes(
            distance_meters
        ),
        "is_accessible": bool(shelter.is_accessible),
        "open_status": "unclear",
        "accessibility_status": (
            "accessible"
            if shelter.is_accessible
            else "unclear"
        ),
        "recent_open_report_count": 0,
        "debug": {
            "policy": policy["name"],
        },
    }


def _group_feedback_by_shelter(
    feedback_items: list[ShelterFeedback],
) -> dict[
    tuple[str, int],
    list[ShelterFeedback],
]:
    """Group feedback by shelter source and ID."""

    grouped: dict[
        tuple[str, int],
        list[ShelterFeedback],
    ] = {}

    for feedback in feedback_items:
        key = (
            _normalize_source(
                feedback.shelter_source
            ),
            feedback.shelter_id,
        )

        grouped.setdefault(
            key,
            [],
        ).append(feedback)

    return grouped


def get_open_status(
    feedback_items: list[ShelterFeedback],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Determine the current shelter open status using recent feedback."""

    if now is None:
        now = datetime.utcnow()

    threshold = now - timedelta(
        hours=OPEN_STATUS_WINDOW_HOURS
    )

    recent_feedback = [
        feedback
        for feedback in feedback_items
        if (
            feedback.created_at is not None
            and feedback.created_at >= threshold
        )
    ]

    # Newest report first.
    recent_feedback.sort(
        key=lambda feedback: feedback.created_at,
        reverse=True,
    )

    report_count = len(recent_feedback)

    # Require at least two recent reports.
    if report_count < 2:
        return {
            "status": "unclear",
            "report_count": report_count,
            "latest_status": (
                recent_feedback[0].was_open
                if recent_feedback
                else None
            ),
        }

    latest_value = recent_feedback[0].was_open
    second_latest_value = recent_feedback[1].was_open

    # Two matching recent reports provide a strong signal.
    if (
        latest_value == "yes"
        and second_latest_value == "yes"
    ):
        return {
            "status": "likely_open",
            "report_count": report_count,
            "latest_status": latest_value,
        }

    if (
        latest_value == "no"
        and second_latest_value == "no"
    ):
        return {
            "status": "likely_closed",
            "report_count": report_count,
            "latest_status": latest_value,
        }

    # Conflicting recent reports keep the status uncertain.
    if {
        latest_value,
        second_latest_value,
    } == {"yes", "no"}:
        return {
            "status": "mixed",
            "report_count": report_count,
            "latest_status": latest_value,
        }

    yes_count = sum(
        1
        for feedback in recent_feedback
        if feedback.was_open == "yes"
    )

    partial_count = sum(
        1
        for feedback in recent_feedback
        if feedback.was_open == "partial"
    )

    no_count = sum(
        1
        for feedback in recent_feedback
        if feedback.was_open == "no"
    )

    # Partial access counts as weaker positive evidence.
    positive_weight = (
        yes_count
        + (partial_count * 0.5)
    )

    closed_weight = float(no_count)

    if (
        no_count >= 2
        and closed_weight
        >= positive_weight + 1.0
    ):
        return {
            "status": "likely_closed",
            "report_count": report_count,
            "latest_status": latest_value,
        }

    if (
        yes_count >= 2
        and positive_weight
        >= closed_weight + 1.0
    ):
        return {
            "status": "likely_open",
            "report_count": report_count,
            "latest_status": latest_value,
        }

    return {
        "status": "mixed",
        "report_count": report_count,
        "latest_status": latest_value,
    }


def get_accessibility_status(
    candidate: dict[str, Any],
    feedback_items: list[ShelterFeedback],
) -> str:
    """Determine accessibility status from shelter data and feedback."""

    source = _normalize_source(
        candidate["source"]
    )

    if source == "official":
        notes = candidate.get(
            "accessibility_notes"
        )

        if _notes_indicate_not_accessible(
            notes
        ):
            return "possibly_not_accessible"

        if _notes_indicate_accessible(
            notes
        ):
            return "accessible"

    if source == "community":
        if candidate.get("is_accessible"):
            return "accessible"

    if not feedback_items:
        return candidate.get(
            "accessibility_status",
            "unclear",
        )

    yes_count = sum(
        1
        for feedback in feedback_items
        if feedback.was_accessible == "yes"
    )

    partial_count = sum(
        1
        for feedback in feedback_items
        if feedback.was_accessible == "partial"
    )

    no_count = sum(
        1
        for feedback in feedback_items
        if feedback.was_accessible == "no"
    )

    unknown_count = sum(
        1
        for feedback in feedback_items
        if feedback.was_accessible == "unknown"
    )

    if no_count > yes_count:
        return "possibly_not_accessible"

    if (
        yes_count > 0
        and yes_count >= no_count
    ):
        return "accessible"

    if (
        partial_count > 0
        or unknown_count > 0
    ):
        return "unclear"

    return "unclear"


def _enrich_candidates_with_feedback(
    candidates: list[dict[str, Any]],
    feedback_items: list[ShelterFeedback],
) -> None:
    """Add feedback-based status information to each candidate."""

    grouped_feedback = (
        _group_feedback_by_shelter(
            feedback_items
        )
    )

    now = datetime.utcnow()

    for candidate in candidates:
        key = (
            _normalize_source(
                candidate["source"]
            ),
            candidate["id"],
        )

        shelter_feedback = (
            grouped_feedback.get(
                key,
                [],
            )
        )

        open_result = get_open_status(
            shelter_feedback,
            now=now,
        )

        candidate["open_status"] = (
            open_result["status"]
        )

        candidate[
            "recent_open_report_count"
        ] = open_result["report_count"]

        candidate[
            "accessibility_status"
        ] = get_accessibility_status(
            candidate,
            shelter_feedback,
        )

        candidate["debug"][
            "open_status"
        ] = candidate["open_status"]

        candidate["debug"][
            "recent_open_report_count"
        ] = candidate[
            "recent_open_report_count"
        ]

        candidate["debug"][
            "accessibility_status"
        ] = candidate[
            "accessibility_status"
        ]


def _select_by_open_status(
    candidates: list[dict[str, Any]],
) -> tuple[
    dict[str, Any],
    list[str],
]:
    """Apply recent open-status rules to the closest shelter."""

    closest = candidates[0]

    reasons: list[str] = []

    if (
        closest["open_status"]
        != "likely_closed"
    ):
        return closest, reasons

    max_allowed_distance = (
        closest["distance_meters"]
        + OPEN_STATUS_MAX_EXTRA_DISTANCE_METERS
    )

    alternative = next(
        (
            candidate
            for candidate in candidates[1:]
            if (
                candidate["open_status"]
                != "likely_closed"
                and candidate[
                    "distance_meters"
                ]
                <= max_allowed_distance
            )
        ),
        None,
    )

    if alternative:
        reasons.append(
            "The closest shelter was recently reported as likely closed, "
            "so a nearby alternative was preferred."
        )

        return alternative, reasons

    reasons.append(
        "The closest shelter was recently reported as likely closed, "
        "but no alternative was found within 150 meters."
    )

    return closest, reasons


def _select_by_accessibility(
    current_primary: dict[str, Any],
    candidates: list[dict[str, Any]],
    prefer_accessible: bool,
) -> tuple[
    dict[str, Any],
    list[str],
]:
    """Apply accessibility preference to the current recommendation."""

    reasons: list[str] = []

    if not prefer_accessible:
        return current_primary, reasons

    if (
        current_primary[
            "accessibility_status"
        ]
        == "accessible"
    ):
        return current_primary, reasons

    accessible_candidates = [
        candidate
        for candidate in candidates
        if (
            candidate["open_status"]
            != "likely_closed"
            and candidate[
                "accessibility_status"
            ]
            == "accessible"
        )
    ]

    if not accessible_candidates:
        return current_primary, reasons

    # Candidates are already sorted by distance.
    accessible_candidate = (
        accessible_candidates[0]
    )

    if (
        accessible_candidate["id"]
        == current_primary["id"]
        and accessible_candidate["source"]
        == current_primary["source"]
    ):
        return current_primary, reasons

    extra_distance = (
        accessible_candidate[
            "distance_meters"
        ]
        - current_primary[
            "distance_meters"
        ]
    )

    extra_walk_minutes = (
        accessible_candidate[
            "estimated_walk_minutes"
        ]
        - current_primary[
            "estimated_walk_minutes"
        ]
    )

    reasonable_override = (
        extra_distance
        <= ACCESSIBILITY_MAX_EXTRA_DISTANCE_METERS
        or extra_walk_minutes
        <= ACCESSIBILITY_MAX_EXTRA_WALK_MINUTES
    )

    if not reasonable_override:
        return current_primary, reasons

    reasons.append(
        "A nearby accessible shelter was preferred because "
        "the additional distance was small."
    )

    return accessible_candidate, reasons


def _build_alternatives(
    candidates: list[dict[str, Any]],
    primary: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return up to three nearby alternatives excluding the primary shelter."""

    alternatives = [
        candidate
        for candidate in candidates
        if not (
            candidate["id"]
            == primary["id"]
            and candidate["source"]
            == primary["source"]
        )
    ]

    return alternatives[
        :MAX_ALTERNATIVES
    ]


def build_emergency_recommendation_bundle(
    official_shelters: list[Shelter],
    community_shelters: list[
        CommunityShelter
    ],
    user_latitude: float,
    user_longitude: float,
    event_type: str | None,
    feedback_items: Optional[
        list[ShelterFeedback]
    ] = None,
    prefer_accessible: bool = False,
) -> dict[str, Any]:
    """Build the primary shelter recommendation and nearby alternatives."""

    policy = get_policy_for_event(
        event_type
    )

    candidates: list[
        dict[str, Any]
    ] = []

    for shelter in official_shelters:
        candidate = (
            build_official_candidate(
                shelter=shelter,
                user_latitude=user_latitude,
                user_longitude=user_longitude,
                policy=policy,
            )
        )

        if candidate:
            candidates.append(
                candidate
            )

    for shelter in community_shelters:
        candidate = (
            build_community_candidate(
                shelter=shelter,
                user_latitude=user_latitude,
                user_longitude=user_longitude,
                policy=policy,
            )
        )

        if candidate:
            candidates.append(
                candidate
            )

    if not candidates:
        return {
            "policy": policy["name"],
            "primary": None,
            "alternatives": [],
            "candidates_returned": 0,
            "recommendation_reason": None,
            "decision_reasons": [],
        }

    # Start with shelters ordered from nearest to farthest.
    candidates.sort(
        key=lambda candidate: candidate[
            "distance_meters"
        ]
    )

    _enrich_candidates_with_feedback(
        candidates,
        feedback_items or [],
    )

    # First apply recent open-status information.
    primary, open_reasons = (
        _select_by_open_status(
            candidates
        )
    )

    # Then apply accessibility preference.
    primary, accessibility_reasons = (
        _select_by_accessibility(
            current_primary=primary,
            candidates=candidates,
            prefer_accessible=prefer_accessible,
        )
    )

    decision_reasons = (
        open_reasons
        + accessibility_reasons
    )

    alternatives = _build_alternatives(
        candidates=candidates,
        primary=primary,
    )

    recommendation_reason = (
        " ".join(decision_reasons)
        if decision_reasons
        else None
    )

    return {
        "policy": policy["name"],
        "primary": primary,
        "alternatives": alternatives,
        "candidates_returned": (
            1 + len(alternatives)
        ),
        "recommendation_reason": recommendation_reason,
        "decision_reasons": decision_reasons,
    }
