import json
import os
from typing import Optional, Dict
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


GEOCODING_BASE_URL = os.getenv(
    "GEOCODING_BASE_URL",
    "https://nominatim.openstreetmap.org/search"
)

GEOCODING_USER_AGENT = os.getenv(
    "GEOCODING_USER_AGENT",
    "ShelterNowDev/0.1"
)


def geocode_address(address: Optional[str], city: Optional[str]) -> Optional[Dict[str, float]]:
    query_parts = [part.strip() for part in [address, city, "Israel"] if part and part.strip()]

    if not query_parts:
        return None

    params = {
        "q": ", ".join(query_parts),
        "format": "jsonv2",
        "limit": 1,
    }

    url = f"{GEOCODING_BASE_URL}?{urlencode(params)}"

    request = Request(
        url,
        headers={
            "User-Agent": GEOCODING_USER_AGENT,
        },
    )

    try:
        with urlopen(request, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))

        if not data:
            return None

        return {
            "latitude": float(data[0]["lat"]),
            "longitude": float(data[0]["lon"]),
        }

    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as error:
        print("Geocoding failed:", error)
        return None
