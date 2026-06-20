from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.db.models import CommunityShelter
from app.schemas.community_shelter import (
    CommunityShelterCreate,
    CommunityShelterResponse,
)
from app.services.geocoding import geocode_address

# Create a router for community shelter-related endpoints.
router = APIRouter(prefix="/community-shelters", tags=["Community Shelters"])


@router.post("/", response_model=CommunityShelterResponse)
def create_community_shelter(
    shelter: CommunityShelterCreate,
    db: Session = Depends(get_db),
):
    # Try to geocode the shelter address in order to get map coordinates.
    coordinates = geocode_address(
        address=shelter.address,
        city=shelter.city,
    )

    # Extract latitude and longitude only if geocoding succeeded.
    latitude = coordinates["latitude"] if coordinates else None
    longitude = coordinates["longitude"] if coordinates else None

    # Create a new community shelter record using the provided data
    # and the coordinates resolved from geocoding.
    new_shelter = CommunityShelter(
        name=shelter.name,
        city=shelter.city,
        address=shelter.address,
        latitude=latitude,
        longitude=longitude,
        notes=shelter.notes,
        is_accessible=shelter.is_accessible,
        is_active=True,
        show_only_during_emergency=True,
    )

    # Save the new shelter to the database.
    db.add(new_shelter)
    db.commit()
    db.refresh(new_shelter)

    # Return the newly created shelter.
    return new_shelter


@router.get("/", response_model=List[CommunityShelterResponse])
def get_community_shelters(
    db: Session = Depends(get_db),
):
    # Fetch and return all community shelters from the database.
    shelters = db.query(CommunityShelter).all()
    return shelters


@router.get("/emergency", response_model=List[CommunityShelterResponse])
def get_emergency_community_shelters(
    db: Session = Depends(get_db),
):
    # Fetch only active community shelters that should be shown
    # during emergency mode.
    shelters = (
        db.query(CommunityShelter)
        .filter(
            CommunityShelter.is_active == True,
            CommunityShelter.show_only_during_emergency == True,
        )
        .all()
    )
    return shelters
