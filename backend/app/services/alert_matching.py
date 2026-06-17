# Some Home Front Command alert areas are not simple city names.
# Until we have official alert-zone polygons, we use city-level matching
# with a controlled normalization layer.
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
# - "אשדוד - א,ב,ד,ה"
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

# Only these prefixes are treated as city-level parent areas.
#
# Important:
# Not every Home Front Command area containing " - " is a sub-area.
#
# Examples that should NOT be blindly split:
# - "כוכב יאיר - צור יגאל"
# - "בית יצחק - שער חפר"
# - "ג'ש - גוש חלב"
#
# Therefore we only collapse known city sub-area groups.
CITY_SUB_AREA_PREFIXES = {
    "אשדוד",
    "אשקלון",
    "באר שבע",
    "הרצליה",
    "חדרה",
    "חיפה",
    "ירושלים",
    "מודיעין",
    "נתניה",
    "עכו",
    "ראשון לציון",
    "רמת גן",
    "תל אביב",
    "צפת",
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

    # Controlled city sub-area normalization.
    #
    # Examples:
    # "אשדוד - א,ב,ד,ה" -> "אשדוד"
    # "תל אביב - מרכז העיר" -> "תל אביב"
    # "ירושלים - מערב" -> "ירושלים"
    #
    # We only do this for known city sub-area prefixes
    # to avoid damaging compound settlement names.
    if " - " in normalized:
        parent_area = normalized.split(" - ", 1)[0]

        if parent_area in CITY_SUB_AREA_PREFIXES:
            return parent_area

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
    # "אשדוד - א,ב,ד,ה" -> "אשדוד"
    if affected_area == city:
        return True

    # Generic split city alert zone:
    # current city: "תל אביב"
    # affected area: "תל אביב - עבר הירקון"
    #
    # This remains as an additional fallback.
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

    # Followed areas use the same matching logic as current location.
    #
    # This is important because users may follow specific Home Front Command
    # sub-areas, while alerts may sometimes arrive at city level.
    #
    # Example:
    # affected area: "אשדוד"
    # followed area: "אשדוד - א,ב,ד,ה"
    #
    # We return the original followed-area names so the frontend can display
    # exactly what the user follows.
    matched_followed_areas = [
        followed_area
        for followed_area in followed_areas
        if any(
            area_matches_city(
                affected_area=affected_area,
                city=followed_area,
            )
            for affected_area in affected_areas
        )
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