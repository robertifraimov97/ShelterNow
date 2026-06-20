from datetime import datetime

from pydantic import BaseModel


# Request schema used when saving a push notification token.
class PushTokenCreate(BaseModel):
    # The device push token used for sending notifications.
    token: str

    # Optional platform information such as iOS or Android.
    platform: str | None = None


# Response schema returned for push token endpoints.
class PushTokenResponse(BaseModel):
    # Unique push token record identifier.
    id: int

    # The stored device push token.
    token: str

    # Optional platform information associated with the token.
    platform: str | None = None

    # Timestamp for when the token was created.
    created_at: datetime

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True
