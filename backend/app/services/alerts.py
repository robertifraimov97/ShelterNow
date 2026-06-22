import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv


# Load environment variables from the .env file.
load_dotenv()

# Read the alerts endpoint URL from the environment,
# or use the default Home Front Command alerts endpoint.
ALERTS_URL = os.getenv(
    "ALERTS_URL",
    "https://www.oref.org.il/WarningMessages/alert/alerts.json",
)


def get_current_alerts():
    # Build the HTTP request with headers expected by the source website.
    request = Request(
        ALERTS_URL,
        headers={
            "User-Agent": "ShelterNow/0.1",
            "Referer": "https://www.oref.org.il/",
        },
    )

    try:
        # Send the request and read the raw alerts response.
        with urlopen(request, timeout=5) as response:
            raw = response.read().decode("utf-8-sig").strip()

        # If the response is empty, return a no-active-alert result.
        if not raw:
            return {
                "source": "oref",
                "raw": {},
                "has_active_alert": False,
            }

        # If data exists, parse the JSON and return it as an active alert result.
        return {
            "source": "oref",
            "raw": json.loads(raw),
            "has_active_alert": True,
        }

    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        # If fetching or parsing fails, log the error
        # and return a safe fallback response.
        print("Failed to fetch alerts:", error)
        return {
            "source": "oref",
            "raw": {},
            "has_active_alert": False,
            "error": "Failed to fetch alerts",
        }
