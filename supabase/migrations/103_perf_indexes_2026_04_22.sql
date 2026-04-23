-- =============================================
-- MIGRATION 103: Performance indexes (perf review 2026-04-22)
-- =============================================
-- Indexes identified by the performance audit as missing for hot-path
-- queries. All `IF NOT EXISTS` — safe to re-run. No column or data
-- changes, only index additions.
--
-- Source: docs/performance-review-2026-04-22.md (findings F-2, F-11,
-- F-14, F-18, F-29, F-32 + supporting indexes for scheduler / cron /
-- notifications / portal sessions / attachments).

-- ── Scheduler: schedule_blocks filtered by (org, date) ──────
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_org_date
  ON schedule_blocks (organization_id, block_date);

-- ── Patient drawer → clinical tab ordered by created_at DESC ──
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_created
  ON clinical_notes (patient_id, created_at DESC);

-- ── Patient search: ILIKE over 4 columns (requires pg_trgm) ──
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_first_trgm
  ON patients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_last_trgm
  ON patients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_dni_trgm
  ON patients USING gin (dni gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_phone_trgm
  ON patients USING gin (phone gin_trgm_ops);

-- ── Lookup values: joined with filters in multiple places ──
-- NOTE: real column is `category_id` (not `lookup_category_id` as the
-- audit draft suggested).
CREATE INDEX IF NOT EXISTS idx_lookup_values_cat_org_active
  ON lookup_values (category_id, organization_id, is_active);

-- ── Payment totals fan-out in scheduler (covering index) ──
CREATE INDEX IF NOT EXISTS idx_patient_payments_appt_amt
  ON patient_payments (appointment_id) INCLUDE (amount);

-- ── Reminder logs: cron lookup by (appt, template, channel, status) ──
CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup
  ON reminder_logs (appointment_id, template_slug, channel, status);

-- ── Notifications: org dashboard topbar ordered by created_at DESC ──
CREATE INDEX IF NOT EXISTS idx_notifications_org_created
  ON notifications (organization_id, created_at DESC);

-- ── Portal sessions: lookup by patient + expiration ──
CREATE INDEX IF NOT EXISTS idx_portal_sessions_patient_exp
  ON patient_portal_sessions (patient_id, expires_at DESC);

-- ── Clinical attachments: patient drawer listing ──
CREATE INDEX IF NOT EXISTS idx_clinical_attachments_patient_created
  ON clinical_attachments (patient_id, created_at DESC);

-- Refresh statistics so the planner picks up the new indexes.
ANALYZE schedule_blocks;
ANALYZE clinical_notes;
ANALYZE patients;
ANALYZE lookup_values;
ANALYZE patient_payments;
ANALYZE reminder_logs;
ANALYZE notifications;
ANALYZE patient_portal_sessions;
ANALYZE clinical_attachments;
