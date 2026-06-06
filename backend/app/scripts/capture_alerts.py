import json
import time
from datetime import datetime, timezone
from pathlib import Path

from app.services.alerts import ALERTS_URL
from urllib.request import Request, urlopen


OUTPUT_DIR = Path("data/captured_alerts")
POLL_INTERVAL_SECONDS = 3


def fetch_raw_alerts() -> str:
    request = Request(
        ALERTS_URL,
        headers={
            "User-Agent": "ShelterNow/0.1",
            "Referer": "https://www.oref.org.il/",
        },
    )

    with urlopen(request, timeout=5) as response:
        return response.read().decode("utf-8-sig").strip()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Listening for alerts...")
    print(f"Polling every {POLL_INTERVAL_SECONDS} seconds")
    print("Press Ctrl+C to stop")

    while True:
        checked_at = datetime.now(timezone.utc).isoformat()

        try:
            raw = fetch_raw_alerts()

            if raw:
                filename = OUTPUT_DIR / f"alert_{checked_at.replace(':', '-')}.json"

                payload = {
                    "detected_at": checked_at,
                    "raw": json.loads(raw),
                }

                with open(filename, "w", encoding="utf-8") as file:
                    json.dump(payload, file, ensure_ascii=False, indent=2)

                print(f"Captured alert: {filename}")
            else:
                print(f"{checked_at} - no alerts")

        except Exception as error:
            print(f"{checked_at} - error: {error}")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()