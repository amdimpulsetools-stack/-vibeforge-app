-- =============================================
-- MIGRATION 100: Discounts — inline + reusable codes
-- =============================================
-- Two-tier discount system:
--
--   1. Inline discount (all plans, including Starter):
--      Staff types a % or fixed amount directly on an appointment.
--      Stored on appointments.discount_amount + discount_reason.
--
--   2. Reusable discount codes (Professional, Enterprise):
--      Admin creates coupon codes with value/limits/dates/service scope.
--      Applying a code on an appointment increments uses_count and sets
--      appointments.discount_code_id + discount_amount.
--
-- All additive, no breaking change. Existing rows default discount_amount=0.
-- Effective price = GREATEST(0, price_snapshot - discount_amount) and is
-- computed at read time (no generated column) so callers can keep using
-- price_snapshot unchanged when no discount was applied.

-- ── 1. discount_codes (Pro feature) ──────────────────────────
CREATE TABLE IF NOT EXISTS discount_codes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code                    text NOT NULL,
  type                    text NOT NULL CHECK (type IN ('percent', 'fixed')),
  value                   numeric(10,2) NOT NULL CHECK (value > 0),
  max_uses                integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count              integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  valid_from              date,
  valid_until             date,
  applies_to_service_ids  uuid[],   -- NULL = todos los servicios
  is_active               boolean NOT NULL DEFAULT true,
  notes                   text,
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discount_codes_select" ON discount_codes
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "discount_codes_insert" ON discount_codes
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "discount_codes_update" ON discount_codes
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "discount_codes_delete" ON discount_codes
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX IF NOT EXISTS idx_discount_codes_org_active
  ON discount_codes(organization_id, is_active)
  WHERE is_active;

-- ── 2. appointments columns ──────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS discount_amount      numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS discount_reason      text,
  ADD COLUMN IF NOT EXISTS discount_applied_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_code_id     uuid REFERENCES discount_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_discount_code
  ON appointments(discount_code_id)
  WHERE discount_code_id IS NOT NULL;
