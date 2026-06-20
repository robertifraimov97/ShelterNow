import requests

from sqlalchemy.orm import Session

from app.db.models import PushToken


# Expo push notifications API endpoint used to send notifications to registered devices.
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
    # Load all saved push tokens from the database.
    tokens = db.query(PushToken).all()

    # If no devices are registered, return early with a descriptive result.
    if not tokens:
        return {
            "status": "no_tokens",
            "message": "No push tokens registered.",
        }

    # Build the message payload list expected by the Expo Push API.
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

    # Send the push notification request to Expo.
    response = requests.post(
        EXPO_PUSH_URL,
        json=messages,
        timeout=10,
    )

    # Return a summary of the sending result including the Expo API response.
    return {
        "status": "sent",
        "tokens_count": len(tokens),
        "expo_response": response.json(),
    }
