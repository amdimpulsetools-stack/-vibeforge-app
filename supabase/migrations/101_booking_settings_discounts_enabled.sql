-- =============================================
-- MIGRATION 101: booking_settings.discounts_enabled
-- =============================================
-- Master switch for the discount feature (inline + reusable codes). When
-- false, the "Aplicar descuento" button is hidden from the appointment
-- sidebar and the code-apply endpoint rejects requests from the org.
-- Default true so existing clinics keep current UX.
--
-- Independent of plan gating: discounts_enabled=true on a Starter plan
-- still only exposes inline discounts (codes remain Pro-only).

ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS discounts_enabled BOOLEAN NOT NULL DEFAULT true;
