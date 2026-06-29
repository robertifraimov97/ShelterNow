from typing import Any

from app.db.models import Shelter, CommunityShelter
from app.services.shelter_ranking import (
    calculate_distance_meters,
    estimate_walk_minutes,
)


MAX_ALTERNATIVES = 3
MAX_CANDIDATES_RETURNED = 1 + MAX_ALTERNATIVES


def get_policy_for_event(event_type: str | None) -> dict[str, Any]:
    """
    Return decision policy according to the emergency type.

    Different emergency types should not behave exactly the same.

    rocket_attack:
    - Very time-sensitive.
    - Distance matters more.

    prepare_near_shelter:
    - User may have slightly more time.
    - Reliability / public shelters can matter more.
    """

    if event_type == "prepare_near_shelter":
        return {
            "name": "preparation_policy",
            "official_bonus": 45,
            "community_penalty": 20,
            "distance_weight": 0.40,
            "accessibility_bonus": 8,
            "status_unknown_bonus": 5,
        }

    return {
        "name": "immediate_shelter_policy",
        "official_bonus": 40,
        "community_penalty": 25,
        "distance_weight": 0.60,
        "accessibility_bonus": 6,
        "status_unknown_bonus": 4,
    }


def distance_score(distance_meters: int) -> float:
    """
    Convert distance into a 0-100 score.

    V1:
    - 0 meters = 100
    - 1000 meters or more = 0

    Future:
    Replace or enrich this with real walking time from routing.py.
    """

    max_relevant_distance = 1000

    score = 100 * (
        1 - min(distance_meters, max_relevant_distance)
        / max_relevant_distance
    )

    return max(0, score)


def build_official_candidate(
    shelter: Shelter,
    user_latitude: float,
    user_longitude: float,
    policy: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Convert an official shelter into a decision candidate.
    """

    if shelter.latitude is None or shelter.longitude is None:
        return None

    distance_meters = calculate_distance_meters(
        user_latitude,
        user_longitude,
        shelter.latitude,
        shelter.longitude,
    )

    score = 0

    # Official shelters get strong baseline priority.
    score += policy["official_bonus"]

    # Distance is still very important, especially during real sirens.
    score += distance_score(distance_meters) * policy["distance_weight"]

    # Accessibility information increases usefulness.
    if shelter.accessibility_notes:
        score += policy["accessibility_bonus"]

    # Unknown is acceptable for official shelters in V1,
    # because municipal data is still more trusted than user submissions.
    if shelter.status in ["unknown", "open", "available"]:
        score += policy["status_unknown_bonus"]

    return {
        "id": shelter.id,
        "source": "official",
        "name": shelter.name,
        "city": shelter.city,
        "address": shelter.address,
        "latitude": shelter.latitude,
        "longitude": shelter.longitude,
        "distance_meters": distance_meters,
        "estimated_walk_minutes": estimate_walk_minutes(distance_meters),
        "score": round(score, 2),
        "debug": {
            "policy": policy["name"],
            "official_bonus": policy["official_bonus"],
            "status": shelter.status,
        },
    }


def build_community_candidate(
    shelter: CommunityShelter,
    user_latitude: float,
    user_longitude: float,
    policy: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Convert a community shelter into a decision candidate.

    V1 is conservative:
    - community shelter must be active
    - must be emergency-only
    - must have coordinates

    Future:
    require verified/trust_score/recent reports.
    """

    if not shelter.is_active:
        return None

    if not shelter.show_only_during_emergency:
        return None

    if shelter.latitude is None or shelter.longitude is None:
        return None

    distance_meters = calculate_distance_meters(
        user_latitude,
        user_longitude,
        shelter.latitude,
        shelter.longitude,
    )

    score = 0

    # Community shelters are useful but less trusted in V1.
    score -= policy["community_penalty"]

    score += distance_score(distance_meters) * policy["distance_weight"]

    if shelter.is_accessible:
        score += policy["accessibility_bonus"]

    return {
        "id": shelter.id,
        "source": "community",
        "name": shelter.name,
        "city": shelter.city,
        "address": shelter.address,
        "latitude": shelter.latitude,
        "longitude": shelter.longitude,
        "distance_meters": distance_meters,
        "estimated_walk_minutes": estimate_walk_minutes(distance_meters),
        "score": round(score, 2),
        "debug": {
            "policy": policy["name"],
            "community_penalty": policy["community_penalty"],
            "verified": "not_implemented_yet",
        },
    }


def build_emergency_recommendation_bundle(
    official_shelters: list[Shelter],
    community_shelters: list[CommunityShelter],
    user_latitude: float,
    user_longitude: float,
    event_type: str | None,
) -> dict[str, Any]:
    """
    Build a limited emergency shelter recommendation bundle.

    Output:
    - one primary shelter
    - up to three alternatives

    Important:
    This function intentionally does not expose the full shelter database.
    """

    policy = get_policy_for_event(event_type)

    candidates = []

    for shelter in official_shelters:
        candidate = build_official_candidate(
            shelter=shelter,
            user_latitude=user_latitude,
            user_longitude=user_longitude,
            policy=policy,
        )

        if candidate:
            candidates.append(candidate)

    for shelter in community_shelters:
        candidate = build_community_candidate(
            shelter=shelter,
            user_latitude=user_latitude,
            user_longitude=user_longitude,
            policy=policy,
        )

        if candidate:
            candidates.append(candidate)

    candidates.sort(
        key=lambda candidate: candidate["score"],
        reverse=True,
    )

    limited_candidates = candidates[:MAX_CANDIDATES_RETURNED]

    primary = limited_candidates[0] if limited_candidates else None
    alternatives = limited_candidates[1:] if primary else []

    return {
        "policy": policy["name"],
        "primary": primary,
        "alternatives": alternatives,
        "candidates_returned": len(limited_candidates),
    }