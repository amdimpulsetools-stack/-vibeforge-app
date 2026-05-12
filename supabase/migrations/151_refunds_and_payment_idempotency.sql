-- Migration 151: Wave 2 Sprint 4 — refund tracking + webhook idempotency.
--
-- The audit found two related gaps:
--   1. No refund flow. If the founder needed to refund a payment (bad
--      charge, support compensation, fraud) there was no app path —
--      manual MP-dashboard refunds were invisible to Yenda.
--   2. payment_history.insert on the MP webhook was not idempotent.
--      MP retries the same event multiple times (every retry uses the
--      same payment id) and we created N rows for one real payment.
--      Refund processing without idempotency would compound that.
--
-- This migration adds the columns the refund flow needs, a UNIQUE
-- constraint on mp_payment_id so the webhook can upsert safely, and
-- extends the billing_events.event_type CHECK with three new values.

-- ─── 1. payment_history columns for refund tracking ──────────────
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS refunded_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_source TEXT
    CHECK (refund_source IN ('founder_app', 'mp_dashboard', 'mp_webhook'));

-- ─── 2. Idempotency for webhook upsert ───────────────────────────
-- The webhook used to insert; we want upsert on mp_payment_id. A
-- partial unique index (only when mp_payment_id IS NOT NULL) lets
-- legacy rows with NULL coexist.
CREATE UNIQUE INDEX IF NOT EXISTS payment_history_mp_payment_id_unique
  ON payment_history(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- ─── 3. Extend billing_events.event_type CHECK ───────────────────
ALTER TABLE billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'payment_failed',
    'entered_grace',
    'grace_extended',
    'grace_expired',
    'recovered_to_active',
    'past_due_terminated',
    'cancelled_by_user',
    'cancelled_by_mp',
    'email_sent',
    'plan_changed',
    'plan_change_mp_sync_failed',
    'addon_added',
    'addon_cancelled',
    'addon_mp_sync_failed',
    'org_delete_requested',
    'org_delete_cancelled',
    'org_delete_anonymized',
    'reactivation_requested',
    'reactivation_completed',
    'deletion_grace_reminder_sent',
    'refund_issued',
    'refund_received',
    'refund_failed'
  ));
