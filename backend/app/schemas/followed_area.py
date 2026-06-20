from typing import Optional
from pydantic import BaseModel
from datetime import datetime


# Request schema used when creating a new followed area.
class FollowedAreaCreate(BaseModel):
    # The name of the area the user wants to follow.
    area_name: str


# Response schema returned for followed area endpoints.
class FollowedAreaResponse(BaseModel):
    # Unique followed area identifier.
    id: int

    # The followed area's name.
    area_name: str

    # Timestamp for when the followed area was created.
    created_at: datetime

    class Config:
        # Allow creating this response model directly from ORM objects.
        from_attributes = True
