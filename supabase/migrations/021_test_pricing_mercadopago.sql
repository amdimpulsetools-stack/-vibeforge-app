-- =============================================
-- Migration 021: Test Pricing + Mercado Pago fields
-- Precios de prueba para validar pasarela de pagos
-- =============================================

-- 1) Update test prices
-- Plan Independiente: S/ 3.35/mes
UPDATE plans SET
  price_monthly = 3.35,
  price_yearly = 33.50,
  currency = 'PEN'
WHERE slug = 'starter';

-- Plan Centro Médico: S/ 6.70/mes
UPDATE plans SET
  price_monthly = 6.70,
  price_yearly = 67.00,
  currency = 'PEN'
WHERE slug = 'professional';

-- Plan Clínica: S/ 10.05/mes
UPDATE plans SET
  price_monthly = 10.05,
  price_yearly = 100.50,
  currency = 'PEN'
WHERE slug = 'enterprise';

-- 2) Add Mercado Pago specific fields to organization_subscriptions
ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payer_email TEXT,
  ADD COLUMN IF NOT EXISTS mp_next_payment_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mp_last_payment_status TEXT;

-- 3) Create payment_history table for tracking all Mercado Pago transactions
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  mp_payment_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'PEN',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'refunded', 'cancelled')),
  payment_type TEXT CHECK (payment_type IN ('subscription', 'addon', 'one_time')),
  description TEXT,
  mp_raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can view their payment history
CREATE POLICY "org_admins_view_payments" ON payment_history
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- Only service role can insert/update (webhooks)
CREATE POLICY "service_role_manage_payments" ON payment_history
  FOR ALL USING (auth.role() = 'service_role');

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_payment_history_org ON payment_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_mp_id ON payment_history(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_sub ON payment_history(subscription_id);
