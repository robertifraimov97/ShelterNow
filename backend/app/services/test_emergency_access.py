"""
Focused unit tests for activate_or_extend_emergency_access — the source of
truth for area-wide Emergency Context windows that ShelterJourney is built
on top of. This project has no test database, so a minimal fake Session is
used instead of touching the real hosted Neon database; the fake only
implements the exact query/add/commit/refresh shape this function issues,
verified by reading its source.

Covers the Phase 1 V2 requirements this function must already satisfy
unchanged:
  - a first relevant alert opens the window
  - a duplicate copy of the same alert_id does not reset the timer
  - a new relevant alert_id (same or different threat type) extends the
    same row — never creating a second row, and therefore never causing a
    second Journey to be created for the same area

Run with:
    python -m unittest app.services.test_emergency_access -v
"""

import unittest

from app.services.emergency_access import activate_or_extend_emergency_access


class _FakeEmergencyStateQuery:
    def __init__(self, db):
        self._db = db

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._db.state


class _FakeDb:
    def __init__(self):
        self.state = None

    def query(self, model):
        return _FakeEmergencyStateQuery(self)

    def add(self, obj):
        self.state = obj

    def commit(self):
        pass

    def refresh(self, obj):
        pass


class ActivateOrExtendEmergencyAccessTests(unittest.TestCase):
    def test_first_relevant_alert_creates_the_area_window(self):
        db = _FakeDb()

        state = activate_or_extend_emergency_access(
            db, area_name="תל אביב", alert_id="alert-1", event_type="rocket_attack"
        )

        self.assertIsNotNone(state)
        self.assertEqual(state.last_alert_id, "alert-1")
        self.assertIs(db.state, state)

    def test_duplicate_same_alert_id_does_not_reset_the_timer(self):
        db = _FakeDb()
        first = activate_or_extend_emergency_access(db, "תל אביב", "alert-1", "rocket_attack")
        original_expires_at = first.expires_at

        second = activate_or_extend_emergency_access(db, "תל אביב", "alert-1", "rocket_attack")

        self.assertIs(second, first)
        self.assertEqual(second.expires_at, original_expires_at)

    def test_new_relevant_alert_id_extends_the_same_row(self):
        db = _FakeDb()
        first = activate_or_extend_emergency_access(db, "תל אביב", "alert-1", "rocket_attack")

        second = activate_or_extend_emergency_access(db, "תל אביב", "alert-2", "rocket_attack")

        self.assertIs(second, first)
        self.assertEqual(second.last_alert_id, "alert-2")
        self.assertGreaterEqual(second.expires_at, first.expires_at)

    def test_different_threat_types_in_sequence_extend_the_same_context(self):
        # prepare-near-shelter -> rocket alert -> hostile aircraft alert, all
        # new alert_ids for the same area: each must extend the SAME row,
        # never create a second one. Journey creation elsewhere is driven
        # only by "is there a live EmergencyAccessState for this area" — one
        # row per area structurally means one Journey can ever link to it at
        # a time, so this alone prevents a Journey per threat type.
        db = _FakeDb()

        state_1 = activate_or_extend_emergency_access(
            db, "תל אביב", "alert-prepare", "prepare_near_shelter"
        )
        state_2 = activate_or_extend_emergency_access(
            db, "תל אביב", "alert-rocket", "rocket_attack"
        )
        state_3 = activate_or_extend_emergency_access(
            db, "תל אביב", "alert-aircraft", "hostile_aircraft_intrusion"
        )

        self.assertIs(state_1, state_2)
        self.assertIs(state_2, state_3)
        self.assertEqual(state_3.last_event_type, "hostile_aircraft_intrusion")


if __name__ == "__main__":
    unittest.main()
