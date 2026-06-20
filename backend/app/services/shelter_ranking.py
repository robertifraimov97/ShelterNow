from typing import List, Optional

from app.db.models import Shelter


# Calculate the straight-line distance in meters between two geographic points
# using the Haversine formula.
def calculate_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> int:
    from math import radians, sin, cos, sqrt, atan2

    # Approximate Earth radius in meters.
    earth_radius = 6371000

    # Convert latitude and longitude differences from degrees to radians.
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)

    # Apply the Haversine formula.
    a = (
        sin(d_lat / 2) * sin(d_lat / 2)
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(d_lon / 2)
        * sin(d_lon / 2)
    )

    c = 2 * atan2(sqrt(a), sqrt(1 - a))

    # Return the distance rounded to the nearest whole meter.
    return round(earth_radius * c)


# Estimate walking time in minutes based on the shelter distance.
def estimate_walk_minutes(distance_meters: int) -> int:
    # Assumed walking speed in meters per minute.
    walking_speed_meters_per_minute = 80

    # Always return at least 1 minute.
    return max(1, round(distance_meters / walking_speed_meters_per_minute))


# Build a unique key for a shelter so duplicate shelters can be filtered out.
def get_shelter_unique_key(shelter: Shelter) -> str:
    return "|".join(
        [
            (shelter.name or "").strip().lower(),
            (shelter.address or "").strip().lower(),
            str(shelter.latitude),
            str(shelter.longitude),
        ]
    )


# Remove duplicate shelters while preserving the first occurrence of each one.
def get_unique_shelters(shelters: List[Shelter]) -> List[Shelter]:
    unique_shelters_map = {}

    for shelter in shelters:
        key = get_shelter_unique_key(shelter)

        if key not in unique_shelters_map:
            unique_shelters_map[key] = shelter

    return list(unique_shelters_map.values())


# Rank shelters for a user by distance from the user's current location.
def rank_shelters_for_user(
    shelters: List[Shelter],
    user_latitude: float,
    user_longitude: float,
) -> List[dict]:
    # Keep only shelters that have valid coordinates.
    valid_shelters = [
        shelter
        for shelter in shelters
        if shelter.latitude is not None and shelter.longitude is not None
    ]

    # Return an empty list if there are no valid shelters.
    if not valid_shelters:
        return []

    # Remove duplicate shelters before ranking.
    unique_shelters = get_unique_shelters(valid_shelters)

    ranked_shelters = []

    for shelter in unique_shelters:
        # Calculate the distance between the user and the shelter.
        distance_meters = calculate_distance_meters(
            user_latitude,
            user_longitude,
            shelter.latitude,
            shelter.longitude,
        )

        # Store the shelter along with calculated ranking data.
        ranked_shelters.append(
            {
                "shelter": shelter,
                "distance_meters": distance_meters,
                "estimated_walk_minutes": estimate_walk_minutes(distance_meters),
            }
        )

    # Sort shelters from nearest to farthest.
    ranked_shelters.sort(key=lambda item: item["distance_meters"])

    return ranked_shelters


# Return the single best shelter for the user, which is the nearest ranked shelter.
def choose_best_shelter_for_user(
    shelters: List[Shelter],
    user_latitude: float,
    user_longitude: float,
) -> Optional[dict]:
    ranked_shelters = rank_shelters_for_user(
        shelters=shelters,
        user_latitude=user_latitude,
        user_longitude=user_longitude,
    )

    return ranked_shelters[0] if ranked_shelters else None
