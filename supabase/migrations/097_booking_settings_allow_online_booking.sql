-- =============================================
-- MIGRATION 097: booking_settings.allow_online_booking
-- =============================================
-- Separate toggle from is_enabled (which controls public /book access).
-- When allow_online_booking = true, the patient portal shows "Agendar cita"
-- that links to /book/[slug]. When false, the portal shows a contact modal
-- with WhatsApp / Call actions so the patient reaches reception.
--
-- Default true: same behavior as today for existing orgs.

ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS allow_online_booking BOOLEAN NOT NULL DEFAULT true;
