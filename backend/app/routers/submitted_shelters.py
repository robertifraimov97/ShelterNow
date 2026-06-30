from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import SubmittedShelter, CommunityShelter
from app.schemas.submitted_shelter import (
    SubmittedShelterCreate,
    SubmittedShelterUpdate,
    SubmittedShelterReviewAction,
    SubmittedShelterResponse,
)
from app.services.geocoding import geocode_address

router = APIRouter(prefix="/submitted-shelters", tags=["Submitted Shelters"])


def find_matching_community_shelter(
    db: Session,
    submitted_shelter: SubmittedShelter,
):
    """
    Try to find the matching community shelter created from this submitted shelter.

    Current matching strategy:
    We match by name + city + address.

    This is simple and works well for the current prototype.
    In a more advanced system, it would be better to keep a direct foreign-key link.
    """
    return (
        db.query(CommunityShelter)
        .filter(
            CommunityShelter.name == submitted_shelter.name,
            CommunityShelter.city == submitted_shelter.city,
            CommunityShelter.address == submitted_shelter.address,
        )
        .first()
    )


@router.get("/", response_model=list[SubmittedShelterResponse])
def get_submitted_shelters(db: Session = Depends(get_db)):
    # Return all submitted shelters from the database.
    submitted_shelters = db.query(SubmittedShelter).all()
    return submitted_shelters


@router.post("/", response_model=SubmittedShelterResponse)
def create_submitted_shelter(
    submitted_shelter: SubmittedShelterCreate,
    db: Session = Depends(get_db)
):
    # Try to geocode the submitted address into coordinates.
    coordinates = geocode_address(
        address=submitted_shelter.address,
        city=submitted_shelter.city,
    )

    # Use geocoded coordinates if available.
    latitude = coordinates["latitude"] if coordinates else None
    longitude = coordinates["longitude"] if coordinates else None

    # Create a new submitted shelter record.
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

    # Save the new shelter in the database.
    db.add(new_submitted_shelter)
    db.commit()
    db.refresh(new_submitted_shelter)

    return new_submitted_shelter


@router.put("/{submitted_shelter_id}", response_model=SubmittedShelterResponse)
def update_submitted_shelter(
    submitted_shelter_id: int,
    submitted_shelter_update: SubmittedShelterUpdate,
    db: Session = Depends(get_db)
):
    # Find the submitted shelter by its ID.
    submitted_shelter = db.query(SubmittedShelter).filter(
        SubmittedShelter.id == submitted_shelter_id
    ).first()

    # Return 404 if the shelter does not exist.
    if not submitted_shelter:
        raise HTTPException(status_code=404, detail="Submitted shelter not found")

    # If the shelter was already approved, remove its active community version.
    # After editing, the shelter must go through review again.
    if submitted_shelter.submission_status == "approved":
        matching_community_shelter = find_matching_community_shelter(
            db=db,
            submitted_shelter=submitted_shelter,
        )

        if matching_community_shelter:
            db.delete(matching_community_shelter)
            db.flush()

    # Re-geocode the updated address to refresh coordinates.
    coordinates = geocode_address(
        address=submitted_shelter_update.address,
        city=submitted_shelter_update.city,
    )

    latitude = coordinates["latitude"] if coordinates else None
    longitude = coordinates["longitude"] if coordinates else None

    # Update editable fields.
    submitted_shelter.name = submitted_shelter_update.name
    submitted_shelter.city = submitted_shelter_update.city
    submitted_shelter.address = submitted_shelter_update.address
    submitted_shelter.notes = submitted_shelter_update.notes
    submitted_shelter.accessibility_notes = submitted_shelter_update.accessibility_notes
    submitted_shelter.latitude = latitude
    submitted_shelter.longitude = longitude

    # Any edit should return the shelter to pending review.
    submitted_shelter.submission_status = "pending"
    submitted_shelter.review_notes = None

    # Save changes to the database.
    db.commit()
    db.refresh(submitted_shelter)

    return submitted_shelter


@router.post("/{submitted_shelter_id}/approve", response_model=SubmittedShelterResponse)
def approve_submitted_shelter(
    submitted_shelter_id: int,
    review_action: SubmittedShelterReviewAction,
    db: Session = Depends(get_db)
):
    # Find the submitted shelter by its ID.
    submitted_shelter = db.query(SubmittedShelter).filter(
        SubmittedShelter.id == submitted_shelter_id
    ).first()

    # Return 404 if the shelter does not exist.
    if not submitted_shelter:
        raise HTTPException(status_code=404, detail="Submitted shelter not found")

    # Prevent approving shelters that were already reviewed.
    if submitted_shelter.submission_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Only pending shelters can be approved"
        )

    # Mark the submitted shelter as approved.
    submitted_shelter.submission_status = "approved"
    submitted_shelter.review_notes = review_action.review_notes

    # Create a new active community shelter from the approved submission.
    community_shelter = CommunityShelter(
        name=submitted_shelter.name,
        city=submitted_shelter.city,
        address=submitted_shelter.address,
        latitude=submitted_shelter.latitude,
        longitude=submitted_shelter.longitude,
        notes=submitted_shelter.notes,
        is_accessible=bool(
            submitted_shelter.accessibility_notes
            and "accessible" in submitted_shelter.accessibility_notes.lower()
        ),
        is_active=True,
        show_only_during_emergency=True,
    )

    # Save both changes in one transaction.
    db.add(community_shelter)
    db.commit()
    db.refresh(submitted_shelter)

    return submitted_shelter


@router.post("/{submitted_shelter_id}/reject", response_model=SubmittedShelterResponse)
def reject_submitted_shelter(
    submitted_shelter_id: int,
    review_action: SubmittedShelterReviewAction,
    db: Session = Depends(get_db)
):
    # Find the submitted shelter by its ID.
    submitted_shelter = db.query(SubmittedShelter).filter(
        SubmittedShelter.id == submitted_shelter_id
    ).first()

    # Return 404 if the shelter does not exist.
    if not submitted_shelter:
        raise HTTPException(status_code=404, detail="Submitted shelter not found")

    # Prevent rejecting shelters that were already reviewed.
    if submitted_shelter.submission_status != "pending":
        raise HTTPException(
            status_code=400,
            detail="Only pending shelters can be rejected"
        )

    # Mark the shelter as rejected and save reviewer notes.
    submitted_shelter.submission_status = "rejected"
    submitted_shelter.review_notes = review_action.review_notes

    db.commit()
    db.refresh(submitted_shelter)

    return submitted_shelter


@router.delete("/{submitted_shelter_id}")
def delete_submitted_shelter(
    submitted_shelter_id: int,
    db: Session = Depends(get_db)
):
    # Find the submitted shelter by its database ID.
    submitted_shelter = db.query(SubmittedShelter).filter(
        SubmittedShelter.id == submitted_shelter_id
    ).first()

    # Return 404 if the shelter does not exist.
    if not submitted_shelter:
        raise HTTPException(status_code=404, detail="Submitted shelter not found")

    # If this shelter is already approved, remove the active community shelter too.
    if submitted_shelter.submission_status == "approved":
        matching_community_shelter = find_matching_community_shelter(
            db=db,
            submitted_shelter=submitted_shelter,
        )

        if matching_community_shelter:
            db.delete(matching_community_shelter)
            db.flush()

    # Delete the submitted shelter itself.
    db.delete(submitted_shelter)
    db.commit()

    return {"message": "Submitted shelter deleted successfully"}
