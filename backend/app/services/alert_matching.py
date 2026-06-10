# Some Home Front Command alert areas are not simple city names.
# Until we have official alert-zone polygons, we use city-level matching
# with a small alias table for known naming exceptions.
ALERT_AREA_ALIASES = {
    "כוכב יאיר צור יגאל": [
        "כוכב יאיר - צור יגאל",
    ],
}


def area_matches_city(affected_area: str, city: str) -> bool:
    if not affected_area or not city:
        return False

    affected_area = affected_area.strip()
    city = city.strip()

    # Exact match:
    # "רמת השרון" == "רמת השרון"
    if affected_area == city:
        return True

    # Split city alert zone:
    # current city: "תל אביב"
    # affected area: "תל אביב - עבר הירקון"
    if affected_area.startswith(f"{city} -"):
        return True

    # Known naming exceptions:
    # current city: "כוכב יאיר צור יגאל"
    # affected area: "כוכב יאיר - צור יגאל"
    return affected_area in ALERT_AREA_ALIASES.get(city, [])


def classify_alert_relevance(
    affected_areas: list[str],
    current_city: str | None,
    followed_areas: list[str],
) -> dict:
    affected_areas = affected_areas or []
    followed_areas = followed_areas or []

    affected_set = set(affected_areas)
    followed_set = set(followed_areas)

    # Current-location matching is currently city-level.
    # Future upgrade: replace/extend this with polygon-level matching:
    # GPS point -> Home Front Command alert zone polygon -> affected area.
    current_location_match = (
        any(
            area_matches_city(area, current_city)
            for area in affected_areas
        )
        if current_city
        else False
    )

    # Followed areas are matched exactly because the user can follow
    # the same alert-area names that appear in the alert feed.
    matched_followed_areas = list(affected_set & followed_set)

    if current_location_match:
        priority = "emergency"
    elif matched_followed_areas:
        priority = "followed_area"
    else:
        priority = "none"

    return {
        "priority": priority,
        "match_strategy": "city_level",
        "current_location_match": current_location_match,
        "current_location_alert": current_city if current_location_match else None,
        "matched_followed_areas": matched_followed_areas,
        "show_nearest_shelter_button": current_location_match,
    }