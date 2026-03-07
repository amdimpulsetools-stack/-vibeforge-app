-- =============================================
-- Migration 040: Update Mercado Pago plan IDs for all plans
-- Links each plan to its corresponding MP preapproval plan
-- =============================================

-- Starter plan
UPDATE plans
SET mp_plan_id = 'c79885b9875a438286b252318ca72d95'
WHERE slug = 'starter';

-- Professional plan
UPDATE plans
SET mp_plan_id = '8ab428a7aff34c40ac51f5af85b81214'
WHERE slug = 'professional';

-- Enterprise plan
UPDATE plans
SET mp_plan_id = '19554b83e3664bb998c6579bfda74761'
WHERE slug = 'enterprise';

-- Clear old independiente mapping if it exists
UPDATE plans
SET mp_plan_id = NULL
WHERE slug = 'independiente' AND mp_plan_id IS NOT NULL;
