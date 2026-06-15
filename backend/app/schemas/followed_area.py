from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class FollowedAreaBase(BaseModel):
    area_name: str
    city_code: Optional[str] = None
    label: Optional[str] = None


class FollowedAreaCreate(FollowedAreaBase):
    pass


class FollowedAreaResponse(FollowedAreaBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True
