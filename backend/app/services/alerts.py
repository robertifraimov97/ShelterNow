import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from dotenv import load_dotenv

load_dotenv()

ALERTS_URL = os.getenv(
    "ALERTS_URL",
    "https://www.oref.org.il/WarningMessages/alert/alerts.json",
)


def get_current_alerts():
    request = Request(
        ALERTS_URL,
        headers={
            "User-Agent": "ShelterNow/0.1",
            "Referer": "https://www.oref.org.il/",
        },
    )

    try:
        with urlopen(request, timeout=5) as response:
            raw = response.read().decode("utf-8-sig").strip()

        if not raw:
            return {
                "source": "oref",
                "raw": {},
                "has_active_alert": False,
            }

        return {
            "source": "oref",
            "raw": json.loads(raw),
            "has_active_alert": True,
        }

    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        print("Failed to fetch alerts:", error)
        return {
            "source": "oref",
            "raw": {},
            "has_active_alert": False,
            "error": "Failed to fetch alerts",
        }