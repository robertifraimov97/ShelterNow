from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import Shelter
from app.schemas.shelter import ShelterCreate, ShelterResponse

router = APIRouter(prefix="/shelters", tags=["Shelters"])


@router.get("/", response_model=list[ShelterResponse])
def get_shelters(db: Session = Depends(get_db)):
    shelters = db.query(Shelter).all()
    return shelters


@router.post("/", response_model=ShelterResponse)
def create_shelter(shelter: ShelterCreate, db: Session = Depends(get_db)):
    new_shelter = Shelter(
        name=shelter.name,
        city=shelter.city,
        address=shelter.address,
        latitude=shelter.latitude,
        longitude=shelter.longitude,
        shelter_type=shelter.shelter_type,
        source_type=shelter.source_type,
        source_name=shelter.source_name,
        source_url=shelter.source_url,
        accessibility_notes=shelter.accessibility_notes,
        status=shelter.status,
        last_verified_at=shelter.last_verified_at,
    )

    db.add(new_shelter)
    db.commit()
    db.refresh(new_shelter)

    return new_shelter
