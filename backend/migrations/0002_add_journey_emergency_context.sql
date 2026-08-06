-- Ties ShelterJourney to the existing Emergency Access system and enforces
-- "one ACTIVE Journey per user" as a real database invariant instead of a
-- "most recently created" heuristic.
--
--   shelter_journeys.emergency_access_state_id
--       - links a journey to the emergency_access_states row that
--         justified its creation. Nullable for pre-existing journeys.
--   uq_one_active_journey_per_user
--       - partial unique index: a user can have at most one row with
--         status = 'active' at any time.
--
-- This does not modify emergency_access_states or shelter_visit_sessions at
-- all -- the existing 900-second emergency-access timer system is reused
-- unchanged, per product decision.
--
-- IMPORTANT — read before running:
-- Before this migration, nothing ever transitioned a ShelterJourney out of
-- 'active'. It is very likely that some users already have MORE THAN ONE
-- row with status = 'active' in shelter_journeys. Creating the partial
-- unique index directly against that data will fail. Step 3 below performs
-- a one-time cleanup: for each user with multiple 'active' journeys, the
-- single most-recently-started one is kept active, and every other one is
-- administratively closed as 'abandoned'. Review this step before running
-- it against real user data.
--
-- Runs as a single transaction (all-or-nothing). Steps 1-2 and 4 are safe
-- to re-run (IF NOT EXISTS / guarded DO blocks). Step 3 is idempotent by
-- construction: once at most one 'active' row per user remains, re-running
-- it finds nothing left to close.

BEGIN;

-- 1. Link journeys to the emergency context that created them.
ALTER TABLE shelter_journeys
    ADD COLUMN IF NOT EXISTS emergency_access_state_id INTEGER NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_journey_emergency_access_state'
    ) THEN
        ALTER TABLE shelter_journeys
            ADD CONSTRAINT fk_journey_emergency_access_state
            FOREIGN KEY (emergency_access_state_id)
            REFERENCES emergency_access_states(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_shelter_journeys_emergency_access_state_id
    ON shelter_journeys (emergency_access_state_id);

-- 2. Preview of what step 3 will change. Run this SELECT first and review
--    the output before proceeding, especially in a shared environment.
--
-- SELECT user_id, count(*) AS active_journey_count
-- FROM shelter_journeys
-- WHERE status = 'active'
-- GROUP BY user_id
-- HAVING count(*) > 1;

-- 3. One-time cleanup: for every user with more than one 'active' journey,
--    keep only the most-recently-started one active; close the rest as
--    'abandoned' (administratively closed by this migration, not a real
--    user action, but 'abandoned' is the closest accurate terminal state --
--    these were left open with no lifecycle tracking before this change).
WITH ranked_active_journeys AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY started_at DESC, id DESC
        ) AS recency_rank
    FROM shelter_journeys
    WHERE status = 'active'
)
UPDATE shelter_journeys
SET status = 'abandoned',
    ended_at = now()
WHERE id IN (
    SELECT id FROM ranked_active_journeys WHERE recency_rank > 1
);

-- 4. Enforce the invariant. This will fail loudly if step 3 did not run
--    (or was insufficient) -- that failure is intentional, not something to
--    silently work around.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'uq_one_active_journey_per_user'
    ) THEN
        CREATE UNIQUE INDEX uq_one_active_journey_per_user
            ON shelter_journeys (user_id)
            WHERE status = 'active';
    END IF;
END $$;

COMMIT;
