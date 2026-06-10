from typing import Any


# Alert classification layer for ShelterNow.
#
# Professional architecture note:
# This file does NOT decide whether an alert matches the user.
# Matching answers: "Who is affected?"
# Classification answers: "What kind of alert is this?"
# Experience answers: "What should the app do?"
#
# This separation matters because:
# - Followed areas may only need area matching.
# - Current location alerts need event classification.
# - Not every matched alert should open emergency mode.


def _text(value: Any) -> str:
    """Convert any raw alert field into clean text."""
    return str(value or "").strip()


def _combined_text(raw_alert: dict) -> str:
    """
    Combine relevant fields for keyword matching.

    Professional note:
    CAT alone is not enough.
    Captured alerts showed that cat 10 can mean different things:
    - event ended
    - prepare / move near protected space
    """
    return " ".join([
        _text(raw_alert.get("cat")),
        _text(raw_alert.get("title")),
        _text(raw_alert.get("desc")),
    ])


def _contains_any(text: str, keywords: list[str]) -> bool:
    return any(keyword in text for keyword in keywords)


SEVERITY_RANK = {
    "none": 0,
    "info": 1,
    "warning": 2,
    "critical": 3,
    "unknown": 1,
}


CLASSIFICATION_RULES = [
    {
        # "Event ended" is not just informational.
        # Product-wise, it may close emergency mode and hide temporary access
        # to community/private shelter alternatives.
        #
        # This supports the "Taki open / Taki closed" model:
        # during an emergency we may open access to selected nearby alternatives;
        # when the event ends, that emergency access should close.
        "rule_id": "event_ended",
        "cats": ["10"],
        "keywords": ["האירוע הסתיים", "יכולים לצאת"],
        "event_type": "event_ended",
        "severity": "info",
        "recommended_action": "close_emergency_mode",
    },
    {
        "rule_id": "rocket_attack",
        "cats": ["1"],
        "keywords": ["ירי רקטות", "טילים", "היכנסו למרחב המוגן"],
        "event_type": "rocket_attack",
        "severity": "critical",
        "recommended_action": "find_nearest_shelter",
    },
    {
        "rule_id": "hostile_aircraft",
        "cats": ["6"],
        "keywords": ["כלי טייס עוין", "היכנסו מייד", "במהירות האפשרית"],
        "event_type": "hostile_aircraft",
        "severity": "critical",
        "recommended_action": "find_nearest_shelter",
    },
    {
        # Cat 10 can also be an early warning / preparation message.
        # In our product logic this SHOULD offer shelter guidance too,
        # because the user may need to move closer to a protected space before
        # a siren or direct alert arrives.
        "rule_id": "prepare_near_shelter",
        "cats": ["10"],
        "keywords": [
            "התקרבו למרחב מוגן",
            "צפויות להתקבל התרעות",
            "שפר את מיקומך",
            "זוהה שיגור",
            "בדקות הקרובות",
        ],
        "event_type": "prepare_near_shelter",
        "severity": "warning",
        "recommended_action": "find_nearest_shelter",
    },
]


def classify_alert(raw_alert: dict | None) -> dict:
    """
    Classify a raw Home Front Command-style alert.

    Returns:
    - cat
    - event_type
    - severity
    - recommended_action
    - confidence
    - matched_rule

    Professional note:
    This function should NOT generate the main user-facing alert text.
    The UI should prefer official Pikud HaOref fields:
    - raw_alert["title"]
    - raw_alert["desc"]

    The classifier only adds interpretation for product behavior.
    """
    raw_alert = raw_alert or {}

    if not raw_alert:
        return {
            "cat": None,
            "event_type": "none",
            "severity": "none",
            "severity_rank": 0,
            "recommended_action": "none",
            "confidence": "high",
            "matched_rule": "no_active_alert",
        }

    cat = _text(raw_alert.get("cat"))
    title = _text(raw_alert.get("title"))
    desc = _text(raw_alert.get("desc"))
    text = _combined_text(raw_alert)

    for rule in CLASSIFICATION_RULES:
        cat_matches = cat in rule["cats"]
        keyword_matches = _contains_any(text, rule["keywords"])

        # Professional note:
        # Require both CAT and text signal.
        # This prevents cat 10 "event ended" from being treated like
        # cat 10 "prepare near shelter".
        if cat_matches and keyword_matches:
            severity = rule["severity"]

            return {
                "cat": cat,
                "event_type": rule["event_type"],
                "severity": severity,
                "severity_rank": SEVERITY_RANK.get(severity, 1),
                "recommended_action": rule["recommended_action"],
                "confidence": "high",
                "matched_rule": rule["rule_id"],
                "source_signals": {
                    "cat": cat,
                    "title": title,
                    "desc": desc,
                    "matched_keywords": [
                        keyword
                        for keyword in rule["keywords"]
                        if keyword in text
                    ],
                },
            }

    # Safe fallback:
    # Unknown alerts should be shown, but should not automatically open
    # emergency navigation unless we understand them.
    return {
        "cat": cat or None,
        "event_type": "unknown",
        "severity": "unknown",
        "severity_rank": SEVERITY_RANK["unknown"],
        "recommended_action": "show_info_only",
        "confidence": "low",
        "matched_rule": "unknown_alert_type",
        "source_signals": {
            "cat": cat,
            "title": title,
            "desc": desc,
        },
    }


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