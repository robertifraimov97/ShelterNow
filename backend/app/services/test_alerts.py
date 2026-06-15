"""
Fake alert framework.

Purpose:
Allow testing the full alert pipeline without waiting
for real Home Front Command alerts.

Professional note:
All scenarios should be based on captured alerts whenever possible.
"""


TEST_ALERT_SCENARIOS = {
    "rocket_attack": {
        "id": "test-rocket",
        "cat": "1",
        "title": "ירי רקטות וטילים",
        "data": [
            "כפר סבא",
            "אשדוד",
            "תל אביב-יפו",
        ],
        "desc": "היכנסו למרחב המוגן ושהו בו 10 דקות.",
    },

    "hostile_aircraft": {
        "id": "test-aircraft",
        "cat": "6",
        "title": "חדירת כלי טייס עוין",
        "data": [
            "כפר סבא",
            "אשדוד",
        ],
        "desc": "היכנסו למרחב מוגן במהירות האפשרית.",
    },

    "prepare_near_shelter": {
        "id": "test-prepare",
        "cat": "10",
        "title": "בדקות הקרובות צפויות להתקבל התרעות",
        "data": [
            "כפר סבא",
            "אשדוד",
        ],
        "desc": "התקרבו למרחב מוגן.",
    },

    "event_ended": {
        "id": "test-ended",
        "cat": "10",
        "title": "האירוע הסתיים",
        "data": [
            "כפר סבא",
            "אשדוד",
        ],
        "desc": "ניתן לצאת מהמרחב המוגן.",
    },
}


_active_test_alert = None


def set_test_alert(scenario_name: str):
    global _active_test_alert

    if scenario_name not in TEST_ALERT_SCENARIOS:
        raise ValueError(f"Unknown scenario: {scenario_name}")

    _active_test_alert = TEST_ALERT_SCENARIOS[scenario_name]


def clear_test_alert():
    global _active_test_alert
    _active_test_alert = None


def get_active_test_alert():
    return _active_test_alert
