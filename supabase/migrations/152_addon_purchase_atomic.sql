-- Migration 152: Wave 2 Sprint 5 — atomic addon purchase + reactivation event types.
--
-- F12: Race-condition lock on addon purchase.
-- The existing PUT /api/mercadopago/subscription read plan_addons,
-- computed a new total, called MP preApproval.update, then inserted
-- the addon — all in JS without serialization. Two parallel clicks
-- from the same owner could both pass the limit check and end up
-- either double-charging MP or under-charging (depending on
-- interleaving). See the explicit TODO at app/api/mercadopago/
-- subscription/route.ts:138-144 left by Sprint 1.
--
-- Fix: a Postgres RPC that wraps the whole "reserve a slot" step in
-- a row-level lock on organization_subscriptions plus a partial unique
-- index that prevents two concurrent reservations for the same
-- (org, addon_type).
--
-- F13: New billing_events types for reactivation-with-addons audit.

-- ── plan_addons.status ───────────────────────────────────────────
-- The boolean is_active is kept for backwards compat. The new status
-- column tracks the reservation state machine:
--   'active'           → being charged (is_active=true)
--   'pending_mp_sync'  → reservation held while MP call is in flight
--   'mp_sync_failed'   → MP rejected; reservation released
--   'cancelled'        → owner cancelled via /api/addons/cancel
ALTER TABLE plan_addons
  ADD COLUMN IF NOT EXISTS status text;

UPDATE plan_addons
   SET status = CASE WHEN is_active THEN 'active' ELSE 'cancelled' END
 WHERE status IS NULL;

ALTER TABLE plan_addons
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE plan_addons
  DROP CONSTRAINT IF EXISTS plan_addons_status_check;

ALTER TABLE plan_addons
  ADD CONSTRAINT plan_addons_status_check
  CHECK (status IN ('active', 'pending_mp_sync', 'mp_sync_failed', 'cancelled'));

-- Prevents two concurrent reservations for the same (org, addon_type).
-- Drops automatically when the reservation flips to 'active' or
-- 'mp_sync_failed', so a legitimate retry after a failed MP call works.
CREATE UNIQUE INDEX IF NOT EXISTS plan_addons_pending_sync_unique
  ON plan_addons (organization_id, addon_type)
  WHERE status = 'pending_mp_sync';

-- ── RPC purchase_addon_atomic ────────────────────────────────────
-- The API route calls this BEFORE talking to Mercado Pago. The RPC:
--   1. Cleans up stuck reservations (>5 min) so a crashed API call
--      doesn't permanently block future purchases of the same type.
--   2. Locks the subscription row (FOR UPDATE) so concurrent calls
--      for the same org serialize.
--   3. Validates the sub is active + has an MP preApproval.
--   4. Recomputes the new monthly total from the locked state.
--   5. Inserts the new addon row with status='pending_mp_sync'.
--      If a parallel call already inserted one, the partial unique
--      index raises unique_violation → we raise
--      'addon_purchase_in_progress' so the caller can return 409.
--   6. Returns {addon_id, mp_preapproval_id, new_total} so the API
--      route can call MP and then confirm with status='active' (or
--      delete the row on MP failure).
CREATE OR REPLACE FUNCTION purchase_addon_atomic(
  p_org_id uuid,
  p_user_id uuid,
  p_addon_type text,
  p_quantity int,
  p_unit_price numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub_id uuid;
  v_mp_preapproval_id text;
  v_plan_id uuid;
  v_base_price numeric;
  v_current_addon_cost numeric;
  v_new_total numeric;
  v_addon_id uuid;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = 'P0001';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    RAISE EXCEPTION 'invalid_unit_price' USING ERRCODE = 'P0001';
  END IF;

  -- Release any reservations that got orphaned (API crashed between
  -- the RPC return and the MP confirmation).
  UPDATE plan_addons
     SET status = 'mp_sync_failed',
         is_active = false,
         updated_at = now()
   WHERE organization_id = p_org_id
     AND addon_type = p_addon_type
     AND status = 'pending_mp_sync'
     AND created_at < now() - interval '5 minutes';

  -- Lock the latest non-cancelled subscription for this org. Two
  -- concurrent RPC calls for the same org block here until the first
  -- transaction commits.
  SELECT s.id, s.mp_preapproval_id, s.plan_id
    INTO v_sub_id, v_mp_preapproval_id, v_plan_id
    FROM organization_subscriptions s
   WHERE s.organization_id = p_org_id
     AND s.status IN ('active', 'trialing')
   ORDER BY s.created_at DESC
   LIMIT 1
   FOR UPDATE OF s;

  IF v_sub_id IS NULL THEN
    RAISE EXCEPTION 'no_active_subscription' USING ERRCODE = 'P0001';
  END IF;
  IF v_mp_preapproval_id IS NULL THEN
    RAISE EXCEPTION 'subscription_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT price_monthly INTO v_base_price
    FROM plans WHERE id = v_plan_id;

  IF v_base_price IS NULL THEN
    RAISE EXCEPTION 'plan_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_current_addon_cost
    FROM plan_addons
   WHERE organization_id = p_org_id
     AND status = 'active';

  v_new_total := v_base_price + v_current_addon_cost + (p_quantity * p_unit_price);

  -- Insert the reservation. The partial unique index blocks a parallel
  -- reservation for the same (org, addon_type).
  BEGIN
    INSERT INTO plan_addons (
      organization_id, addon_type, quantity, unit_price, is_active, status
    ) VALUES (
      p_org_id, p_addon_type, p_quantity, p_unit_price, false, 'pending_mp_sync'
    )
    RETURNING id INTO v_addon_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'addon_purchase_in_progress' USING ERRCODE = 'P0001';
  END;

  RETURN jsonb_build_object(
    'addon_id', v_addon_id,
    'subscription_id', v_sub_id,
    'mp_preapproval_id', v_mp_preapproval_id,
    'new_total', v_new_total,
    'addon_total', p_quantity * p_unit_price,
    'actor_user_id', p_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION purchase_addon_atomic(uuid, uuid, text, int, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purchase_addon_atomic(uuid, uuid, text, int, numeric) TO service_role;

-- ── billing_events.event_type CHECK extension ────────────────────
-- F13 emits one of these from the webhook when MP authorizes a
-- reactivation preApproval that has previously-active addons in DB.
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
    'refund_failed',
    'reactivation_addons_restored',
    'reactivation_addons_sync_failed'
  ));
