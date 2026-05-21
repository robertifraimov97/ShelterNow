import json
import os
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


ORS_BASE_URL = os.getenv(
    "ORS_BASE_URL",
    "https://api.openrouteservice.org"
)

ORS_API_KEY = os.getenv("ORS_API_KEY")


def get_walking_route(
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float,
):
    if not ORS_API_KEY:
        print("ORS_API_KEY is missing")
        return None

    url = f"{ORS_BASE_URL}/v2/directions/foot-walking/geojson"

    body = {
        "coordinates": [
            [start_longitude, start_latitude],
            [end_longitude, end_latitude],
        ],
        "instructions": True,
        "instructions_format": "text",
        "language": "en",
    }

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
        with urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        features = data.get("features", [])
        if not features:
            return None

        feature = features[0]
        properties = feature.get("properties", {})
        summary = properties.get("summary", {})
        segments = properties.get("segments", [])
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [])

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
        print("Routing failed:", error)
        return None
