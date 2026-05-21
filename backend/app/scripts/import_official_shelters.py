import json
import time
from pathlib import Path

from app.db.database import SessionLocal
from app.db.models import Shelter
from app.services.geocoding import geocode_address


DATA_FILE = Path("backend/data/tel_aviv_official_shelters_updated.json")


def get_shelter_unique_key(item: dict) -> str:
    return "|".join(
        [
            (item.get("name") or "").strip().lower(),
            (item.get("address") or "").strip().lower(),
            (item.get("city") or "").strip().lower(),
        ]
    )


def shelter_exists(db, item: dict) -> bool:
    existing = db.query(Shelter).filter(
        Shelter.name == item.get("name"),
        Shelter.address == item.get("address"),
        Shelter.city == item.get("city"),
    ).first()

    return existing is not None


def main():
    if not DATA_FILE.exists():
        print(f"Data file not found: {DATA_FILE}")
        return

    with open(DATA_FILE, "r", encoding="utf-8") as file:
        shelters_data = json.load(file)

    db = SessionLocal()

    try:
        seen_keys = set()
        inserted_count = 0
        skipped_count = 0

        for item in shelters_data:
            name = item.get("name")
            address = item.get("address")
            city = item.get("city")

            unique_key = get_shelter_unique_key(item)

            if unique_key in seen_keys:
                skipped_count += 1
                print(f"Skipped duplicate inside file: {name} | {address} | {city}")
                continue

            seen_keys.add(unique_key)

            if shelter_exists(db, item):
                skipped_count += 1
                print(f"Skipped existing shelter in DB: {name} | {address} | {city}")
                continue

            coordinates = geocode_address(
                address=address,
                city=city,
            )

            time.sleep(1.5)

            latitude = coordinates["latitude"] if coordinates else None
            longitude = coordinates["longitude"] if coordinates else None

            if latitude is None or longitude is None:
                skipped_count += 1
                print(f"Skipped because geocoding failed: {name} | {address} | {city}")
                continue

            new_shelter = Shelter(
                name=name,
                city=city,
                address=address,
                latitude=latitude,
                longitude=longitude,
                shelter_type=item.get("shelter_type", "public_shelter"),
                source_type=item.get("source_type", "official_municipality"),
                source_name=item.get("source_name"),
                source_url=item.get("source_url"),
                accessibility_notes=item.get("accessibility_notes"),
                status=item.get("status", "unknown"),
                last_verified_at=item.get("last_verified_at"),
            )

            db.add(new_shelter)
            inserted_count += 1
            print(f"Inserted: {name} | {address} | {city}")

        db.commit()

        print(f"\nInserted shelters: {inserted_count}")
        print(f"Skipped shelters: {skipped_count}")

    except Exception as error:
        db.rollback()
        print("Import failed:", error)
    finally:
        db.close()


if __name__ == "__main__":
    main()
