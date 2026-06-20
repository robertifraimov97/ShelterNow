# Duration for which temporary emergency community shelter access stays active
# after a relevant current-location alert.
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
    # Read relevance information about whether the user's current location
    # or followed areas are affected.
    current_location_match = relevance.get("current_location_match", False)
    matched_followed_areas = relevance.get("matched_followed_areas", [])

    # Read the classification output that describes the event type,
    # severity, and recommended product action.
    event_type = classification.get("event_type")
    severity = classification.get("severity")
    action = classification.get("recommended_action")

    # Decide whether the app should offer shelter guidance
    # for the user's current location.
    should_offer_shelter_for_current_location = (
        current_location_match
        and action == "find_nearest_shelter"
        and severity in ["critical", "warning"]
    )

    # Detect a critical current-location shelter event.
    current_location_critical = (
        current_location_match
        and severity == "critical"
        and action == "find_nearest_shelter"
    )

    # Detect a warning-level current-location shelter event.
    current_location_warning = (
        current_location_match
        and severity == "warning"
        and action == "find_nearest_shelter"
    )

    # Detect whether this alert represents an event-ended signal.
    event_ended = (
        event_type == "event_ended"
        or action == "close_emergency_mode"
    )

    # Temporary emergency access should be activated only
    # when shelter guidance should be offered and the event did not end.
    should_activate_emergency_access = (
        should_offer_shelter_for_current_location
        and not event_ended
    )

    # Build the final product behavior response for the frontend.
    return {
        # Determines which UI focus mode the app should use.
        "focus_mode": (
            "current_location_emergency"
            if current_location_critical
            else "current_location_warning"
            if current_location_warning
            else "normal"
        ),

        # Controls whether the UI should show shelter-related actions.
        "show_nearest_shelter_button": should_offer_shelter_for_current_location,
        "should_offer_shelter_guidance": should_offer_shelter_for_current_location,

        # Controls whether temporary community shelter access should be enabled.
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

        # Show a followed-area banner only when followed areas matched
        # and the current location is not in a critical alert state.
        "show_followed_area_banner": (
            bool(matched_followed_areas)
            and not current_location_critical
        ),

        # Decide whether a push notification should be sent.
        "should_send_push_notification": (
            current_location_match
            or bool(matched_followed_areas)
        ),

        # Define the push notification type based on alert priority.
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
