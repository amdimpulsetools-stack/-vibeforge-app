-- =============================================
-- Migration 033: Add mp_plan_id to plans
-- Links our plans to Mercado Pago subscription plans
-- =============================================

ALTER TABLE plans ADD COLUMN IF NOT EXISTS mp_plan_id TEXT;

COMMENT ON COLUMN plans.mp_plan_id IS 'Mercado Pago preapproval_plan_id from MP dashboard';

-- Link the Independiente plan to MP subscription plan
UPDATE plans
SET mp_plan_id = 'c79885b9875a438286b252318ca72d95'
WHERE slug = 'independiente';
