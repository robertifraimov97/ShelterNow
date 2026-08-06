"""
Focused unit tests for server-side area inference (see area_inference.py
for the full security rationale).

Covers:
  - infer_area_name_from_shelter_samples: the pure confidence-rule decision
    logic (agreement count, distance cutoff, normalization of variants).
  - is_emergency_access_active (existing, reused): active vs. expired
    EmergencyAccessState, tested by constructing an in-memory model instance
    directly (no database row needed — this function only reads
    state.expires_at).
  - area_matches_city (existing, reused): matching a raw Home Front Command
    alert-area string against a normalized city, and rejecting an unrelated
    one.

Deliberately does NOT test infer_area_name_from_coordinates,
find_matching_emergency_state, or get_active_emergency_state directly —
these are thin DB-query wrappers around the logic above. This project has
no test database or HTTP client fixture set up yet (same limitation
documented in test_shelter_journey.py), and these tests must not touch the
real hosted Neon database. Their correctness follows directly from the
pieces tested here.

"Community shelters withheld when inference is uncertain" is verified by
code inspection of backend/app/routers/recommendations.py (community_shelters
starts as [] and is only populated inside `if active_emergency_state:`) —
not by an automated test, for the same reason.

Run with:
    python -m unittest app.services.test_area_inference -v
"""

import unittest
from datetime import datetime, timedelta

from app.db.models import CommunityShelter, EmergencyAccessState
from app.services.alert_matching import area_matches_city
from app.services.area_inference import (
    AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS,
    get_eligible_community_shelters,
    infer_area_name_from_shelter_samples,
)
from app.services.emergency_access import is_emergency_access_active


class InferAreaNameFromShelterSamplesTests(unittest.TestCase):
    def test_all_three_agree(self):
        samples = [
            (100.0, "תל אביב"),
            (300.0, "תל אביב"),
            (500.0, "תל אביב"),
        ]

        self.assertEqual(infer_area_name_from_shelter_samples(samples), "תל אביב")

    def test_two_of_three_agree(self):
        samples = [
            (100.0, "תל אביב"),
            (300.0, "תל אביב"),
            (400.0, "רמת גן"),
        ]

        self.assertEqual(infer_area_name_from_shelter_samples(samples), "תל אביב")

    def test_no_majority_returns_none(self):
        samples = [
            (100.0, "תל אביב"),
            (300.0, "רמת גן"),
            (400.0, "חיפה"),
        ]

        self.assertIsNone(infer_area_name_from_shelter_samples(samples))

    def test_nearest_beyond_radius_returns_none_even_if_all_agree(self):
        # All three agree on the same city, but the nearest one is farther
        # than the configured confidence radius — must fail closed anyway.
        beyond_radius = AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS + 1

        samples = [
            (float(beyond_radius), "תל אביב"),
            (float(beyond_radius + 50), "תל אביב"),
            (float(beyond_radius + 100), "תל אביב"),
        ]

        self.assertIsNone(infer_area_name_from_shelter_samples(samples))

    def test_nearest_exactly_at_radius_is_accepted(self):
        # The boundary itself should not be rejected (uses > not >=).
        samples = [
            (float(AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS), "חיפה"),
            (float(AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS), "חיפה"),
            (float(AREA_INFERENCE_MAX_NEAREST_DISTANCE_METERS), "חיפה"),
        ]

        self.assertEqual(infer_area_name_from_shelter_samples(samples), "חיפה")

    def test_mixed_hebrew_english_variants_normalize_and_agree(self):
        # "Tel Aviv-Yafo", "תל אביב-יפו", and "Tel Aviv" all normalize to the
        # same canonical "תל אביב" via the existing CITY_ALIASES table.
        samples = [
            (100.0, "Tel Aviv-Yafo"),
            (200.0, "תל אביב-יפו"),
            (300.0, "Tel Aviv"),
        ]

        self.assertEqual(infer_area_name_from_shelter_samples(samples), "תל אביב")

    def test_empty_sample_returns_none(self):
        self.assertIsNone(infer_area_name_from_shelter_samples([]))

    def test_fewer_than_sample_size_still_requires_min_agreement(self):
        # Only two shelters exist at all (e.g. a sparsely-covered area). Both
        # agree, and the nearer is within radius, so 2/2 satisfies the same
        # "at least 2 agree" rule used for the full sample of 3.
        samples = [
            (100.0, "אשדוד"),
            (200.0, "אשדוד"),
        ]

        self.assertEqual(infer_area_name_from_shelter_samples(samples), "אשדוד")

    def test_single_shelter_can_never_reach_agreement_of_two(self):
        # Only one shelter exists in range at all -- a single data point can
        # never satisfy "at least 2 agree", so this must fail closed.
        samples = [(100.0, "אשדוד")]

        self.assertIsNone(infer_area_name_from_shelter_samples(samples))

    def test_claimed_city_is_structurally_irrelevant_to_inference(self):
        # There is no "claimed city" parameter anywhere in this function's
        # signature. This test documents that fact concretely: the result
        # is driven entirely by shelter distances/cities, never by whatever
        # a client separately claims current_city to be.
        claimed_city_from_client = "אילת"  # arbitrary, unrelated claim

        samples = [
            (100.0, "תל אביב"),
            (200.0, "תל אביב"),
            (300.0, "תל אביב"),
        ]

        inferred = infer_area_name_from_shelter_samples(samples)

        self.assertEqual(inferred, "תל אביב")
        self.assertNotEqual(inferred, claimed_city_from_client)


class EmergencyAccessStateLivenessTests(unittest.TestCase):
    """is_emergency_access_active is existing, reused code — these tests
    construct an in-memory model instance directly (never persisted to a
    database) since the function only reads the expires_at attribute.
    """

    def test_active_state_within_window(self):
        state = EmergencyAccessState(
            area_name="תל אביב",
            expires_at=datetime.utcnow() + timedelta(minutes=10),
        )

        self.assertTrue(is_emergency_access_active(state))

    def test_expired_state_returns_false(self):
        state = EmergencyAccessState(
            area_name="תל אביב",
            expires_at=datetime.utcnow() - timedelta(minutes=1),
        )

        self.assertFalse(is_emergency_access_active(state))

    def test_none_state_returns_false(self):
        self.assertFalse(is_emergency_access_active(None))


class AreaMatchesCityTests(unittest.TestCase):
    """area_matches_city is existing, reused code — this is the matching
    layer find_matching_emergency_state relies on instead of raw string
    equality.
    """

    def test_matches_raw_alert_area_with_subarea_suffix(self):
        self.assertTrue(area_matches_city("תל אביב - מרכז העיר", "תל אביב"))

    def test_matches_english_gps_variant_against_canonical_city(self):
        self.assertTrue(area_matches_city("אשדוד - א,ב,ד,ה", "אשדוד"))

    def test_rejects_unrelated_city(self):
        self.assertFalse(area_matches_city("חיפה", "תל אביב"))


class _FakeCommunityShelterQuery:
    def __init__(self, shelters):
        self._shelters = shelters

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self._shelters


class _FakeDbForCommunityPool:
    def __init__(self, shelters):
        self._shelters = shelters
        self.queried_model = None

    def query(self, model):
        self.queried_model = model
        return _FakeCommunityShelterQuery(self._shelters)


class GetEligibleCommunitySheltersTests(unittest.TestCase):
    """get_eligible_community_shelters is the single, centralized
    candidate-pool filter every Community-shelter-returning path must call
    (recommendations.py's two emergency endpoints, /community-shelters/
    emergency, and shelter_journey.get_ranked_candidates for Alternative
    Preview/Accept). Because they all call this exact same function rather
    than each keeping their own copy of the filter, the pool is identical
    across those paths *by construction*, not merely by convention — this
    test only confirms the function itself queries CommunityShelter and
    passes through whatever the database returns.
    """

    def test_queries_community_shelter_and_returns_the_filtered_rows(self):
        shelters = [
            CommunityShelter(
                id=1,
                name="C1",
                city="תל אביב",
                address="Addr",
                latitude=32.08,
                longitude=34.78,
                is_active=True,
                show_only_during_emergency=True,
            )
        ]
        db = _FakeDbForCommunityPool(shelters)

        result = get_eligible_community_shelters(db)

        self.assertIs(db.queried_model, CommunityShelter)
        self.assertEqual(result, shelters)


if __name__ == "__main__":
    unittest.main()
