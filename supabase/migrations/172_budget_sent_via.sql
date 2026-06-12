-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 172: budget_records.sent_via — how the budget reached
-- the patient
--
-- Context: "Enviar al paciente" used to be a status stamp + a PDF
-- tab; nothing actually traveled to the patient, so the "presupuestos
-- enviados" metric measured "staff clicked a button". The new send
-- flow (same PR) offers three real channels and records which one
-- was used:
--
--   email     → Yenda sent the PDF link by email (Resend)
--   whatsapp  → staff sent it via wa.me prefilled message + link
--   other     → marked as sent through another medium (printed,
--               in-person, patient's relative, etc.)
--
-- Nullable: rows sent before this migration keep NULL ("no sabemos
-- el canal"). Reports can later break down enviados by channel.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS sent_via TEXT
    CHECK (sent_via IN ('email', 'whatsapp', 'other'));

COMMENT ON COLUMN budget_records.sent_via IS
  'Canal por el que el presupuesto llegó a la paciente: email (enviado por Yenda vía Resend), whatsapp (mensaje wa.me prellenado por el equipo), other (otro medio). NULL = enviado antes de la mig 172.';
