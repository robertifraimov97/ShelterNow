def build_alert_experience(relevance: dict, classification: dict) -> dict:
    """
    Decide what ShelterNow should do with the alert.

    Professional note:
    This is product behavior, not classification.

    relevance:
    - current_location_match
    - matched_followed_areas

    classification:
    - event_type
    - severity
    - recommended_action
    """
    current_location_match = relevance.get("current_location_match", False)
    matched_followed_areas = relevance.get("matched_followed_areas", [])

    event_type = classification.get("event_type")
    severity = classification.get("severity")
    action = classification.get("recommended_action")

    should_offer_shelter_for_current_location = (
        current_location_match
        and action == "find_nearest_shelter"
        and severity in ["critical", "warning"]
    )

    current_location_critical = (
        current_location_match
        and severity == "critical"
        and action == "find_nearest_shelter"
    )

    current_location_warning = (
        current_location_match
        and severity == "warning"
        and action == "find_nearest_shelter"
    )

    event_ended = (
        event_type == "event_ended"
        or action == "close_emergency_mode"
    )

    return {
        # Main app mode.
        # Critical current-location alerts should reduce cognitive load
        # and focus the user on shelter guidance.
        "focus_mode": (
            "current_location_emergency"
            if current_location_critical
            else "current_location_warning"
            if current_location_warning
            else "normal"
        ),

        # Main shelter guidance behavior.
        # This includes both:
        # - cat 1 / cat 6 critical events
        # - cat 10 prepare-near-shelter warning events
        "show_nearest_shelter_button": should_offer_shelter_for_current_location,
        "should_offer_shelter_guidance": should_offer_shelter_for_current_location,

        # Community/private shelters are sensitive.
        # The app should not expose all of them globally all the time.
        # During relevant emergency/warning mode, it may expose selected nearby
        # alternatives chosen behind the scenes.
        "allow_temporary_community_shelter_access": (
            should_offer_shelter_for_current_location
            and not event_ended
        ),

        # Event-ended behavior.
        # Used to close emergency mode and hide temporary community shelter access.
        "close_emergency_mode": event_ended,
        "hide_community_shelter_access": event_ended,

        # Followed area UX.
        # Followed area alerts are important, but should not compete with
        # an emergency affecting the user's current location.
        "show_followed_area_banner": (
            bool(matched_followed_areas)
            and not current_location_critical
        ),

        # Future push notification metadata.
        # This does NOT send push notifications yet.
        "should_send_push_notification": (
            current_location_match
            or bool(matched_followed_areas)
        ),

        "push_notification_type": (
            "current_location_critical"
            if current_location_critical
            else "current_location_warning"
            if current_location_warning
            else "event_ended"
            if event_ended
            else "followed_area_alert"
            if matched_followed_areas
            else "none"
        ),
    }