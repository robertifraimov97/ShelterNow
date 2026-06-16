from datetime import datetime

from pydantic import BaseModel


class PushTokenCreate(BaseModel):
    token: str
    platform: str | None = None


class PushTokenResponse(BaseModel):
    id: int
    token: str
    platform: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True