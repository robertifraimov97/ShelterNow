import csv
import json
from pathlib import Path

INPUT_FILE = Path("backend/data/jerusalem_records.csv")
OUTPUT_FILE = Path("backend/data/jerusalem_official_shelters.json")


def clean_text(value):
    if value is None:
        return None
    value = str(value).replace("\u200b", "").strip()
    return value if value else None


def main():
    shelters = []

    with INPUT_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        for row in reader:
            name_raw = clean_text(row.get("מספר מקלט"))
            address_raw = clean_text(row.get("כתובת"))
            map_address = clean_text(row.get("כתובות למפה"))
            accessibility_raw = clean_text(row.get("נגישות"))

            latitude_raw = clean_text(row.get("קואורדינטות ציר x"))
            longitude_raw = clean_text(row.get("קורדינטות ציר y"))

            if not name_raw or not address_raw:
                continue

            try:
                latitude = float(latitude_raw) if latitude_raw else None
                longitude = float(longitude_raw) if longitude_raw else None
            except ValueError:
                latitude = None
                longitude = None

            shelter = {
                "name": name_raw,
                "city": "ירושלים",
                "address": address_raw,
                "geocoding_address": map_address or f"{address_raw}, ירושלים",
                "latitude": latitude,
                "longitude": longitude,
                "shelter_type": "public_shelter",
                "source_type": "official_municipality",
                "source_name": "עיריית ירושלים",
                "source_url": "https://www.jerusalem.muni.il/he/residents/security/spaces/list/",
                "accessibility_notes": accessibility_raw,
                "status": "unknown",
                "last_verified_at": None,
            }

            shelters.append(shelter)

    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(shelters, file, ensure_ascii=False, indent=2)

    print(f"Created {OUTPUT_FILE}")
    print(f"Total shelters: {len(shelters)}")


if __name__ == "__main__":
    main()
