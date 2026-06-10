from fastapi import APIRouter, Query, HTTPException

from app.services.alerts import get_current_alerts
from app.services.alert_matching import classify_alert_relevance
from app.services.alert_classification import (
    classify_alert,
    build_alert_experience,
)
from app.services.test_alerts import (
    set_test_alert,
    clear_test_alert,
    get_active_test_alert,
)


router = APIRouter(prefix="/alerts", tags=["Alerts"])


def build_alert_response(
    alert_data: dict,
    current_city: str | None,
    followed_areas: list[str],
) -> dict:
    """
    Build the full alert API response.

    Professional architecture note:
    This response intentionally has 4 layers:

    1. alert
       Raw Home Front Command / test alert data.

    2. relevance
       Who is affected?

    3. classification
       What kind of event is this?

    4. experience
       What should ShelterNow do now?

    This keeps ingestion, matching, classification and product behavior separated.
    """
    raw_alert = alert_data.get("raw", {})
    affected_areas = raw_alert.get("data", []) if raw_alert else []

    # Relevance layer:
    # Answers:
    # - Is the user's current location affected?
    # - Are any followed areas affected?
    #
    # This layer does NOT care what type of alert it is.
    relevance = classify_alert_relevance(
        affected_areas=affected_areas,
        current_city=current_city,
        followed_areas=followed_areas,
    )

    # Classification layer:
    # Answers:
    # - What happened?
    # - How severe is it?
    #
    # Professional note:
    # We intentionally do NOT trust CAT alone because captured alerts showed
    # that a single CAT may represent multiple event types.
    classification = classify_alert(raw_alert)

    # Experience layer:
    # Answers:
    # - Should we offer shelter guidance?
    # - Should emergency mode be opened?
    # - Should followed-area banners be shown?
    #
    # Professional note:
    # This is product behavior.
    # It may later move into a dedicated alert_experience.py module.
    experience = build_alert_experience(
        relevance=relevance,
        classification=classification,
    )

    # Response contract:
    # Frontend can keep using existing relevance fields,
    # but should gradually migrate to classification + experience.
    return {
        "alert": alert_data,
        "relevance": relevance,
        "classification": classification,
        "experience": experience,
    }


@router.get("/")
def get_alerts(
    current_city: str | None = None,
    followed_areas: list[str] = Query(default=[]),
):
    """
    Main alerts endpoint.

    During development, an active test alert overrides the real feed.
    This lets us test:
    fake alert -> relevance -> classification -> experience -> frontend.
    """
    active_test_alert = get_active_test_alert()

    if active_test_alert:
        alert_data = {
            "source": "test",
            "raw": active_test_alert,
            "has_active_alert": True,
        }
    else:
        alert_data = get_current_alerts()

    return build_alert_response(
        alert_data=alert_data,
        current_city=current_city,
        followed_areas=followed_areas,
    )


@router.get("/test-relevance")
def test_relevance():
    """
    Development endpoint.

    Purpose:
    Validate the full alert pipeline without waiting for real alerts.

    Professional note:
    This is now mostly a quick sanity check.
    The preferred development flow is:
    POST /alerts/test-alerts/scenario/{scenario_name}
    then GET /alerts/
    """
    alert_data = {
        "source": "test",
        "raw": {
            "id": "test-relevance",
            "cat": "1",
            "title": "ירי רקטות וטילים",
            "data": [
                "כפר סבא",
                "אשדוד",
            ],
            "desc": "היכנסו למרחב המוגן ושהו בו 10 דקות.",
        },
        "has_active_alert": True,
    }

    return build_alert_response(
        alert_data=alert_data,
        current_city="כפר סבא",
        followed_areas=["כפר סבא", "חולון"],
    )


@router.post("/test-alerts/scenario/{scenario_name}")
def activate_test_alert_scenario(scenario_name: str):
    """
    Activate a fake alert scenario.

    Professional note:
    This is a development/testing endpoint.
    It should not be exposed in production without protection.
    """
    try:
        set_test_alert(scenario_name)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error))

    return {
        "status": "active",
        "scenario": scenario_name,
        "message": "Test alert scenario activated.",
    }


@router.delete("/test-alerts")
def deactivate_test_alert():
    """
    Clear the active fake alert.

    After this, /alerts/ will return the real Home Front Command feed again.
    """
    clear_test_alert()

    return {
        "status": "cleared",
        "message": "Test alert cleared.",
    }