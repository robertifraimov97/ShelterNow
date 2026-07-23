from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User
from app.schemas.user import (
    UserResponse,
    UserPreferencesResponse,
    UserPreferencesUpdate,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


# Dev/debug only — lists all users. Not exposed in production.
@router.get("/", response_model=list[UserResponse])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.get("/me/preferences", response_model=UserPreferencesResponse)
def get_my_preferences(current_user: User = Depends(get_current_user)):
    return UserPreferencesResponse(
        mobility_status=current_user.mobility_status,
        prefer_accessible_route=current_user.prefer_accessible_route,
    )


@router.put("/me/preferences", response_model=UserPreferencesResponse)
def update_my_preferences(
    request: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed_mobility_values = {"regular", "limited"}

    if request.mobility_status not in allowed_mobility_values:
        raise HTTPException(status_code=400, detail="Invalid mobility_status")

    current_user.mobility_status = request.mobility_status
    current_user.prefer_accessible_route = request.prefer_accessible_route

    db.commit()
    db.refresh(current_user)

    return UserPreferencesResponse(
        mobility_status=current_user.mobility_status,
        prefer_accessible_route=current_user.prefer_accessible_route,
    )
