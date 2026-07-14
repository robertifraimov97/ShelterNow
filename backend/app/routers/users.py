from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["Users"])


# Dev/debug only — lists all users. Not exposed in production.
@router.get("/", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()
