-- ═══════════════════════════════════════════════════════════════════
-- P2 — Composite indexes for dashboard & report RPCs
-- These replace sequential scans on single-column org indexes
-- with efficient range scans on the most common query patterns.
-- ═══════════════════════════════════════════════════════════════════

-- appointments: org + date (used in ~15 subqueries in get_admin_dashboard_stats)
CREATE INDEX IF NOT EXISTS idx_appointments_org_date
  ON appointments (organization_id, appointment_date);

-- appointments: org + date + status (filtered counts & revenue)
CREATE INDEX IF NOT EXISTS idx_appointments_org_date_status
  ON appointments (organization_id, appointment_date, status);

-- patients: org + created_at (new patients this/last month)
CREATE INDEX IF NOT EXISTS idx_patients_org_created
  ON patients (organization_id, created_at);

-- patient_payments: org + payment_date (revenue collected queries)
CREATE INDEX IF NOT EXISTS idx_patient_payments_org_date
  ON patient_payments (organization_id, payment_date);

-- organization_subscriptions: payer email + status (webhook plan-based lookup)
CREATE INDEX IF NOT EXISTS idx_org_subs_payer_email_status
  ON organization_subscriptions (mp_payer_email, status)
  WHERE mp_payer_email IS NOT NULL;
