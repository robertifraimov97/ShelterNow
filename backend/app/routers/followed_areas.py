from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import FollowedArea, User
from app.schemas.followed_area import FollowedAreaCreate, FollowedAreaResponse
from app.services.auth import get_current_user

router = APIRouter(prefix="/followed-areas", tags=["Followed Areas"])


@router.get("/", response_model=list[FollowedAreaResponse])
def get_followed_areas(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(FollowedArea)
        .filter(FollowedArea.user_id == current_user.id)
        .all()
    )


@router.post("/", response_model=FollowedAreaResponse)
def create_followed_area(
    followed_area: FollowedAreaCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_followed_area = FollowedArea(
        user_id=current_user.id,
        area_name=followed_area.area_name,
    )
    db.add(new_followed_area)
    db.commit()
    db.refresh(new_followed_area)
    return new_followed_area


@router.delete("/{followed_area_id}")
def delete_followed_area(
    followed_area_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    followed_area = db.query(FollowedArea).filter(
        FollowedArea.id == followed_area_id
    ).first()

    if not followed_area:
        raise HTTPException(status_code=404, detail="Followed area not found")

    if followed_area.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your followed area")

    db.delete(followed_area)
    db.commit()
    return {"message": "Followed area deleted successfully"}
