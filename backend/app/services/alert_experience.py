EMERGENCY_ACCESS_DURATION_SECONDS = 15 * 60


def build_alert_experience(relevance: dict, classification: dict) -> dict:
    """
    Decide what ShelterNow should do with the alert.

    Professional note:
    This is product behavior, not classification.

    Backend decides the emergency-access policy.
    Frontend/device may persist the resulting expiration time locally.

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

    should_activate_emergency_access = (
        should_offer_shelter_for_current_location
        and not event_ended
    )

    return {
        "focus_mode": (
            "current_location_emergency"
            if current_location_critical
            else "current_location_warning"
            if current_location_warning
            else "normal"
        ),

        "show_nearest_shelter_button": should_offer_shelter_for_current_location,
        "should_offer_shelter_guidance": should_offer_shelter_for_current_location,

        "allow_temporary_community_shelter_access": should_activate_emergency_access,

        # Emergency access lifecycle policy.
        #
        # This does not mean "the security event is over".
        # It only tells the app how long to keep enhanced emergency access active
        # after the latest relevant current-location alert.
        #
        # Every new relevant alert should extend the local/device timer.
        "should_activate_emergency_access": should_activate_emergency_access,
        "emergency_access_duration_seconds": (
            EMERGENCY_ACCESS_DURATION_SECONDS
            if should_activate_emergency_access
            else 0
        ),
        "emergency_access_reason": (
            "current_location_critical_alert"
            if current_location_critical
            else "current_location_warning_alert"
            if current_location_warning
            else "none"
        ),

        # Event-ended behavior.
        #
        # For V1, event-ended should be treated carefully.
        # Because we currently match current location at city level, an event-ended
        # alert for one sub-area should not automatically close emergency access
        # for the entire city.
        #
        # The frontend should not force-close emergency access based only on this
        # city-level signal. Timeout is the safer V1 fallback.
        "close_emergency_mode": False,
        "hide_community_shelter_access": False,
        "event_ended_info_only": event_ended,

        "show_followed_area_banner": (
            bool(matched_followed_areas)
            and not current_location_critical
        ),

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