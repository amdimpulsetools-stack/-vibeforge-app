-- Migration 148: extend billing_events.event_type with the new states
-- introduced by Wave 2 Sprint 1 (plan-change MP sync + addon cancellation).
--
-- This is a CHECK constraint swap, idempotent.

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
    'addon_mp_sync_failed'
  ));
