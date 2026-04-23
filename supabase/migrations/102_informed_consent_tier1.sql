-- =============================================
-- MIGRATION 102: Informed consent — Tier 1 (MVP)
-- =============================================
-- Peru: Ley 29414 + DS 027-2015-SA require written informed consent for
-- procedures with risk (surgery, anesthesia, invasive procedures,
-- aesthetic treatments, radiation exposure, etc.). Regular consultations
-- are exempt.
--
-- This migration adds the minimal columns needed to:
--   1. Mark per-service whether the procedure requires consent
--      (clinic admin configures once in /admin/services).
--   2. Register on each clinical note that consent was obtained, with
--      optional notes (e.g., "signed by legal guardian", "patient
--      deferred the procedure").
--
-- The physical artifact — scanned or photographed signed document —
-- continues to live in `clinical_attachments` with category='consent'
-- (that category already exists and works today via phone camera upload).
--
-- Templates + pre-filled PDF generation are Tier 2 (separate migration,
-- documented in COMING-UPDATES.md).

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS requires_consent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE clinical_notes
  ADD COLUMN IF NOT EXISTS consent_registered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_notes TEXT;
