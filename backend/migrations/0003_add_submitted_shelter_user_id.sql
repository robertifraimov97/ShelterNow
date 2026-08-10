-- Adds explicit user ownership to submitted shelters.
--
-- submitted_shelters.user_id
--     - identifies the authenticated user who created the submission.
--     - nullable so existing submissions without reliable ownership data
--       remain valid and are not incorrectly assigned to a user.
--
-- New submissions will receive user_id from the authenticated user token.
-- Existing rows remain NULL unless ownership is known with certainty.
--
-- Safe to re-run because the column, constraint, and index are guarded.

BEGIN;

-- 1. Add the ownership column.
ALTER TABLE submitted_shelters
    ADD COLUMN IF NOT EXISTS user_id INTEGER NULL;

-- 2. Link submitted shelters to the users table.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_submitted_shelters_user'
    ) THEN
        ALTER TABLE submitted_shelters
            ADD CONSTRAINT fk_submitted_shelters_user
            FOREIGN KEY (user_id)
            REFERENCES users(id);
    END IF;
END $$;

-- 3. Add an index because submitted shelters will frequently be filtered
--    by the authenticated user's ID.
CREATE INDEX IF NOT EXISTS ix_submitted_shelters_user_id
    ON submitted_shelters (user_id);

COMMIT;
