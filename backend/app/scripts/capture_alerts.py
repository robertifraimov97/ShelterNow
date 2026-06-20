import json
import time
from datetime import datetime, timezone
from pathlib import Path

from app.services.alerts import ALERTS_URL
from urllib.request import Request, urlopen


# Directory where captured alert JSON files will be saved.
OUTPUT_DIR = Path("data/captured_alerts")

# Number of seconds to wait between each alert poll.
POLL_INTERVAL_SECONDS = 3


# Fetch the raw alerts response from the Home Front Command alerts endpoint.
def fetch_raw_alerts() -> str:
    request = Request(
        ALERTS_URL,
        headers={
            # Identify the app making the request.
            "User-Agent": "ShelterNow/0.1",
            # Provide the expected referer header for the alert source.
            "Referer": "https://www.oref.org.il/",
        },
    )

    # Send the request and return the decoded raw response text.
    with urlopen(request, timeout=5) as response:
        return response.read().decode("utf-8-sig").strip()


def main():
    # Create the output directory if it does not already exist.
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Print startup information for the alert listener.
    print("Listening for alerts...")
    print(f"Polling every {POLL_INTERVAL_SECONDS} seconds")
    print("Press Ctrl+C to stop")

    # Continuously poll for new alerts.
    while True:
        # Record the current UTC timestamp for this polling cycle.
        checked_at = datetime.now(timezone.utc).isoformat()

        try:
            # Fetch the raw alert response.
            raw = fetch_raw_alerts()

            # If an alert payload exists, save it to a timestamped JSON file.
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
                # Log that no alert was returned during this polling cycle.
                print(f"{checked_at} - no alerts")

        except Exception as error:
            # Log any error that occurs during polling or saving.
            print(f"{checked_at} - error: {error}")

        # Wait before polling again.
        time.sleep(POLL_INTERVAL_SECONDS)


# Run the listener only when this file is executed directly.
if __name__ == "__main__":
    main()
