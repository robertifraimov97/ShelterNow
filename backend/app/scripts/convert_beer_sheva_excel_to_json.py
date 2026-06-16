
import json
from pathlib import Path

import openpyxl


INPUT_FILE = Path("backend/data/מקלטים וצופרים.xlsx")
OUTPUT_FILE = Path("backend/data/beer_sheva_official_shelters.json")


def clean_text(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return None

    return text


def build_address(street, house_number):
    street = clean_text(street)
    house_number = clean_text(house_number)

    if street and house_number:
        return f"{street} {house_number}"

    if street:
        return street

    return None


def main():
    workbook = openpyxl.load_workbook(INPUT_FILE, data_only=True)
    sheet = workbook["מקלטים"]

    rows = list(sheet.iter_rows(values_only=True))

    if not rows:
        print("No rows found in spreadsheet")
        return

    headers = [clean_text(cell) for cell in rows[0]]
    data_rows = rows[1:]

    shelters = []

    for row in data_rows:
        row_dict = dict(zip(headers, row))

        shelter_name = clean_text(row_dict.get("שם מקלט"))
        shelter_type_info = clean_text(row_dict.get("תת קרקעי, עילי, מונגש"))
        house_number = clean_text(row_dict.get("מספר בית"))
        street = clean_text(row_dict.get("רחוב"))
        neighborhood = clean_text(row_dict.get("שכונה"))

        address = build_address(street, house_number)

        if not shelter_name and not address:
            continue

        is_accessible = shelter_type_info == "עילי מונגש"

        notes_parts = []

        if neighborhood:
            notes_parts.append(f"שכונה: {neighborhood}")

        if shelter_type_info:
            notes_parts.append(f"סוג: {shelter_type_info}")

        notes = " | ".join(notes_parts) if notes_parts else None

        accessibility_notes = shelter_type_info if shelter_type_info else None

        if address and neighborhood:
            geocoding_address = f"{address}, {neighborhood}, באר שבע, ישראל"
        elif address:
            geocoding_address = f"{address}, באר שבע, ישראל"
        else:
            geocoding_address = None

        shelter_record = {
            "name": shelter_name or address,
            "city": "באר שבע",
            "address": address,
            "geocoding_address": geocoding_address,
            "latitude": None,
            "longitude": None,
            "shelter_type": "public_shelter",
            "source_type": "official_municipality",
            "source_name": "Be'er Sheva Municipality",
            "source_url": None,
            "accessibility_notes": accessibility_notes,
            "status": "unknown",
            "last_verified_at": None,
            "is_accessible": is_accessible,
            "notes": notes,
        }

        shelters.append(shelter_record)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(shelters, file, ensure_ascii=False, indent=2)

    print(f"Created JSON file: {OUTPUT_FILE}")
    print(f"Total shelters: {len(shelters)}")


if __name__ == "__main__":
    main()
