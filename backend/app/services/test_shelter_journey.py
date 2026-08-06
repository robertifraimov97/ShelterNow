"""
Focused unit tests for the pure, database-free parts of the Shelter Journey
domain logic: source normalization, shelter-key building, the
attempted-shelter exclusion/selection logic that guarantees the alternative
flow never loops back to an earlier shelter, the pure Active-Journey outcome
classifier, and mock-Session tests for the handful of DB-touching functions
whose behavior changed in the Phase 1 V2 domain stabilization (Community-
shelter gating in get_ranked_candidates, lazy expiry's terminal-state
irreversibility, and cross-area Journey reuse).

Still deliberately does NOT test build_alternative_preview, accept_alternative,
or the full get_or_create_initial_visit_session orchestration end-to-end —
this project has no test database or Postgres fixture set up yet, and these
tests must not touch the real hosted Neon database. The mock-Session tests
below fake only the specific query shapes each function under test actually
issues, verified by reading the function's source.

Run with:
    python -m unittest app.services.test_shelter_journey -v
"""

import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException

from app.db.models import (
    CommunityShelter,
    EmergencyAccessState,
    Shelter,
    ShelterJourney,
    ShelterVisitSession,
    User,
)
from app.services.shelter_journey import (
    SESSION_REUSE_WINDOW_MINUTES,
    _maybe_expire_journey,
    _upgrade_visit_session_into_journey,
    accept_alternative,
    build_alternative_preview,
    build_shelter_key,
    determine_active_journey_outcome,
    get_active_journey_for_user,
    get_or_create_initial_visit_session,
    get_ranked_candidates,
    normalize_shelter_source,
    select_first_eligible_candidate,
)


class NormalizeShelterSourceTests(unittest.TestCase):
    def test_lowercases_and_trims(self):
        self.assertEqual(normalize_shelter_source("Official"), "official")
        self.assertEqual(normalize_shelter_source("  Community "), "community")
        self.assertEqual(normalize_shelter_source("OFFICIAL"), "official")

    def test_empty_and_none_become_empty_string(self):
        self.assertEqual(normalize_shelter_source(""), "")
        self.assertEqual(normalize_shelter_source(None), "")


class BuildShelterKeyTests(unittest.TestCase):
    def test_combines_normalized_source_and_id(self):
        self.assertEqual(build_shelter_key("Official", 12), "official:12")
        self.assertEqual(build_shelter_key("community", 12), "community:12")

    def test_mixed_casing_produces_the_same_key(self):
        # This is the exact bug class the normalization step exists to
        # prevent: "Official" and "official" must never be treated as
        # different shelters.
        self.assertEqual(
            build_shelter_key("Official", 12),
            build_shelter_key("official", 12),
        )

    def test_same_id_different_source_produces_different_keys(self):
        # Shelter ids are not unique across sources.
        self.assertNotEqual(
            build_shelter_key("official", 12),
            build_shelter_key("community", 12),
        )


def make_candidate(source: str, shelter_id: int, name: str = "") -> dict:
    return {
        "id": shelter_id,
        "source": source,
        "name": name or f"{source}-{shelter_id}",
        "latitude": 0.0,
        "longitude": 0.0,
        "distance_meters": 0,
        "estimated_walk_minutes": 0,
    }


class SelectFirstEligibleCandidateTests(unittest.TestCase):
    def test_returns_first_candidate_when_nothing_attempted(self):
        candidates = [
            make_candidate("official", 1),
            make_candidate("official", 2),
        ]

        result = select_first_eligible_candidate(candidates, attempted_keys=set())

        self.assertEqual(result["id"], 1)
        self.assertEqual(result["source"], "official")

    def test_skips_attempted_candidates_preserving_ranking_order(self):
        candidates = [
            make_candidate("official", 1),
            make_candidate("official", 2),
            make_candidate("community", 3),
        ]
        attempted = {build_shelter_key("official", 1)}

        result = select_first_eligible_candidate(candidates, attempted)

        self.assertEqual(result["id"], 2)
        self.assertEqual(result["source"], "official")

    def test_returns_none_when_every_candidate_is_attempted(self):
        candidates = [
            make_candidate("official", 1),
            make_candidate("community", 2),
        ]
        attempted = {
            build_shelter_key("official", 1),
            build_shelter_key("community", 2),
        }

        result = select_first_eligible_candidate(candidates, attempted)

        self.assertIsNone(result)

    def test_returns_none_for_an_empty_candidate_list(self):
        self.assertIsNone(select_first_eligible_candidate([], attempted_keys=set()))

    def test_never_returns_an_already_attempted_shelter_even_if_it_reappears(self):
        # Regression guard for the original loop bug: A -> B -> A -> B ...
        # Shelter A (official:1) was already attempted; even though it is
        # first in the ranked list (e.g. the user walked back toward it),
        # it must never be selected again.
        candidates = [
            make_candidate("official", 1),  # already attempted
            make_candidate("official", 2),  # already attempted
            make_candidate("official", 3),  # the only real remaining option
        ]
        attempted = {
            build_shelter_key("official", 1),
            build_shelter_key("official", 2),
        }

        result = select_first_eligible_candidate(candidates, attempted)

        self.assertEqual(result["id"], 3)

    def test_mixed_case_source_in_candidate_is_still_excluded_correctly(self):
        # Guards against the exact casing bug called out in the design:
        # candidates from the ranking layer may be labeled "Official"
        # (capitalized) while attempted keys are built from DB-stored
        # lowercase values. Exclusion must still work correctly.
        candidates = [make_candidate("Official", 5)]
        attempted = {build_shelter_key("official", 5)}

        result = select_first_eligible_candidate(candidates, attempted)

        self.assertIsNone(result)


class DetermineActiveJourneyOutcomeTests(unittest.TestCase):
    """Pure decision logic for GET /shelter-journeys/active. Deliberately
    has no "area_mismatch" case at all — see the function's own docstring.
    """

    def test_structurally_invalid_is_always_no_active_journey(self):
        outcome, can_continue, can_alt, can_community = determine_active_journey_outcome(
            is_structurally_valid=False,
            coordinates_provided=True,
            area_confidently_inferred=True,
            current_area_has_verified_emergency=True,
        )

        self.assertEqual(outcome, "no_active_journey")
        self.assertFalse(can_continue)
        self.assertFalse(can_alt)
        self.assertFalse(can_community)

    def test_missing_coordinates_is_location_unavailable_but_can_continue(self):
        # Rule: missing GPS must preserve the Journey/destination while
        # denying new Alternative/Community operations.
        outcome, can_continue, can_alt, can_community = determine_active_journey_outcome(
            is_structurally_valid=True,
            coordinates_provided=False,
            area_confidently_inferred=False,
            current_area_has_verified_emergency=False,
        )

        self.assertEqual(outcome, "location_unavailable")
        self.assertTrue(can_continue)
        self.assertFalse(can_alt)
        self.assertFalse(can_community)

    def test_uncertain_area_inference_is_location_unavailable_not_applicable(self):
        # Coordinates ARE present here, but area_inference.py's confidence
        # rule could not place them. Must not be classified as fully
        # applicable just because raw coordinates exist.
        outcome, can_continue, can_alt, can_community = determine_active_journey_outcome(
            is_structurally_valid=True,
            coordinates_provided=True,
            area_confidently_inferred=False,
            current_area_has_verified_emergency=False,
        )

        self.assertEqual(outcome, "location_unavailable")
        self.assertTrue(can_continue)
        self.assertFalse(can_alt)
        self.assertFalse(can_community)

    def test_confident_area_with_verified_emergency_is_fully_applicable(self):
        outcome, can_continue, can_alt, can_community = determine_active_journey_outcome(
            is_structurally_valid=True,
            coordinates_provided=True,
            area_confidently_inferred=True,
            current_area_has_verified_emergency=True,
        )

        self.assertEqual(outcome, "applicable")
        self.assertTrue(can_continue)
        self.assertTrue(can_alt)
        self.assertTrue(can_community)

    def test_confident_area_without_verified_emergency_is_applicable_but_restricted(self):
        # Normal mode with a confidently-known current location: the Journey
        # stays fully applicable (an already-existing Journey is never
        # closed merely because the user is currently outside an active
        # Emergency Context) — only Alternative/Community are denied.
        outcome, can_continue, can_alt, can_community = determine_active_journey_outcome(
            is_structurally_valid=True,
            coordinates_provided=True,
            area_confidently_inferred=True,
            current_area_has_verified_emergency=False,
        )

        self.assertEqual(outcome, "applicable")
        self.assertTrue(can_continue)
        self.assertFalse(can_alt)
        self.assertFalse(can_community)


class _FakeShelterQuery:
    def __init__(self, shelters):
        self._shelters = shelters

    def all(self):
        return self._shelters


class _FakeDbForRankedCandidates:
    """Fakes only db.query(Shelter).all() — get_active_emergency_state and
    get_eligible_community_shelters are patched directly in each test, so no
    EmergencyAccessState/CommunityShelter query shape needs to be faked here.
    """

    def __init__(self, official_shelters=None):
        self._official_shelters = official_shelters or []

    def query(self, model):
        return _FakeShelterQuery(self._official_shelters)


class GetRankedCandidatesCommunityGatingTests(unittest.TestCase):
    """Regression coverage for the central bug this phase fixes:
    get_ranked_candidates used to include Community shelters unconditionally,
    regardless of whether the CURRENT coordinates had any verified active
    Emergency Context. Both Alternative Preview and Accept-alternative
    revalidation call this function directly, so fixing it here fixes both.
    """

    def _make_community_shelter(self):
        return CommunityShelter(
            id=1,
            name="Community Shelter",
            city="תל אביב",
            address="Some Address",
            latitude=32.08,
            longitude=34.78,
            is_active=True,
            show_only_during_emergency=True,
        )

    def test_verified_current_emergency_includes_community_shelters(self):
        community = self._make_community_shelter()
        db = _FakeDbForRankedCandidates()

        with patch(
            "app.services.shelter_journey.get_active_emergency_state",
            return_value=object(),
        ) as mock_gate, patch(
            "app.services.shelter_journey.get_eligible_community_shelters",
            return_value=[community],
        ) as mock_pool:
            candidates = get_ranked_candidates(db, user_latitude=32.08, user_longitude=34.78)

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["source"], "community")
        mock_gate.assert_called_once_with(db, 32.08, 34.78)
        mock_pool.assert_called_once_with(db)

    def test_no_verified_current_emergency_excludes_community_shelters(self):
        # This is the exact bug scenario: a Journey may exist (e.g. created
        # earlier, elsewhere), but the CURRENT coordinates have no verified
        # active Emergency Context — Community shelters must not appear.
        community = self._make_community_shelter()
        db = _FakeDbForRankedCandidates()

        with patch(
            "app.services.shelter_journey.get_active_emergency_state",
            return_value=None,
        ), patch(
            "app.services.shelter_journey.get_eligible_community_shelters",
            return_value=[community],
        ) as mock_pool:
            candidates = get_ranked_candidates(db, user_latitude=32.08, user_longitude=34.78)

        self.assertEqual(candidates, [])
        mock_pool.assert_not_called()

    def test_authorization_has_no_current_city_input_to_spoof(self):
        # get_ranked_candidates's only location input is user_latitude/
        # user_longitude, passed straight into get_active_emergency_state.
        # There is no current_city (or any other client-claimed string)
        # parameter anywhere in this call path for a client to spoof.
        db = _FakeDbForRankedCandidates()

        with patch(
            "app.services.shelter_journey.get_active_emergency_state",
            return_value=None,
        ) as mock_gate, patch(
            "app.services.shelter_journey.get_eligible_community_shelters",
            return_value=[],
        ):
            get_ranked_candidates(db, user_latitude=1.0, user_longitude=2.0)

        mock_gate.assert_called_once_with(db, 1.0, 2.0)


class _FakeEmergencyStateQuery:
    def __init__(self, state):
        self._state = state

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._state


class _FakeDbForExpiry:
    def __init__(self, state):
        self._state = state
        self.committed = False

    def query(self, model):
        return _FakeEmergencyStateQuery(self._state)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        pass


class MaybeExpireJourneyTests(unittest.TestCase):
    def test_active_journey_with_expired_linked_state_transitions_to_expired(self):
        state = EmergencyAccessState(
            area_name="תל אביב", expires_at=datetime.utcnow() - timedelta(minutes=1)
        )
        journey = ShelterJourney(
            id=1, user_id=1, status="active", emergency_access_state_id=99
        )
        db = _FakeDbForExpiry(state)

        result = _maybe_expire_journey(db, journey)

        self.assertEqual(result.status, "expired")
        self.assertIsNotNone(result.ended_at)
        self.assertTrue(db.committed)

    def test_active_journey_with_live_linked_state_stays_active(self):
        state = EmergencyAccessState(
            area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        journey = ShelterJourney(
            id=1, user_id=1, status="active", emergency_access_state_id=99
        )
        db = _FakeDbForExpiry(state)

        result = _maybe_expire_journey(db, journey)

        self.assertEqual(result.status, "active")
        self.assertFalse(db.committed)

    def test_terminal_status_journeys_are_never_reactivated_or_modified(self):
        # entered/expired/abandoned are one-way. Even with an expired linked
        # context, a terminal journey must be left completely untouched.
        for terminal_status in ("entered", "expired", "abandoned"):
            state = EmergencyAccessState(
                area_name="תל אביב", expires_at=datetime.utcnow() - timedelta(minutes=1)
            )
            journey = ShelterJourney(
                id=1, user_id=1, status=terminal_status, emergency_access_state_id=99
            )
            db = _FakeDbForExpiry(state)

            result = _maybe_expire_journey(db, journey)

            self.assertEqual(result.status, terminal_status)
            self.assertFalse(db.committed)

    def test_active_journey_with_null_emergency_access_state_id_is_expired_immediately(self):
        # The exact runtime bug this fixes: live Journey 7 had
        # status="active", emergency_access_state_id=NULL, ended_at=NULL --
        # a legacy/transitional row that could never be evaluated for
        # liveness by the EmergencyAccessState check below, so it stayed
        # 'active' forever, surviving indefinitely across restarts. This
        # test's FakeDb only knows how to answer an EmergencyAccessState
        # query with None -- the fact the journey still correctly expires
        # confirms no such query is even reached for this path.
        journey = ShelterJourney(
            id=7, user_id=42, status="active", emergency_access_state_id=None
        )
        db = _FakeDbForExpiry(state=None)

        result = _maybe_expire_journey(db, journey)

        self.assertEqual(result.status, "expired")
        self.assertIsNotNone(result.ended_at)
        self.assertTrue(db.committed)

    def test_terminal_status_journey_with_null_emergency_access_state_id_remains_untouched(self):
        # The new null-context branch must only ever fire for a journey
        # that is still 'active' -- a terminal journey with no linked
        # context (e.g. a genuinely pre-Journey-redesign row) must not be
        # touched at all.
        for terminal_status in ("entered", "expired", "abandoned"):
            journey = ShelterJourney(
                id=7, user_id=42, status=terminal_status, emergency_access_state_id=None
            )
            db = _FakeDbForExpiry(state=None)

            result = _maybe_expire_journey(db, journey)

            self.assertEqual(result.status, terminal_status)
            self.assertFalse(db.committed)


class _FakeInitialSessionQuery:
    def __init__(self, db, entities):
        self._db = db
        self._entities = entities

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        # The function issues two .first()-terminated queries in this order:
        # (1) an existing open ShelterVisitSession (recent-reuse dedup) —
        #     always None for this test, so it falls through to Journey
        #     lookup.
        # (2) the user's existing active ShelterJourney.
        if self._entities and self._entities[0] is ShelterJourney:
            return self._db.existing_active_journey
        return None


class _FakeDbForInitialVisitSession:
    def __init__(self, existing_active_journey):
        self.existing_active_journey = existing_active_journey
        self.added = []

    def query(self, *entities):
        return _FakeInitialSessionQuery(self, entities)

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        pass

    def commit(self):
        pass

    def refresh(self, obj):
        pass


class GetOrCreateInitialVisitSessionCrossAreaReuseTests(unittest.TestCase):
    def test_existing_active_journey_from_a_different_area_is_reused_not_replaced(self):
        # Regression guard for the Phase 1 V2 domain principle: a Journey is
        # not fixed to the coordinates/city/area where it was created. An
        # existing active Journey linked to one EmergencyAccessState (e.g.
        # Ramat Hasharon, id=111) must still be reused when the CURRENT
        # request resolves a DIFFERENT verified EmergencyAccessState (e.g.
        # Tel Aviv, id=222) — never rejected with an area-transition error,
        # never silently duplicated into a second active Journey.
        existing_journey = ShelterJourney(
            id=5, user_id=7, status="active", emergency_access_state_id=111
        )
        db = _FakeDbForInitialVisitSession(existing_active_journey=existing_journey)
        user = User(id=7)
        current_area_state = EmergencyAccessState(
            id=222, area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey.get_active_emergency_state",
            return_value=current_area_state,
        ), patch(
            "app.services.shelter_journey._maybe_expire_journey",
            side_effect=lambda db, journey: journey,
        ), patch(
            "app.services.shelter_journey.get_attempted_shelter_keys",
            return_value=set(),
        ), patch(
            "app.services.shelter_journey.create_visit_session_in_journey",
            return_value="fake-visit-session",
        ) as mock_create_in_journey:
            result = get_or_create_initial_visit_session(
                db=db,
                current_user=user,
                shelter_id=42,
                shelter_source="official",
                latitude=32.08,
                longitude=34.78,
            )

        self.assertEqual(result, "fake-visit-session")
        mock_create_in_journey.assert_called_once_with(
            db=db,
            journey_id=5,
            current_user=user,
            shelter_source="official",
            shelter_id=42,
            update_current_pointer=True,
        )
        # No second ShelterJourney was ever constructed/added — the mismatch
        # between 111 (existing) and 222 (current) is never even compared.
        self.assertEqual(
            [obj for obj in db.added if isinstance(obj, ShelterJourney)], []
        )


class GetOrCreateInitialVisitSessionLegacyNullEmergencyStateTests(unittest.TestCase):
    def test_legacy_null_context_active_journey_expires_and_a_new_journey_is_created(self):
        # Regression guard for the exact runtime bug: a legacy active
        # Journey with emergency_access_state_id=NULL must never be reused
        # to attach a new attempt -- it must be expired in place and a
        # brand-new Journey created for the current, verified context.
        # _maybe_expire_journey is deliberately NOT patched here (unlike the
        # cross-area reuse test above) so the real fix runs end-to-end.
        legacy_journey = ShelterJourney(
            id=7, user_id=42, status="active", emergency_access_state_id=None,
            current_visit_session_id=67,
        )
        db = _FakeDbForInitialVisitSession(existing_active_journey=legacy_journey)
        user = User(id=42)
        current_area_state = EmergencyAccessState(
            id=222, area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey.get_active_emergency_state",
            return_value=current_area_state,
        ):
            result = get_or_create_initial_visit_session(
                db=db,
                current_user=user,
                shelter_id=42,
                shelter_source="official",
                latitude=32.08,
                longitude=34.78,
            )

        self.assertEqual(legacy_journey.status, "expired")
        self.assertIsNotNone(legacy_journey.ended_at)

        new_journeys = [obj for obj in db.added if isinstance(obj, ShelterJourney)]
        self.assertEqual(len(new_journeys), 1)
        self.assertIsNot(new_journeys[0], legacy_journey)
        self.assertEqual(new_journeys[0].status, "active")
        self.assertEqual(new_journeys[0].emergency_access_state_id, 222)

        new_sessions = [obj for obj in db.added if isinstance(obj, ShelterVisitSession)]
        self.assertEqual(len(new_sessions), 1)
        self.assertIs(result, new_sessions[0])


class _FakeQueryByEntity:
    def __init__(self, row):
        self._row = row

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._row


class _FakeDbForActiveJourneyRead:
    """Fakes only the ShelterJourney lookup get_active_journey_for_user
    issues. A legacy emergency_access_state_id=NULL active journey is
    expired by _maybe_expire_journey without ever querying
    EmergencyAccessState (see that function's null-context branch), and
    once expired, get_active_journey_for_user short-circuits to
    no_active_journey before reaching ShelterVisitSession/Shelter at all --
    so no other query shape needs to be faked here.
    """

    def __init__(self, journey):
        self._journey = journey

    def query(self, model):
        if model is ShelterJourney:
            return _FakeQueryByEntity(self._journey)
        return _FakeQueryByEntity(None)

    def commit(self):
        pass

    def refresh(self, obj):
        pass


class GetActiveJourneyForUserLegacyNullEmergencyStateTests(unittest.TestCase):
    def test_legacy_active_journey_with_null_context_expires_and_reports_no_active_journey(self):
        journey = ShelterJourney(
            id=7, user_id=42, status="active", emergency_access_state_id=None,
            current_visit_session_id=67,
        )
        db = _FakeDbForActiveJourneyRead(journey)
        user = User(id=42)

        result = get_active_journey_for_user(
            db, current_user=user, user_latitude=32.08, user_longitude=34.78
        )

        self.assertEqual(journey.status, "expired")
        self.assertIsNotNone(journey.ended_at)
        self.assertEqual(result["outcome"], "no_active_journey")
        self.assertFalse(result["has_active_journey"])
        self.assertIsNone(result["journey_id"])
        self.assertIsNone(result["shelter"])


class _FakeQueryByPk:
    def __init__(self, row):
        self._row = row

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self._row


class _FakeDbForAlternativeFlow:
    """Dispatches db.query(Model) to a canned row by entity type — enough to
    drive build_alternative_preview's happy path (journey -> current visit
    session -> current shelter) once infer_area_name_from_coordinates,
    _maybe_expire_journey, get_attempted_shelter_keys, and get_ranked_candidates
    are patched, each of which is already covered by its own dedicated tests
    elsewhere in this file / test_area_inference.py.
    """

    def __init__(self, journey, current_session, current_shelter):
        self._journey = journey
        self._current_session = current_session
        self._current_shelter = current_shelter

    def query(self, *entities):
        model = entities[0]

        if model is ShelterJourney:
            return _FakeQueryByPk(self._journey)
        if model is ShelterVisitSession:
            return _FakeQueryByPk(self._current_session)
        if model is Shelter:
            return _FakeQueryByPk(self._current_shelter)

        return _FakeQueryByPk(None)


class _PoisonedDb:
    """A fake Session that fails the test immediately if ANY query or
    mutation method is ever called. Used to prove the location guard in
    build_alternative_preview/accept_alternative rejects before touching
    the Journey, its current Visit Session, or any shelter table at all —
    the strongest possible evidence that a rejection can never leave a
    partial read or write behind.
    """

    def query(self, *args, **kwargs):
        raise AssertionError("db.query() must not be called when location is unavailable")

    def add(self, *args, **kwargs):
        raise AssertionError("db.add() must not be called when location is unavailable")

    def flush(self):
        raise AssertionError("db.flush() must not be called when location is unavailable")

    def commit(self):
        raise AssertionError("db.commit() must not be called when location is unavailable")

    def refresh(self, *args, **kwargs):
        raise AssertionError("db.refresh() must not be called when location is unavailable")


class BuildAlternativePreviewLocationGuardTests(unittest.TestCase):
    def test_confident_current_location_proceeds_to_a_real_preview(self):
        # The guard must never block a legitimate, confidently-placed request
        # — this is the positive counterpart to the rejection tests below.
        journey = ShelterJourney(
            id=5, user_id=7, status="active", current_visit_session_id=100
        )
        current_session = ShelterVisitSession(
            id=100, journey_id=5, shelter_id=1, shelter_source="official"
        )
        current_shelter = Shelter(
            id=1, name="Shelter A", city="תל אביב", address="Addr A",
            latitude=32.08, longitude=34.78,
        )
        db = _FakeDbForAlternativeFlow(journey, current_session, current_shelter)
        user = User(id=7)
        candidate = {
            "id": 2,
            "source": "official",
            "name": "Shelter B",
            "latitude": 32.09,
            "longitude": 34.79,
            "distance_meters": 500,
            "estimated_walk_minutes": 7,
        }

        with patch(
            "app.services.shelter_journey.infer_area_name_from_coordinates",
            return_value="תל אביב",
        ), patch(
            "app.services.shelter_journey._maybe_expire_journey",
            side_effect=lambda db, j: j,
        ), patch(
            "app.services.shelter_journey.get_attempted_shelter_keys",
            return_value=set(),
        ), patch(
            "app.services.shelter_journey.get_ranked_candidates",
            return_value=[candidate],
        ) as mock_ranked:
            result = build_alternative_preview(
                db,
                journey_id=5,
                current_user=user,
                user_latitude=32.08,
                user_longitude=34.78,
            )

        self.assertTrue(result["alternative_available"])
        self.assertEqual(result["recommended_alternative"]["id"], 2)
        mock_ranked.assert_called_once_with(db, 32.08, 34.78)


class AlternativeFlowLocationGuardRejectionTests(unittest.TestCase):
    """Covers: rejects without writes, Journey/current_visit_session_id
    unchanged after rejection, Community not exposed, and Official-only
    fallback not returned — all four follow directly from the same fact,
    proven here by _PoisonedDb: when location is unavailable, the guard
    raises before a single db.query/add/flush/commit/refresh call happens
    in either function. Nothing is read, so nothing can be mutated, ranked,
    or returned.
    """

    def test_preview_rejects_when_area_inference_is_uncertain(self):
        db = _PoisonedDb()
        user = User(id=7)

        with patch(
            "app.services.shelter_journey.infer_area_name_from_coordinates",
            return_value=None,
        ):
            with self.assertRaises(HTTPException) as ctx:
                build_alternative_preview(
                    db,
                    journey_id=5,
                    current_user=user,
                    user_latitude=32.08,
                    user_longitude=34.78,
                )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error"], "location_unavailable")

    def test_preview_rejects_when_coordinates_are_missing(self):
        db = _PoisonedDb()
        user = User(id=7)

        with self.assertRaises(HTTPException) as ctx:
            build_alternative_preview(
                db,
                journey_id=5,
                current_user=user,
                user_latitude=None,
                user_longitude=None,
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error"], "location_unavailable")

    def test_accept_alternative_rejects_when_area_inference_is_uncertain(self):
        db = _PoisonedDb()
        user = User(id=7)

        with patch(
            "app.services.shelter_journey.infer_area_name_from_coordinates",
            return_value=None,
        ):
            with self.assertRaises(HTTPException) as ctx:
                accept_alternative(
                    db,
                    journey_id=5,
                    current_user=user,
                    shelter_id=2,
                    shelter_source="official",
                    user_latitude=32.08,
                    user_longitude=34.78,
                )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error"], "location_unavailable")

    def test_accept_alternative_rejects_when_coordinates_are_missing(self):
        db = _PoisonedDb()
        user = User(id=7)

        with self.assertRaises(HTTPException) as ctx:
            accept_alternative(
                db,
                journey_id=5,
                current_user=user,
                shelter_id=2,
                shelter_source="official",
                user_latitude=None,
                user_longitude=None,
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error"], "location_unavailable")


class _FakeLockableRowQuery:
    def __init__(self, row):
        self._row = row

    def filter(self, *args, **kwargs):
        return self

    def with_for_update(self):
        return self

    def first(self):
        return self._row


class _FakeDbForVisitSessionUpgrade:
    """Fakes the two ShelterVisitSession queries
    _upgrade_visit_session_into_journey issues, in call order:
      1. re-fetch-and-lock the target session by id.
      2. (only reached if journey_id was still NULL) the conflicting-attempt
         check by (journey_id, shelter_source, shelter_id).
    _resolve_or_create_active_journey is patched out in every test using
    this fake, so no ShelterJourney query needs to be faked here.
    """

    def __init__(self, visit_session, conflicting_attempt=None):
        self._visit_session = visit_session
        self._conflicting_attempt = conflicting_attempt
        self._call_count = 0
        self.committed = False

    def query(self, model):
        self._call_count += 1

        if self._call_count == 1:
            return _FakeLockableRowQuery(self._visit_session)

        return _FakeLockableRowQuery(self._conflicting_attempt)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        pass


class UpgradeVisitSessionIntoJourneyTests(unittest.TestCase):
    def test_null_journey_session_is_upgraded_into_a_freshly_created_journey_atomically(self):
        visit_session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=None, feedback_submitted=False,
        )
        new_journey = ShelterJourney(
            id=9, user_id=5, status="active", emergency_access_state_id=3,
        )
        db = _FakeDbForVisitSessionUpgrade(visit_session=visit_session)
        user = User(id=5)
        active_state = EmergencyAccessState(
            id=3, area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey._resolve_or_create_active_journey",
            return_value=(new_journey, True),
        ):
            result = _upgrade_visit_session_into_journey(db, user, 71, active_state)

        self.assertIs(result, visit_session)
        self.assertEqual(visit_session.journey_id, new_journey.id)
        self.assertEqual(new_journey.current_visit_session_id, visit_session.id)
        self.assertTrue(db.committed)

    def test_session_already_in_the_correct_active_journey_is_returned_unchanged(self):
        journey = ShelterJourney(id=9, user_id=5, status="active")
        visit_session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=9, feedback_submitted=False,
        )
        db = _FakeDbForVisitSessionUpgrade(visit_session=visit_session)
        user = User(id=5)
        active_state = EmergencyAccessState(
            id=3, area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey._resolve_or_create_active_journey",
            return_value=(journey, False),
        ):
            result = _upgrade_visit_session_into_journey(db, user, 71, active_state)

        self.assertIs(result, visit_session)
        self.assertEqual(visit_session.journey_id, 9)
        self.assertFalse(db.committed)

    def test_session_in_a_conflicting_journey_is_rejected_not_reassigned(self):
        # The session already belongs to journey 4, but the resolved
        # "current" active journey is 9 -- must never be silently
        # reassigned from one to the other.
        journey = ShelterJourney(id=9, user_id=5, status="active")
        visit_session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=4, feedback_submitted=False,
        )
        db = _FakeDbForVisitSessionUpgrade(visit_session=visit_session)
        user = User(id=5)
        active_state = EmergencyAccessState(
            id=3, area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey._resolve_or_create_active_journey",
            return_value=(journey, False),
        ):
            with self.assertRaises(HTTPException) as ctx:
                _upgrade_visit_session_into_journey(db, user, 71, active_state)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error"], "visit_session_journey_conflict")
        self.assertEqual(ctx.exception.detail["existing_journey_id"], 4)
        self.assertEqual(ctx.exception.detail["target_journey_id"], 9)
        # Never reassigned -- the original link is preserved exactly.
        self.assertEqual(visit_session.journey_id, 4)
        self.assertFalse(db.committed)

    def test_duplicate_shelter_attempt_under_target_journey_is_rejected_not_merged(self):
        # journey_id is NULL (eligible for upgrade), but the exact same
        # shelter is already attempted under the target journey via a
        # different row -- upgrading would violate
        # uq_visit_session_journey_shelter, so it must be rejected instead
        # of silently merged/reassigned.
        journey = ShelterJourney(id=9, user_id=5, status="active")
        visit_session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=None, feedback_submitted=False,
        )
        conflicting_attempt = ShelterVisitSession(
            id=80, user_id=5, shelter_id=32, shelter_source="official", journey_id=9,
        )
        db = _FakeDbForVisitSessionUpgrade(
            visit_session=visit_session, conflicting_attempt=conflicting_attempt
        )
        user = User(id=5)
        active_state = EmergencyAccessState(
            id=3, area_name="תל אביב", expires_at=datetime.utcnow() + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey._resolve_or_create_active_journey",
            return_value=(journey, False),
        ):
            with self.assertRaises(HTTPException) as ctx:
                _upgrade_visit_session_into_journey(db, user, 71, active_state)

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail["error"], "visit_session_journey_conflict")
        self.assertEqual(ctx.exception.detail["conflicting_visit_session_id"], 80)
        self.assertIsNone(visit_session.journey_id)
        self.assertFalse(db.committed)


def _matches_reuse_criteria(candidate, user_id, shelter_id, shelter_source, reuse_threshold):
    """Mirrors, in plain Python, the exact 5 conditions
    get_or_create_initial_visit_session's existing_open_session query
    applies (shelter_journey.py) -- there is no test database to evaluate
    the real SQL against, so this predicate is kept in lockstep with that
    query's conditions by inspection.
    """
    return (
        candidate.user_id == user_id
        and candidate.shelter_id == shelter_id
        and candidate.shelter_source == shelter_source
        and candidate.feedback_submitted is False
        and candidate.route_started_at >= reuse_threshold
    )


class _FakeReuseEligibilityQuery:
    def __init__(self, matches):
        self._matches = matches

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        return self._matches[0] if self._matches else None


class _FakeDbForVisitSessionEntry:
    """Fakes only get_or_create_initial_visit_session's own top-level
    reuse-eligibility query, evaluated via _matches_reuse_criteria against a
    supplied candidate list. Everything downstream (journey resolution, the
    upgrade itself) is exercised by dedicated tests elsewhere and is
    patched out in every test using this fake.
    """

    def __init__(self, candidate_sessions, user_id, shelter_id, shelter_source, reuse_threshold):
        matches = [
            c
            for c in candidate_sessions
            if _matches_reuse_criteria(c, user_id, shelter_id, shelter_source, reuse_threshold)
        ]
        matches.sort(key=lambda c: c.route_started_at, reverse=True)
        self._matches = matches
        self.added = []

    def query(self, model):
        return _FakeReuseEligibilityQuery(self._matches)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        pass

    def refresh(self, obj):
        pass


class GetOrCreateInitialVisitSessionEmergencyUpgradeEntryTests(unittest.TestCase):
    def _reuse_threshold(self, now):
        return now - timedelta(minutes=SESSION_REUSE_WINDOW_MINUTES)

    def test_normal_session_reused_while_still_normal_stays_unattached(self):
        now = datetime.utcnow()
        session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=None, feedback_submitted=False,
            route_started_at=now - timedelta(minutes=5),
        )
        db = _FakeDbForVisitSessionEntry(
            [session], user_id=5, shelter_id=32, shelter_source="official",
            reuse_threshold=self._reuse_threshold(now),
        )
        user = User(id=5)

        with patch(
            "app.services.shelter_journey.get_active_emergency_state", return_value=None,
        ), patch(
            "app.services.shelter_journey._upgrade_visit_session_into_journey",
        ) as mock_upgrade:
            result = get_or_create_initial_visit_session(
                db=db, current_user=user, shelter_id=32, shelter_source="official",
                latitude=32.08, longitude=34.78,
            )

        self.assertIs(result, session)
        self.assertIsNone(result.journey_id)
        mock_upgrade.assert_not_called()

    def test_normal_session_reused_after_emergency_opens_is_upgraded(self):
        now = datetime.utcnow()
        session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=None, feedback_submitted=False,
            route_started_at=now - timedelta(minutes=5),
        )
        db = _FakeDbForVisitSessionEntry(
            [session], user_id=5, shelter_id=32, shelter_source="official",
            reuse_threshold=self._reuse_threshold(now),
        )
        user = User(id=5)
        active_state = EmergencyAccessState(
            id=3, area_name="תל אביב", expires_at=now + timedelta(minutes=10)
        )

        with patch(
            "app.services.shelter_journey.get_active_emergency_state",
            return_value=active_state,
        ), patch(
            "app.services.shelter_journey._upgrade_visit_session_into_journey",
            return_value="upgraded-session",
        ) as mock_upgrade:
            result = get_or_create_initial_visit_session(
                db=db, current_user=user, shelter_id=32, shelter_source="official",
                latitude=32.08, longitude=34.78,
            )

        self.assertEqual(result, "upgraded-session")
        mock_upgrade.assert_called_once_with(db, user, 71, active_state)

    def test_feedback_submitted_session_is_not_reused_or_upgraded(self):
        now = datetime.utcnow()
        submitted_session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=None, feedback_submitted=True,
            route_started_at=now - timedelta(minutes=5),
        )
        db = _FakeDbForVisitSessionEntry(
            [submitted_session], user_id=5, shelter_id=32, shelter_source="official",
            reuse_threshold=self._reuse_threshold(now),
        )
        user = User(id=5)

        with patch(
            "app.services.shelter_journey.get_active_emergency_state", return_value=None,
        ), patch(
            "app.services.shelter_journey._upgrade_visit_session_into_journey",
        ) as mock_upgrade:
            result = get_or_create_initial_visit_session(
                db=db, current_user=user, shelter_id=32, shelter_source="official",
                latitude=32.08, longitude=34.78,
            )

        mock_upgrade.assert_not_called()
        self.assertIsNot(result, submitted_session)
        self.assertIsNone(result.journey_id)

    def test_session_outside_the_reuse_window_is_not_reused(self):
        now = datetime.utcnow()
        stale_session = ShelterVisitSession(
            id=71, user_id=5, shelter_id=32, shelter_source="official",
            journey_id=None, feedback_submitted=False,
            route_started_at=now - timedelta(minutes=SESSION_REUSE_WINDOW_MINUTES + 15),
        )
        db = _FakeDbForVisitSessionEntry(
            [stale_session], user_id=5, shelter_id=32, shelter_source="official",
            reuse_threshold=self._reuse_threshold(now),
        )
        user = User(id=5)

        with patch(
            "app.services.shelter_journey.get_active_emergency_state", return_value=None,
        ), patch(
            "app.services.shelter_journey._upgrade_visit_session_into_journey",
        ) as mock_upgrade:
            result = get_or_create_initial_visit_session(
                db=db, current_user=user, shelter_id=32, shelter_source="official",
                latitude=32.08, longitude=34.78,
            )

        mock_upgrade.assert_not_called()
        self.assertIsNot(result, stale_session)
        self.assertIsNone(result.journey_id)


if __name__ == "__main__":
    unittest.main()
