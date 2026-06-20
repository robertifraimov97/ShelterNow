import json
import os
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from dotenv import load_dotenv

# Load environment variables from the .env file.
load_dotenv()

# Base URL for the OpenRouteService API.
# If no environment variable is provided, use the default public API URL.
ORS_BASE_URL = os.getenv(
    "ORS_BASE_URL",
    "https://api.openrouteservice.org"
)

# API key used to authenticate requests to OpenRouteService.
ORS_API_KEY = os.getenv("ORS_API_KEY")


# Request a walking route between two geographic points.
def get_walking_route(
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float,
):
    # If the API key is missing, routing cannot be performed.
    if not ORS_API_KEY:
        print("ORS_API_KEY is missing")
        return None

    # Build the walking directions endpoint URL.
    url = f"{ORS_BASE_URL}/v2/directions/foot-walking/geojson"

    # Request body sent to OpenRouteService.
    # Coordinates must be sent as [longitude, latitude].
    body = {
        "coordinates": [
            [start_longitude, start_latitude],
            [end_longitude, end_latitude],
        ],
        "instructions": True,
        "instructions_format": "text",
        "language": "en",
    }

    # Build the HTTP POST request with the API key and JSON payload.
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": ORS_API_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        # Send the request and parse the JSON response.
        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        # Extract the route feature list from the response.
        features = data.get("features", [])
        if not features:
            return None

        # Use the first returned route feature.
        feature = features[0]
        properties = feature.get("properties", {})
        summary = properties.get("summary", {})
        segments = properties.get("segments", [])
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [])

        # Collect all step-by-step instructions from every route segment.
        instructions = []

        for segment in segments:
            for step in segment.get("steps", []):
                instructions.append(
                    {
                        "instruction": step.get("instruction", ""),
                        "distance_meters": step.get("distance", 0.0),
                        "duration_seconds": step.get("duration", 0.0),
                    }
                )

        # Return the route in the app's internal response format.
        return {
            "distance_meters": summary.get("distance", 0.0),
            "duration_seconds": summary.get("duration", 0.0),
            "route_coordinates": [
                {
                    "latitude": point[1],
                    "longitude": point[0],
                }
                for point in coordinates
            ],
            "instructions": instructions,
        }

    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as error:
        # Print the error for debugging and return None if routing fails.
        print("Routing failed:", error)
        return None
