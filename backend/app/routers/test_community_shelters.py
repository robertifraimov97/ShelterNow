"""
Focused unit tests for GET /community-shelters/emergency's gating behavior.

This project has no test database or HTTP client fixture set up yet (same
limitation documented in app/services/test_shelter_journey.py and
app/services/test_area_inference.py), so these tests call the endpoint
function directly as plain Python and substitute a minimal fake Session
instead of touching the real hosted Neon database. get_active_emergency_state
itself (the shared gate, including the "uncertain inference" and "expired
context" branches) already has focused, database-free coverage in
app/services/test_area_inference.py — these tests are only about what this
endpoint does with that gate's result: eligible shelters when it returns a
state, an empty list with no shelter details otherwise.

Run with:
    python -m unittest app.routers.test_community_shelters -v
"""

import unittest
from unittest.mock import patch

from app.routers.community_shelters import get_emergency_community_shelters


class FakeCommunityShelterQuery:
    def __init__(self, shelters):
        self._shelters = shelters

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._shelters


class FakeDb:
    def __init__(self, shelters):
        self._shelters = shelters

    def query(self, model):
        return FakeCommunityShelterQuery(self._shelters)


class GetEmergencyCommunitySheltersTests(unittest.TestCase):
    def setUp(self):
        self.eligible_shelters = [object(), object()]
        self.db = FakeDb(self.eligible_shelters)

    @patch("app.routers.community_shelters.get_active_emergency_state")
    def test_active_emergency_returns_eligible_community_shelters(self, mock_gate):
        # A truthy return from the shared gate means a verified active
        # Emergency Context was found for the coordinate-inferred area.
        mock_gate.return_value = object()

        result = get_emergency_community_shelters(
            latitude=32.08, longitude=34.78, db=self.db
        )

        self.assertEqual(result, self.eligible_shelters)
        mock_gate.assert_called_once_with(self.db, 32.08, 34.78)

    @patch("app.routers.community_shelters.get_active_emergency_state")
    def test_no_matching_emergency_context_returns_empty_list(self, mock_gate):
        mock_gate.return_value = None

        result = get_emergency_community_shelters(
            latitude=32.08, longitude=34.78, db=self.db
        )

        self.assertEqual(result, [])

    @patch("app.routers.community_shelters.get_active_emergency_state")
    def test_uncertain_area_inference_returns_empty_list(self, mock_gate):
        # Uncertain inference (too few agreeing shelters, or nearest shelter
        # beyond the confidence radius) is exactly the case where
        # get_active_emergency_state itself returns None — see
        # app/services/test_area_inference.py for that decision logic.
        # This test documents that the endpoint fails closed on it, without
        # re-testing the inference rule itself.
        mock_gate.return_value = None

        result = get_emergency_community_shelters(
            latitude=29.55, longitude=34.95, db=self.db
        )

        self.assertEqual(result, [])

    @patch("app.routers.community_shelters.get_active_emergency_state")
    def test_expired_emergency_context_returns_empty_list(self, mock_gate):
        # An expired context is also surfaced as None by the shared gate
        # (is_emergency_access_active is checked inside
        # get_active_emergency_state before it returns a state) — see
        # app/services/test_area_inference.py's
        # EmergencyAccessStateLivenessTests for that check in isolation.
        mock_gate.return_value = None

        result = get_emergency_community_shelters(
            latitude=32.08, longitude=34.78, db=self.db
        )

        self.assertEqual(result, [])


if __name__ == "__main__":
    unittest.main()
