-- Adds the Shelter Journey domain model on top of the existing
-- shelter_visit_sessions table.
--
--   shelter_journeys              - the full chain of shelter attempts for
--                                    one emergency navigation flow
--   shelter_visit_sessions.journey_id
--                                  - links each attempt to its journey
--   shelter_journeys.current_visit_session_id
--                                  - explicit pointer to the active attempt
--                                    (never inferred from created_at/id order)
--
-- This project uses Base.metadata.create_all(), which only creates missing
-- tables and never alters an existing one. shelter_visit_sessions already
-- exists, so journey_id must be added here explicitly.
--
-- Purely additive: no existing column, row, or table is modified or dropped.
-- Runs as a single transaction (all-or-nothing). Every individual statement
-- is written to be safe to re-run (CREATE ... IF NOT EXISTS / a guarded
-- DO block for the two constraints, since Postgres has no
-- "ADD CONSTRAINT IF NOT EXISTS"), so accidentally executing this file a
-- second time after a successful run is a safe no-op.
--
-- FK ordering: shelter_journeys and shelter_visit_sessions reference each
-- other (journey_id -> shelter_journeys.id, current_visit_session_id ->
-- shelter_visit_sessions.id). Since shelter_visit_sessions already exists
-- before this migration runs, there is no real chicken-and-egg problem here
-- (only shelter_journeys is new) -- but the statements below are still
-- ordered so each FK is only added once its target table/column exists:
--   1. create shelter_journeys (no FK to shelter_visit_sessions yet)
--   2. add + link shelter_visit_sessions.journey_id -> shelter_journeys(id)
--   3. add the uniqueness guard on shelter_visit_sessions
--   4. add + link shelter_journeys.current_visit_session_id ->
--      shelter_visit_sessions(id), ON DELETE SET NULL

BEGIN;

-- 1. New table: shelter_journeys.
--    status, started_at, and created_at are NOT NULL but deliberately have
--    no SQL-level DEFAULT: this project's existing convention is to supply
--    these values from the ORM (ShelterJourney.status="active",
--    started_at/created_at=datetime.utcnow), not from the database. Every
--    insert goes through the ORM, which always sets them before the row is
--    written.
CREATE TABLE IF NOT EXISTS shelter_journeys (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR NOT NULL,
    started_at TIMESTAMP NOT NULL,
    ended_at TIMESTAMP NULL,
    entered_shelter_id INTEGER NULL,
    entered_shelter_source VARCHAR NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_shelter_journeys_user_id
    ON shelter_journeys (user_id);

-- 2. Link existing shelter_visit_sessions rows to a journey.
--    Nullable: pre-migration rows have no journey and stay NULL permanently
--    (this is a deliberate, permanent compatibility state, not a gap to
--    backfill -- see point 8 of the design discussion).
ALTER TABLE shelter_visit_sessions
    ADD COLUMN IF NOT EXISTS journey_id INTEGER NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_visit_session_journey'
    ) THEN
        ALTER TABLE shelter_visit_sessions
            ADD CONSTRAINT fk_visit_session_journey
            FOREIGN KEY (journey_id) REFERENCES shelter_journeys(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_shelter_visit_sessions_journey_id
    ON shelter_visit_sessions (journey_id);

-- 3. The same normalized (journey_id, shelter_source, shelter_id) key must
--    never appear twice. Rows with journey_id = NULL are exempt: Postgres
--    treats NULL as distinct from every other NULL in a unique constraint,
--    so legacy rows never collide with each other or with real journeys.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_visit_session_journey_shelter'
    ) THEN
        ALTER TABLE shelter_visit_sessions
            ADD CONSTRAINT uq_visit_session_journey_shelter
            UNIQUE (journey_id, shelter_source, shelter_id);
    END IF;
END $$;

-- 4. Explicit "current destination" pointer on the journey itself. Added
--    after shelter_visit_sessions.journey_id exists so this FK's target
--    column is always valid regardless of statement execution order.
--    ON DELETE SET NULL: if a visit session row is ever deleted directly,
--    the journey should not be left pointing at a nonexistent row -- it
--    should fall back to "no current session" rather than fail or dangle.
ALTER TABLE shelter_journeys
    ADD COLUMN IF NOT EXISTS current_visit_session_id INTEGER NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_journey_current_visit_session'
    ) THEN
        ALTER TABLE shelter_journeys
            ADD CONSTRAINT fk_journey_current_visit_session
            FOREIGN KEY (current_visit_session_id)
            REFERENCES shelter_visit_sessions(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_shelter_journeys_current_visit_session_id
    ON shelter_journeys (current_visit_session_id);

COMMIT;
