from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import PushToken
from app.schemas.push_token import (
    PushTokenCreate,
    PushTokenResponse,
)
import requests

# Push Notifications Router
#
# Responsibility:
# Receive Expo Push Tokens from the mobile app
# and store them in the database.
#
# Flow:
#
# Mobile app
#   ↓
# Expo Push Token
#   ↓
# POST /push/register
#   ↓
# Neon / PostgreSQL
#   ↓
# Backend can later send notifications to this device.

router = APIRouter(prefix="/push", tags=["Push Notifications"])


@router.post("/register", response_model=PushTokenResponse)
def register_push_token(
    push_token: PushTokenCreate,
    db: Session = Depends(get_db),
):
    # Check if this device token already exists.
    #
    # This prevents duplicate rows when the user opens
    # the app multiple times or revisits the Alerts screen.

    existing_token = (
        db.query(PushToken).filter(PushToken.token == push_token.token).first()
    )

    if existing_token:
        return existing_token

    # Create a new push token row.
    #
    # At this stage, the token represents a real device
    # that Expo can target with push notifications.

    new_token = PushToken(
        token=push_token.token,
        platform=push_token.platform,
    )

    # Save the token in Neon/PostgreSQL.

    db.add(new_token)
    db.commit()

    # Refresh loads DB-generated fields such as:
    # - id
    # - created_at

    db.refresh(new_token)

    return new_token


@router.post("/test")
def send_test_push_notification(
    db: Session = Depends(get_db),
):
    tokens = db.query(PushToken).all()

    if not tokens:
        return {
            "status": "no_tokens",
            "message": "No push tokens registered.",
        }

    messages = [
        {
            "to": token.token,
            "sound": "default",
            "title": "ShelterNow test",
            "body": "Push notifications are working.",
            "data": {
                "type": "test_push",
            },
        }
        for token in tokens
    ]

    response = requests.post(
        "https://exp.host/--/api/v2/push/send",
        json=messages,
        timeout=10,
    )

    return {
        "status": "sent",
        "tokens_count": len(tokens),
        "expo_response": response.json(),
    }
