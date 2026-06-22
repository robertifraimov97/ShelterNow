from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import EmergencyAccessState
from app.services.alert_experience import (
    EMERGENCY_ACCESS_DURATION_SECONDS,
)


# Emergency Access Service
#
# Responsibility:
# Manage temporary emergency-access windows per area.
#
# Important:
# This service does NOT expose community shelters directly.
# It only tracks whether an area currently has an active emergency window.
#
# Shelter exposure should later happen through a limited recommendation endpoint:
# primary shelter + a few alternatives, not the full community shelter database.


def activate_or_extend_emergency_access(
    db: Session,
    area_name: str,
    alert_id: str,
    event_type: str,
) -> EmergencyAccessState:
    """
    Create or extend an emergency access window for an area.

    Rules:

    New relevant alert:
        expires_at = now + duration

    Same alert seen again via polling:
        do nothing

    Different relevant alert:
        extend again to now + duration
    """

    now = datetime.utcnow()

    expires_at = now + timedelta(
        seconds=EMERGENCY_ACCESS_DURATION_SECONDS
    )

    state = (
        db.query(EmergencyAccessState)
        .filter(
            EmergencyAccessState.area_name == area_name,
        )
        .first()
    )

    # Same alert already processed.
    #
    # This prevents polling from repeatedly extending
    # the emergency-access timer.
    if state and state.last_alert_id == alert_id:
        return state

    # First relevant alert for this area.
    if not state:
        state = EmergencyAccessState(
            area_name=area_name,
            last_alert_id=alert_id,
            last_event_type=event_type,
            last_relevant_alert_at=now,
            expires_at=expires_at,
        )

        db.add(state)

    # Existing area state.
    #
    # A new relevant alert extends the emergency window.
    else:
        state.last_alert_id = alert_id
        state.last_event_type = event_type
        state.last_relevant_alert_at = now
        state.expires_at = expires_at

    db.commit()
    db.refresh(state)

    return state


def is_emergency_access_active(
    state: EmergencyAccessState | None,
) -> bool:
    """
    Check whether emergency access is still active for an area.
    """

    if not state:
        return False

    return state.expires_at > datetime.utcnow()