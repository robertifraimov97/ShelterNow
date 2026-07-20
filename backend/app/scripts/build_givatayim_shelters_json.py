import json
from pathlib import Path

import openpyxl


INPUT_FILE = Path("data/givatayim_shelters.xlsx")
OUTPUT_FILE = Path("data/givatayim_official_shelters.json")
SHEET_NAME = "מקלטים גבעתיים"


def clean_text(value):
    if value is None:
        return None

    text = str(value).strip()

    if not text:
        return None

    return text


def main():
    workbook = openpyxl.load_workbook(INPUT_FILE, data_only=True)
    sheet = workbook[SHEET_NAME]

    rows = list(sheet.iter_rows(values_only=True))

    if not rows:
        print("No rows found in spreadsheet")
        return

    headers = [clean_text(cell) for cell in rows[0]]
    data_rows = rows[1:]

    shelters = []

    for row in data_rows:
        row_dict = dict(zip(headers, row))

        address = clean_text(row_dict.get("כתובת"))

        if not address:
            continue

        geocoding_address = f"{address}, גבעתיים, ישראל"

        shelter_record = {
            "name": address,
            "city": "גבעתיים",
            "address": address,
            "geocoding_address": geocoding_address,
            "latitude": None,
            "longitude": None,
            "shelter_type": "public_shelter",
            "source_type": "official_municipality",
            "source_name": "Givatayim Municipality",
            "source_url": None,
            "accessibility_notes": None,
            "status": "unknown",
            "last_verified_at": None,
            "is_accessible": False,
            "notes": None,
        }

        shelters.append(shelter_record)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(shelters, file, ensure_ascii=False, indent=2)

    print(f"Created JSON file: {OUTPUT_FILE}")
    print(f"Total shelters: {len(shelters)}")


if __name__ == "__main__":
    main()
