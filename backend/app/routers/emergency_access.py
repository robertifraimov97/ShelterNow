from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import EmergencyAccessState

router = APIRouter(
    prefix="/emergency-access",
    tags=["Emergency Access"],
)


@router.get("/status")
def get_emergency_access_status(
    area_name: str,
    db: Session = Depends(get_db),
):
    """
    Development/debug endpoint.

    Returns the current emergency-access state
    for a specific area.
    """

    state = (
        db.query(EmergencyAccessState)
        .filter(
            EmergencyAccessState.area_name == area_name
        )
        .first()
    )

    if not state:
        return {
            "area_name": area_name,
            "active": False,
            "message": "No emergency access state found.",
        }

    now = datetime.utcnow()

    seconds_remaining = max(
        0,
        int(
            (
                state.expires_at - now
            ).total_seconds()
        ),
    )

    return {
        "area_name": state.area_name,
        "active": state.expires_at > now,
        "last_alert_id": state.last_alert_id,
        "last_event_type": state.last_event_type,
        "last_relevant_alert_at": state.last_relevant_alert_at,
        "expires_at": state.expires_at,
        "seconds_remaining": seconds_remaining,
    }