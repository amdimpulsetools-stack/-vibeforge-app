-- =============================================
-- Migration 042: Add 'pending' status to organization_subscriptions
-- Needed for MercadoPago checkout flow where subscription is created
-- before payment is confirmed via webhook.
-- =============================================

ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'trialing', 'past_due', 'cancelled', 'expired'));
