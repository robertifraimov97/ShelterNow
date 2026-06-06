def classify_alert_relevance(
    affected_areas: list[str],
    current_city: str | None,
    followed_areas: list[str],
) -> dict:
    affected_set = set(affected_areas or [])
    followed_set = set(followed_areas or [])

    current_location_match = (
        current_city in affected_set
        if current_city
        else False
    )

    matched_followed_areas = list(affected_set & followed_set)

    if current_location_match:
        priority = "emergency"
    elif matched_followed_areas:
        priority = "followed_area"
    else:
        priority = "none"

    return {
        "priority": priority,
        "current_location_match": current_location_match,
        "current_location_alert": current_city if current_location_match else None,
        "matched_followed_areas": matched_followed_areas,
        "show_nearest_shelter_button": current_location_match,
    }