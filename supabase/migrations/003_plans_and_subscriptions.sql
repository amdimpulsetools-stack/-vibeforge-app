-- =============================================
-- PLANES Y SUSCRIPCIONES
-- Ejecuta esto en Supabase SQL Editor
-- =============================================

-- =============================================
-- TABLA: plans
-- Catálogo de planes disponibles
-- =============================================
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC(10,2) DEFAULT 0,
  price_yearly NUMERIC(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'PEN',
  -- Límites
  max_members INTEGER DEFAULT 1,
  max_doctors INTEGER DEFAULT 1,
  max_offices INTEGER DEFAULT 1,
  max_patients INTEGER DEFAULT 150,
  max_appointments_per_month INTEGER DEFAULT 100,
  max_storage_mb INTEGER DEFAULT 100,
  -- Feature flags
  has_reports BOOLEAN DEFAULT false,
  has_export BOOLEAN DEFAULT false,
  has_ai_assistant BOOLEAN DEFAULT false,
  has_api_access BOOLEAN DEFAULT false,
  has_priority_support BOOLEAN DEFAULT false,
  -- Orden y estado
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer los planes (catálogo público)
CREATE POLICY "Anyone can view active plans"
  ON plans FOR SELECT
  USING (is_active = true);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_plans
  BEFORE UPDATE ON plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TABLA: organization_subscriptions
-- Suscripción activa de cada organización
-- =============================================
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  -- Estado de suscripción
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'trialing', 'past_due', 'cancelled', 'expired')),
  billing_cycle TEXT DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly')),
  -- Mercado Pago
  mp_preapproval_id TEXT,
  mp_subscription_id TEXT,
  -- Fechas
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuarios ven solo sus propias suscripciones
CREATE POLICY "Users can view own subscriptions"
  ON organization_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
  ON organization_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON organization_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE TRIGGER set_updated_at_org_subscriptions
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TABLA: payment_history
-- Historial de pagos de Mercado Pago
-- =============================================
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id),
  -- Mercado Pago
  mp_payment_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'PEN',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'refunded', 'cancelled')),
  payment_type TEXT DEFAULT 'subscription',
  -- Metadata
  description TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment history"
  ON payment_history FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================
-- SEED: Plan Independiente (test pricing)
-- =============================================
INSERT INTO plans (slug, name, description, price_monthly, price_yearly, currency, max_members, max_doctors, max_offices, max_patients, max_appointments_per_month, max_storage_mb, has_reports, has_export, has_ai_assistant, has_api_access, has_priority_support, display_order)
VALUES (
  'independiente',
  'Independiente',
  'Para doctores independientes que inician su práctica',
  1.00,    -- S/1 precio de test
  10.00,   -- S/10 precio de test anual
  'PEN',
  1, 1, 1, 150, 100, 100,
  true, false, false, false, false,
  1
)
ON CONFLICT (slug) DO NOTHING;
