-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 167: budget_records — doctor + asesora + appointment FKs
--
-- Phase 4 follow-up explicitly flagged in `app/api/budgets/assign/route.ts`
-- (ASESORA SCHEMA NOTE, lines 195-214): the assign endpoint accepted
-- `asesora_id` and `appointment_id` in its body, validated them, then
-- silently dropped them on the floor because budget_records had no
-- columns to persist either. Consequence in production: the PDF tried
-- to read "médico tratante" from `assigned_by_user_id` (whoever clicked
-- the button, usually an admin) and "asesora" from `sent_by_user_id`
-- (NULL until the budget is sent to the patient). Both came out blank
-- or wrong on every Vitra budget.
--
-- This migration closes the gap:
--   • appointment_id       → cita-of-origin when assigned from the cita
--                            sidebar. NULL for the standalone flow.
--   • assigned_doctor_id   → doctor that saw the patient (= the doctor
--                            of the cita in flow A; manually picked in
--                            flow B). Required at the API level — a
--                            budget without a treating doctor doesn't
--                            make medical sense.
--   • assigned_asesora_member_id → obstetra/asesora coordinating the
--                            budget. Filters to org members with
--                            is_fertility_advisor = true in the UI.
--
-- All three nullable at the DB level for now: there are existing rows
-- (Lisandra's budget among them) created before the assign endpoint
-- knew how to fill these in. The NOT NULL contract is enforced at the
-- API layer for new inserts, so historical rows are preserved as-is
-- and gracefully render with "—" on the PDF.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS appointment_id UUID
    REFERENCES appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID
    REFERENCES doctors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_asesora_member_id UUID
    REFERENCES organization_members(id) ON DELETE SET NULL;

-- Lookup indexes. All partial because the columns are nullable and the
-- typical query is "find budgets for this doctor / this asesora / this
-- cita" — we never want to scan the NULLs.
CREATE INDEX IF NOT EXISTS idx_budget_records_appointment
  ON budget_records(appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_records_assigned_doctor
  ON budget_records(assigned_doctor_id)
  WHERE assigned_doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_records_assigned_asesora
  ON budget_records(assigned_asesora_member_id)
  WHERE assigned_asesora_member_id IS NOT NULL;

COMMENT ON COLUMN budget_records.appointment_id IS
  'Cita de origen cuando el presupuesto se asigna desde el sidebar de una cita (flujo A). NULL cuando se crea desde el flujo standalone /scheduler/budgets/new (flujo B).';
COMMENT ON COLUMN budget_records.assigned_doctor_id IS
  'Doctor que vio a la paciente (aparece como "Médico tratante" en el PDF). Pre-llenado con appointments.doctor_id en flujo A; seleccionado manualmente en flujo B. Required en la API (un presupuesto sin doctor tratante no tiene sentido clínico).';
COMMENT ON COLUMN budget_records.assigned_asesora_member_id IS
  'Obstetra/asesora que acompaña este presupuesto (organization_members.id flagged is_fertility_advisor = true). Aparece como "Asesora de fertilidad" en el PDF. Required en la API.';

-- RLS already in place from mig 136; new columns are covered by the
-- existing org-scoped policies (selects/updates check organization_id,
-- which doesn't change).
