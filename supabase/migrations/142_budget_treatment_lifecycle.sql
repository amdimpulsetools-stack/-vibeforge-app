-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 142: Budget treatment lifecycle (Phase 5 prep)
--
-- Extends the budget_records lifecycle from a 3-state acceptance enum
-- (pending_acceptance / accepted / rejected) to a 6-state state machine
-- that captures the post-acceptance journey:
--
--   pending_acceptance → accepted → in_progress → completed
--                                ↘ rejected | expired
--
--   - `started_at` / `started_by_user_id`: stamped by
--     POST /api/budgets/[id]/start.
--   - `completed_at`: stamped by
--     POST /api/budgets/[id]/complete (admin/owner only).
--   - Partial index for the cron alert that fires when an accepted
--     budget has not been started after a configurable delay
--     (default 14 days, sourced from followup_rules.delay_days).
--
-- Per-org rule seeding for `fertility.budget_accepted_pending_start`:
-- the existing followup_rules schema (mig 127) requires `addon_key` +
-- `trigger_event`. We use `treatment_plan_created` as the trigger
-- event (closest semantic to "downstream of an existing rule"), even
-- though the cron itself is what creates the followup; trigger_event
-- is an enum constraint and any of the 3 allowed values keeps the row
-- valid. The actual cron logic lives in
-- app/api/cron/fertility-followup-contact/route.ts.
--
-- Idempotent. ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Extend acceptance_status enum (CHECK constraint)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE budget_records
  DROP CONSTRAINT IF EXISTS budget_records_acceptance_status_check;

ALTER TABLE budget_records
  ADD CONSTRAINT budget_records_acceptance_status_check
  CHECK (acceptance_status IN (
    'pending_acceptance',
    'accepted',
    'in_progress',
    'completed',
    'rejected',
    'expired'
  ));

-- ─────────────────────────────────────────────────────────────────
-- 2. New lifecycle columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN budget_records.started_at IS
  'Set by POST /api/budgets/[id]/start when an accepted budget transitions to in_progress (treatment effectively started).';
COMMENT ON COLUMN budget_records.started_by_user_id IS
  'auth.users.id of the staff member that marked the treatment as started. owner/admin/doctor/advisor are allowed.';
COMMENT ON COLUMN budget_records.completed_at IS
  'Set by POST /api/budgets/[id]/complete (admin/owner only) — financial-impact decision so the gate is more restrictive than start.';

-- Partial index targeting the cron predicate (accepted but unstarted).
CREATE INDEX IF NOT EXISTS idx_budget_records_accepted_unstarted
  ON budget_records(organization_id, accepted_at)
  WHERE acceptance_status = 'accepted' AND started_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 3. Per-org rule: fertility.budget_accepted_pending_start
-- ─────────────────────────────────────────────────────────────────
-- Seeds a per-org rule for every org that already has fertility_basic
-- or fertility_premium enabled. Future addon activations should also
-- seed this row (deferred until the activation endpoint Phase 5).
--
-- followup_rules schema (mig 127) — required columns:
--   organization_id, addon_key, rule_key, trigger_event,
--   trigger_category_key, target_category_key, delay_days,
--   is_active, is_system, max_attempts.
--
-- trigger_event MUST be one of ('appointment_completed',
-- 'treatment_plan_created', 'plan_status_changed') per the CHECK
-- constraint. We pick 'treatment_plan_created' because this rule
-- conceptually fires after a budget (≈ plan) is accepted.
INSERT INTO followup_rules (
  organization_id, addon_key, rule_key, trigger_event,
  trigger_category_key, target_category_key,
  delay_days, is_active, is_system, max_attempts
)
SELECT
  oa.organization_id,
  'fertility',
  'fertility.budget_accepted_pending_start',
  'treatment_plan_created',
  NULL,
  'fertility.treatment_started',
  14,
  true,
  true,
  3
FROM organization_addons oa
WHERE oa.addon_key IN ('fertility_basic', 'fertility_premium')
  AND oa.enabled = true
ON CONFLICT (organization_id, rule_key) DO NOTHING;

COMMENT ON CONSTRAINT budget_records_acceptance_status_check ON budget_records IS
  'Phase 5 prep (mig 142): extended from 3 to 6 states. Adds in_progress / completed / expired. The transition accepted → in_progress is gated by /api/budgets/[id]/start; in_progress → completed by /api/budgets/[id]/complete (admin/owner only).';
