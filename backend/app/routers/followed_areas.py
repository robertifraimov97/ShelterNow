from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import FollowedArea
from app.schemas.followed_area import FollowedAreaCreate, FollowedAreaResponse

# Create a router for followed area-related endpoints.
router = APIRouter(prefix="/followed-areas", tags=["Followed Areas"])


@router.get("/", response_model=list[FollowedAreaResponse])
def get_followed_areas(db: Session = Depends(get_db)):
    # Fetch and return all followed areas stored in the database.
    followed_areas = db.query(FollowedArea).all()
    return followed_areas


@router.post("/", response_model=FollowedAreaResponse)
def create_followed_area(
    followed_area: FollowedAreaCreate,
    db: Session = Depends(get_db),
):
    # Create a new followed area record for the default user.
    new_followed_area = FollowedArea(
        user_identifier="default_user",
        area_name=followed_area.area_name,
    )

    # Save the new followed area to the database.
    db.add(new_followed_area)
    db.commit()
    db.refresh(new_followed_area)

    # Return the newly created followed area.
    return new_followed_area


@router.delete("/{followed_area_id}")
def delete_followed_area(
    followed_area_id: int,
    db: Session = Depends(get_db)
):
    # Look for the followed area by its database ID.
    followed_area = db.query(FollowedArea).filter(
        FollowedArea.id == followed_area_id
    ).first()

    # Return a 404 error if the followed area does not exist.
    if not followed_area:
        raise HTTPException(status_code=404, detail="Followed area not found")

    # Delete the followed area and save the change.
    db.delete(followed_area)
    db.commit()

    # Return a success message after deletion.
    return {"message": "Followed area deleted successfully"}
