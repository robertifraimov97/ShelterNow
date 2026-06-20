import requests

from sqlalchemy.orm import Session

from app.db.models import PushToken


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_push_to_all_registered_devices(
    db: Session,
    title: str,
    body: str,
    data: dict | None = None,
):
    """
    Send a push notification to all registered devices.

    This function is the reusable push-sending layer.

    Flow:
    Backend
      ↓
    Load Expo Push Tokens from Neon/PostgreSQL
      ↓
    Send messages to Expo Push API
      ↓
    Expo delivers notifications to iOS/Android devices
    """
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
            "title": title,
            "body": body,
            "data": data or {},
        }
        for token in tokens
    ]

    response = requests.post(
        EXPO_PUSH_URL,
        json=messages,
        timeout=10,
    )

    return {
        "status": "sent",
        "tokens_count": len(tokens),
        "expo_response": response.json(),
    }