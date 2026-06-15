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

router = APIRouter(prefix="/community-shelters", tags=["Community Shelters"])


@router.post("/", response_model=CommunityShelterResponse)
def create_community_shelter(
    shelter: CommunityShelterCreate,
    db: Session = Depends(get_db),
):
    coordinates = geocode_address(
        address=shelter.address,
        city=shelter.city,
    )

    latitude = coordinates["latitude"] if coordinates else None
    longitude = coordinates["longitude"] if coordinates else None

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

    db.add(new_shelter)
    db.commit()
    db.refresh(new_shelter)

    return new_shelter
    
@router.get("/", response_model=List[CommunityShelterResponse])
def get_community_shelters(
    db: Session = Depends(get_db),
):
    shelters = db.query(CommunityShelter).all()
    return shelters
    
@router.get("/emergency", response_model=List[CommunityShelterResponse])
def get_emergency_community_shelters(
    db: Session = Depends(get_db),
):
    shelters = (
        db.query(CommunityShelter)
        .filter(
            CommunityShelter.is_active == True,
            CommunityShelter.show_only_during_emergency == True,
        )
        .all()
    )
    return shelters
