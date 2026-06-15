# Some Home Front Command alert areas are not simple city names.
# Until we have official alert-zone polygons, we use city-level matching
# with a small alias table for known naming exceptions.
#
# Professional note:
# GPS reverse geocoding may return names in different languages or formats,
# depending on the phone language and provider.
#
# Examples we already observed:
# - "תל אביב-יפו"
# - "Tel Aviv-Yafo"
#
# Home Front Command may use alert-zone names such as:
# - "תל אביב - מרכז העיר"
# - "תל אביב - עבר הירקון"
#
# Therefore matching must compare normalized/canonical names,
# not raw strings.

CITY_ALIASES = {
    # Tel Aviv GPS / reverse-geocoding variants
    "תל אביב-יפו": "תל אביב",
    "תל אביב יפו": "תל אביב",
    "תל-אביב יפו": "תל אביב",
    "Tel Aviv-Yafo": "תל אביב",
    "Tel Aviv Yafo": "תל אביב",
    "Tel Aviv": "תל אביב",

    # Common English GPS variants
    "Herzliya": "הרצליה",
    "Kfar Saba": "כפר סבא",
    "Jerusalem": "ירושלים",
    "Haifa": "חיפה",
    "Ashdod": "אשדוד",
    "Ramat Gan": "רמת גן",
    "Ramat Hasharon": "רמת השרון",
}

ALERT_AREA_ALIASES = {
    "כוכב יאיר צור יגאל": [
        "כוכב יאיר - צור יגאל",
    ],
}


def normalize_area_name(area_name: str | None) -> str:
    """
    Normalize GPS city names and Home Front Command alert-area names
    into a shared canonical form.

    This is an MVP city-level normalization layer.

    Future upgrade:
    GPS point -> official Home Front Command alert-zone polygon.
    """
    if not area_name:
        return ""

    normalized = area_name.strip()

    # Convert known GPS / English / naming variants to canonical Hebrew names.
    normalized = CITY_ALIASES.get(normalized, normalized)

    # Home Front Command Tel Aviv sub-areas:
    # "תל אביב - מרכז העיר" -> "תל אביב"
    # "תל אביב - עבר הירקון" -> "תל אביב"
    if normalized.startswith("תל אביב -"):
        return "תל אביב"

    return normalized


def area_matches_city(affected_area: str, city: str) -> bool:
    if not affected_area or not city:
        return False

    raw_affected_area = affected_area.strip()
    raw_city = city.strip()

    affected_area = normalize_area_name(raw_affected_area)
    city = normalize_area_name(raw_city)

    # Exact canonical match:
    # "Tel Aviv-Yafo" -> "תל אביב"
    # "תל אביב - מרכז העיר" -> "תל אביב"
    if affected_area == city:
        return True

    # Generic split city alert zone:
    # current city: "תל אביב"
    # affected area: "תל אביב - עבר הירקון"
    if raw_affected_area.startswith(f"{city} -"):
        return True

    # Known naming exceptions:
    # current city: "כוכב יאיר צור יגאל"
    # affected area: "כוכב יאיר - צור יגאל"
    return raw_affected_area in ALERT_AREA_ALIASES.get(city, [])


def classify_alert_relevance(
    affected_areas: list[str],
    current_city: str | None,
    followed_areas: list[str],
) -> dict:
    affected_areas = affected_areas or []
    followed_areas = followed_areas or []

    normalized_affected_areas = [
        normalize_area_name(area)
        for area in affected_areas
    ]

    normalized_followed_areas = {
        normalize_area_name(area): area
        for area in followed_areas
    }

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

    # Followed areas are matched using normalized names,
    # but we return the original followed-area names for display in the frontend.
    matched_followed_areas = [
        original_followed_area
        for normalized_followed_area, original_followed_area in normalized_followed_areas.items()
        if normalized_followed_area in normalized_affected_areas
    ]

    if current_location_match:
        priority = "emergency"
    elif matched_followed_areas:
        priority = "followed_area"
    else:
        priority = "none"

    return {
        "priority": priority,
        "match_strategy": "city_level_normalized",
        "current_location_match": current_location_match,
        "current_location_alert": current_city if current_location_match else None,
        "matched_followed_areas": matched_followed_areas,
        "show_nearest_shelter_button": current_location_match,
    }