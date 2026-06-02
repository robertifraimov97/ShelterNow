import json
from pathlib import Path

RAW_FILE = Path("data/ramat_hasharon_raw.txt")
OUTPUT_FILE = Path("data/ramat_hasharon_official_shelters.json")

SOURCE_URL = "https://ramat-hasharon.muni.il/רשימת-מקלטים-ציבוריים-פתוחים/"

def build_geocoding_address(address: str) -> str:
    cleaned = address.strip()

    # Remove text inside parentheses
    while "(" in cleaned and ")" in cleaned:
        start = cleaned.find("(")
        end = cleaned.find(")", start)

        if end == -1:
            break

        cleaned = (cleaned[:start] + cleaned[end + 1:]).strip()

    # Prefer comma-separated part that contains a number
    parts = [part.strip() for part in cleaned.split(",")]

    for part in parts:
        if any(char.isdigit() for char in part):
            cleaned = part
            break

    # If address contains "פינת", keep the part before it
    if "פינת" in cleaned:
        cleaned = cleaned.split("פינת")[0].strip()

    # Remove common local neighborhood/noise words
    noise_words = [
        "רמת השרון",
        "מורשה",
        "הדר",
        "גולן",
        "נוה מגן",
        "נווה מגן",
        "נוה רסקו",
        "נווה רסקו",
        "קרית יערים",
        "ק.יערים",
        "נוה רום",
        "נווה רום",
        "אלון",
    ]

    for word in noise_words:
        cleaned = cleaned.replace(word, "")

    return " ".join(cleaned.split()).strip(" ,-–")

def parse_line(line: str):
    parts = line.strip().split("\t")

    if len(parts) < 2:
        return None

    shelter_number = parts[0].strip()
    address = parts[1].strip()
    notes = parts[2].strip() if len(parts) >= 3 and parts[2].strip() else None

    return {
        "name": f"מקלט ציבורי {shelter_number}",
        "city": "רמת השרון",
        "address": address,
        "geocoding_address": build_geocoding_address(address),
        "shelter_type": "public_shelter",
        "source_type": "official_municipality",
        "source_name": "עיריית רמת השרון",
        "source_url": SOURCE_URL,
        "accessibility_notes": notes,
        "status": "unknown",
        "last_verified_at": None,
    }


def main():
    shelters = []

    with open(RAW_FILE, "r", encoding="utf-8") as file:
        for line in file:
            if not line.strip():
                continue

            shelter = parse_line(line)

            if shelter:
                shelters.append(shelter)
            else:
                print(f"Skipped line: {line.strip()}")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as file:
        json.dump(shelters, file, ensure_ascii=False, indent=2)

    print(f"Created {OUTPUT_FILE}")
    print(f"Shelters converted: {len(shelters)}")


if __name__ == "__main__":
    main()