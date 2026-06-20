import json
import os
from typing import Optional, Dict
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


# Base URL for the geocoding service.
# Defaults to the Nominatim OpenStreetMap search endpoint if no environment variable is set.
GEOCODING_BASE_URL = os.getenv(
    "GEOCODING_BASE_URL",
    "https://nominatim.openstreetmap.org/search"
)

# User-Agent header sent with geocoding requests.
# This helps identify the application to the geocoding service.
GEOCODING_USER_AGENT = os.getenv(
    "GEOCODING_USER_AGENT",
    "ShelterNowDev/0.1"
)


# Convert an address and city into geographic coordinates using the geocoding service.
def geocode_address(address: Optional[str], city: Optional[str]) -> Optional[Dict[str, float]]:
    # Build the query from the available address parts and always include "Israel".
    query_parts = [part.strip() for part in [address, city, "Israel"] if part and part.strip()]

    # If there is no usable address information, return None.
    if not query_parts:
        return None

    # Build the request parameters for the geocoding API.
    params = {
        "q": ", ".join(query_parts),
        "format": "jsonv2",
        "limit": 1,
    }

    # Create the full request URL with encoded query parameters.
    url = f"{GEOCODING_BASE_URL}?{urlencode(params)}"

    # Build the HTTP request with the configured User-Agent header.
    request = Request(
        url,
        headers={
            "User-Agent": GEOCODING_USER_AGENT,
        },
    )

    try:
        # Send the request and parse the JSON response.
        with urlopen(request, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))

        # If no result was found, return None.
        if not data:
            return None

        # Return the first matching result as latitude and longitude.
        return {
            "latitude": float(data[0]["lat"]),
            "longitude": float(data[0]["lon"]),
        }

    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as error:
        # Print the error for debugging and return None if geocoding fails.
        print("Geocoding failed:", error)
        return None
