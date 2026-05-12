-- Migration 150: Wave 2 Sprint 3 — reactivation + deletion grace reminder.
--
-- Adds two new billing_events.event_type values used by:
--   - POST /api/billing/reactivate (creates a new MP preApproval when
--     the owner wants to undo a cancel within the 90-day window)
--   - /api/cron/billing-status (7-day reminder before the account
--     deletion grace closes — separate from the existing payment grace
--     reminder which is 2 days)

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
    'deletion_grace_reminder_sent'
  ));
