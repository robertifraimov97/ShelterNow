from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import SubmittedShelter
from app.schemas.submitted_shelter import (
    SubmittedShelterCreate,
    SubmittedShelterResponse,
)
from app.services.geocoding import geocode_address

router = APIRouter(prefix="/submitted-shelters", tags=["Submitted Shelters"])


@router.get("/", response_model=list[SubmittedShelterResponse])
def get_submitted_shelters(db: Session = Depends(get_db)):
    submitted_shelters = db.query(SubmittedShelter).all()
    return submitted_shelters


@router.post("/", response_model=SubmittedShelterResponse)
def create_submitted_shelter(
    submitted_shelter: SubmittedShelterCreate,
    db: Session = Depends(get_db)
):
    coordinates = geocode_address(
        address=submitted_shelter.address,
        city=submitted_shelter.city,
    )

    latitude = coordinates["latitude"] if coordinates else None
    longitude = coordinates["longitude"] if coordinates else None

    new_submitted_shelter = SubmittedShelter(
        name=submitted_shelter.name,
        city=submitted_shelter.city,
        address=submitted_shelter.address,
        latitude=latitude,
        longitude=longitude,
        notes=submitted_shelter.notes,
        accessibility_notes=submitted_shelter.accessibility_notes,
        submitted_by_name=submitted_shelter.submitted_by_name,
        submitted_by_email=submitted_shelter.submitted_by_email,
        submission_status=submitted_shelter.submission_status,
        review_notes=submitted_shelter.review_notes,
    )

    db.add(new_submitted_shelter)
    db.commit()
    db.refresh(new_submitted_shelter)

    return new_submitted_shelter
