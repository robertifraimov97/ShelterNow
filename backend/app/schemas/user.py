from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str


class UserResponse(BaseModel):
    id: int
    email: str
    trust_score: int
    mobility_status: str
    prefer_accessible_route: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserPreferencesResponse(BaseModel):
    mobility_status: str
    prefer_accessible_route: bool

    class Config:
        from_attributes = True


class UserPreferencesUpdate(BaseModel):
    mobility_status: str
    prefer_accessible_route: bool
