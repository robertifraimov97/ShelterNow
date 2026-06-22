from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db

from app.services.alerts import get_current_alerts
from app.services.alert_matching import classify_alert_relevance
from app.services.alert_classification import classify_alert
from app.services.alert_experience import build_alert_experience
from app.services.test_alerts import (
    set_test_alert,
    clear_test_alert,
    get_active_test_alert,
)
from app.services.emergency_access import (
    activate_or_extend_emergency_access,
)

# Create a router for all alert-related endpoints.
router = APIRouter(prefix="/alerts", tags=["Alerts"])


def build_alert_response(
    alert_data: dict,
    current_city: str | None,
    followed_areas: list[str],
    db: Session,
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
    # Extract the raw alert payload from the wrapped alert response.
    raw_alert = alert_data.get("raw", {})

    # Read the list of affected areas from the raw alert if one exists.
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

    # Emergency access layer:
    #
    # If the alert is relevant to the user's current location,
    # and the experience layer says emergency access should be activated,
    # we open or extend a backend-controlled emergency-access window
    # for every affected alert area.
    #
    # Important:
    # This does NOT expose community shelters directly.
    # It only records that these areas currently have an active
    # emergency-access window.
    #
    # Shelter exposure will later be controlled by a limited recommendation
    # endpoint that returns only a primary shelter + a few alternatives.
    if experience.get("should_activate_emergency_access", False):
        alert_id = raw_alert.get("id")
        event_type = classification.get("event_type")

        # Only process alerts that have a stable ID.
        #
        # This prevents polling the same alert from extending
        # the emergency-access timer repeatedly.
        if alert_id:
            for area_name in affected_areas:
                activate_or_extend_emergency_access(
                    db=db,
                    area_name=area_name,
                    alert_id=alert_id,
                    event_type=event_type,
                )

    # Return the final alert API response with all decision layers included.

    # Return the final alert API response with all decision layers included.
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
    db: Session = Depends(get_db),
):
    """
    Main alerts endpoint.

    During development, an active test alert overrides the real feed.
    This lets us test:
    fake alert -> relevance -> classification -> experience -> frontend.
    """
    # Check whether a fake test alert is currently active.
    active_test_alert = get_active_test_alert()

    # If a test alert is active, use it instead of the real alert feed.
    if active_test_alert:
        alert_data = {
            "source": "test",
            "raw": active_test_alert,
            "has_active_alert": True,
        }
    else:
        # Otherwise, fetch the real current alerts.
        alert_data = get_current_alerts()

    # Build and return the full structured alert response.
    return build_alert_response(
        alert_data=alert_data,
        current_city=current_city,
        followed_areas=followed_areas,
         db=db,
    )


@router.get("/test-relevance")
def test_relevance(
    db: Session = Depends(get_db),
):
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
    # Hardcoded test alert used for development and pipeline validation.
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

    # Return a test response using sample current and followed areas.
    return build_alert_response(
        alert_data=alert_data,
        current_city="כפר סבא",
        followed_areas=["כפר סבא", "חולון"],
        db=db,
    )


@router.post("/test-alerts/scenario/{scenario_name}")
def activate_test_alert_scenario(scenario_name: str):
    """
    Activate a fake alert scenario.

    Professional note:
    This is a development/testing endpoint.
    It should not be exposed in production without protection.
    """
    # Try to activate the requested fake alert scenario.
    try:
        set_test_alert(scenario_name)
    except ValueError as error:
        # Return 404 if the requested test scenario does not exist.
        raise HTTPException(status_code=404, detail=str(error))

    # Return confirmation that the test alert scenario was activated.
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
    # Clear the currently active fake alert scenario.
    clear_test_alert()

    # Return confirmation that the test alert was cleared.
    return {
        "status": "cleared",
        "message": "Test alert cleared.",
    }
