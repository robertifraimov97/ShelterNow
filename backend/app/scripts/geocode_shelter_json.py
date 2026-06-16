
import json
import sys
import time
from pathlib import Path

from app.services.geocoding import geocode_address


if len(sys.argv) < 2:
    print("Usage:")
    print("PYTHONPATH=backend python backend/app/scripts/geocode_shelter_json.py <json_file>")
    sys.exit(1)

DATA_FILE = Path(sys.argv[1])


def main():
    if not DATA_FILE.exists():
        print(f"Data file not found: {DATA_FILE}")
        return

    with open(DATA_FILE, "r", encoding="utf-8") as file:
        shelters_data = json.load(file)

    success_count = 0
    failed_count = 0
    skipped_existing_count = 0
    failed_items = []

    for index, item in enumerate(shelters_data, start=1):
        name = item.get("name")
        address = item.get("address")
        city = item.get("city")
        geocoding_address = item.get("geocoding_address")

        latitude = item.get("latitude")
        longitude = item.get("longitude")

        if latitude is not None and longitude is not None:
            skipped_existing_count += 1
            print(f"[{index}] Already has coordinates: {name} | {address} | {city}")
            continue

        coordinates = None

        if geocoding_address:
            coordinates = geocode_address(
                address=geocoding_address,
                city=None,
            )

        if not coordinates and address:
            coordinates = geocode_address(
                address=address,
                city=city,
            )

        time.sleep(1.2)

        if coordinates:
            item["latitude"] = coordinates["latitude"]
            item["longitude"] = coordinates["longitude"]
            success_count += 1
            print(
                f"[{index}] Geocoded successfully: {name} | {address} | {city} "
                f"-> {coordinates['latitude']}, {coordinates['longitude']}"
            )
        else:
            failed_count += 1
            failed_items.append(
                {
                    "name": name,
                    "address": address,
                    "city": city,
                    "geocoding_address": geocoding_address,
                }
            )
            print(f"[{index}] Failed geocoding: {name} | {address} | {city}")

    with open(DATA_FILE, "w", encoding="utf-8") as file:
        json.dump(shelters_data, file, ensure_ascii=False, indent=2)

    failed_file = DATA_FILE.with_name(DATA_FILE.stem + "_failed_geocoding.json")
    with open(failed_file, "w", encoding="utf-8") as file:
        json.dump(failed_items, file, ensure_ascii=False, indent=2)

    print("\nDone.")
    print(f"Updated file: {DATA_FILE}")
    print(f"Failed items file: {failed_file}")
    print(f"Successfully geocoded: {success_count}")
    print(f"Failed geocoding: {failed_count}")
    print(f"Already had coordinates: {skipped_existing_count}")


if __name__ == "__main__":
    main()
