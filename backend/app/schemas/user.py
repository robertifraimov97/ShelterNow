from datetime import datetime

from pydantic import BaseModel


class UserCreate(BaseModel):
    email: str


class UserResponse(BaseModel):
    id: int
    email: str
    trust_score: int
    created_at: datetime

    class Config:
        from_attributes = True
