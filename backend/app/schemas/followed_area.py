
from typing import Optional
from pydantic import BaseModel
from datetime import datetime


class FollowedAreaCreate(BaseModel):
    area_name: str


class FollowedAreaResponse(BaseModel):
    id: int
    area_name: str
    created_at: datetime

    class Config:
        from_attributes = True
