-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 174: Ajuste de honorarios médicos por presupuesto
--
-- Los tiers A/B/C fijan un precio base (service_budget_tiers.amount)
-- cuya única diferencia real son los honorarios del médico. Para casos
-- puntuales (paciente high-ticket) el especialista necesita cobrar un
-- sobreprecio sobre el tier más alto sin tener que crear un 4.º tier.
--
-- `honorarios_adjustment` es ese delta (siempre ≥ 0, en la misma
-- moneda que el tier). Se captura al asignar el presupuesto, se suma al
-- snapshot `amount`, y en el PDF de Vitra (FIV) se integra dentro de la
-- línea de honorarios médicos + subtotal de la fase + total, sin línea
-- de "ajuste" visible para la paciente.
--
-- Idempotente e inerte para orgs sin el addon fertility: default 0 no
-- altera ningún presupuesto existente.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS honorarios_adjustment NUMERIC(10, 2) NOT NULL DEFAULT 0
    CONSTRAINT budget_records_honorarios_adjustment_nonneg CHECK (honorarios_adjustment >= 0);

COMMENT ON COLUMN budget_records.honorarios_adjustment IS
  'Sobreprecio de honorarios médicos (delta ≥ 0) que el especialista agrega sobre el precio base del tier al asignar el presupuesto. Se suma a `amount` y, en plantillas PDF que itemizan honorarios (ej. Vitra FIV), se integra en la línea de honorarios + subtotal + total. 0 = sin ajuste.';
