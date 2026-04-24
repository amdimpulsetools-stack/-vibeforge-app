-- F-03: Store SHA-256 hash of the magic-link token instead of plaintext.
--
-- Background:
--   `patient_portal_tokens.token` held the raw 64-char hex token delivered
--   to the patient's email AND persisted in the DB verbatim. If a DB backup,
--   replica, or misconfigured RLS ever leaked the row, tokens were usable
--   directly — no additional step required.
--
-- Fix:
--   Persist `token_hash` (SHA-256 hex of the raw token). The raw token still
--   travels by email (standard for magic links) and in the verification URL,
--   but the DB row alone is no longer sufficient to impersonate the user.
--
-- Rollout:
--   The live-token window is 15 min. All unused tokens are purged first —
--   worst case, a patient who just requested a link has to request another.
--   This is safe because the pilot (Vitra) has not started yet.
--
-- Before re-enabling traffic, the app code must write/read `token_hash`
-- (see lib/portal-auth.ts + request-link/verify routes).

-- Purge pending tokens (raw token won't be re-discoverable after this migration).
DELETE FROM patient_portal_tokens WHERE used_at IS NULL;

-- Drop the old index and column.
DROP INDEX IF EXISTS idx_portal_tokens_lookup;
ALTER TABLE patient_portal_tokens DROP CONSTRAINT IF EXISTS patient_portal_tokens_token_key;
ALTER TABLE patient_portal_tokens DROP COLUMN IF EXISTS token;

-- Add the hashed column (NOT NULL — purge above ensures empty pending set,
-- and used rows are historical audit with token_hash left empty; we seed them
-- with a sentinel so the constraint holds).
ALTER TABLE patient_portal_tokens ADD COLUMN token_hash TEXT;

UPDATE patient_portal_tokens
SET token_hash = 'legacy-' || id::text
WHERE token_hash IS NULL;

ALTER TABLE patient_portal_tokens ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE patient_portal_tokens ADD CONSTRAINT patient_portal_tokens_token_hash_key UNIQUE (token_hash);

CREATE INDEX idx_portal_tokens_hash_lookup ON patient_portal_tokens (token_hash, expires_at);
