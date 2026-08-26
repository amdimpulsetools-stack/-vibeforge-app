-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 229: Cobros al paciente — Culqi F1 (link de cobro)
--
-- Cada clínica conecta SU propia cuenta Culqi (mismo modelo que
-- NubeFact en la mig 108): guarda su llave pública y su llave secreta
-- (cifrada AES-256-GCM vía lib/encryption.ts — una fuga de DB no basta
-- para cobrar con ella). El staff genera links de cobro para deudas de
-- pacientes; el paciente paga en una página pública (/pagar/[token])
-- con tarjeta o Yape. El pago exitoso se registra como patient_payment
-- normal: el trigger de Caja (migs 213/214) lo ata al turno abierto o
-- lo deja "fuera de turno" — NUNCA rechaza.
--
-- Seguridad del acceso público: los links NO tienen policy para anon.
-- La página pública pasa por API routes con service role, que exponen
-- solo campos seguros (monto, concepto, nombre de clínica, public key).
--
-- Additive + idempotente — safe to re-run en una base viva.
-- NO se aplica desde el CLI: el founder la pega a mano.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. culqi_config — una por organization
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS culqi_config (
  organization_id       UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  public_key            TEXT NOT NULL,
  secret_key_encrypted  TEXT NOT NULL,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  connected_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE culqi_config IS
  'Credenciales Culqi por organización (modelo "cada clínica su cuenta", como NubeFact). El dinero va directo a la cuenta Culqi de la clínica.';
COMMENT ON COLUMN culqi_config.public_key IS
  'Llave pública Culqi (pk_test_/pk_live_). Se expone al navegador del pagador para tokenizar tarjeta/Yape — no es secreta.';
COMMENT ON COLUMN culqi_config.secret_key_encrypted IS
  'Llave secreta Culqi (sk_test_/sk_live_) cifrada AES-256-GCM (lib/encryption.ts). Solo se descifra server-side al crear cargos. JAMÁS se devuelve al cliente ni se loguea.';
COMMENT ON COLUMN culqi_config.enabled IS
  'false = pausa el módulo sin perder credenciales: no se pueden crear links nuevos ni cobrar los pendientes.';

ALTER TABLE culqi_config ENABLE ROW LEVEL SECURITY;

-- Solo owner/admin: la fila contiene la llave secreta (cifrada). El
-- staff no-admin no necesita leerla — las rutas de API validan la
-- config con service role. Mismo patrón admin-only que einvoice_configs
-- (mig 108) pero también en SELECT.
DROP POLICY IF EXISTS "Org admins read culqi_config" ON culqi_config;
CREATE POLICY "Org admins read culqi_config"
  ON culqi_config FOR SELECT
  USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Org admins write culqi_config" ON culqi_config;
CREATE POLICY "Org admins write culqi_config"
  ON culqi_config FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

DROP TRIGGER IF EXISTS set_updated_at_culqi_config ON culqi_config;
CREATE TRIGGER set_updated_at_culqi_config
  BEFORE UPDATE ON culqi_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 2. payment_links — links de cobro
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token               TEXT UNIQUE NOT NULL,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id          UUID REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id      UUID REFERENCES appointments(id) ON DELETE SET NULL,
  amount              NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency            TEXT NOT NULL DEFAULT 'PEN',
  concept             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','paid','cancelled','expired')),
  culqi_charge_id     TEXT,
  payment_method      TEXT,
  patient_payment_id  UUID REFERENCES patient_payments(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL,
  paid_at             TIMESTAMPTZ
);

COMMENT ON TABLE payment_links IS
  'Links de cobro Culqi. El paciente paga en /pagar/[token] (página pública vía service role — anon NO tiene policy RLS).';
COMMENT ON COLUMN payment_links.token IS
  'Token URL-safe impredecible (crypto, >=21 chars) que identifica el link en la URL pública. Es la única "llave" del pagador: no hay sesión.';
COMMENT ON COLUMN payment_links.status IS
  'pending → processing (claim atómico anti doble-cobro mientras se llama a Culqi) → paid | de vuelta a pending si Culqi falla. cancelled = anulado por staff; expired = venció expires_at sin pagar.';
COMMENT ON COLUMN payment_links.amount IS
  'Monto en la moneda de `currency` (soles con 2 decimales). El cargo SIEMPRE usa este valor de BD — jamás un monto enviado por el cliente.';
COMMENT ON COLUMN payment_links.appointment_id IS
  'Opcional. F1 lo guarda para trazabilidad; F2 (señal de reserva) lo usará para atar el cobro a la cita.';
COMMENT ON COLUMN payment_links.culqi_charge_id IS
  'ID del cargo en Culqi (chr_...) cuando status=paid.';
COMMENT ON COLUMN payment_links.payment_method IS
  'Medio con el que pagó el paciente: yape | tarjeta (detección por prefijo del source_id: ype_ = Yape).';
COMMENT ON COLUMN payment_links.patient_payment_id IS
  'patient_payment creado al confirmarse el pago (solo si patient_id existe). El trigger de Caja lo ata al turno abierto o cae en "fuera de turno".';
COMMENT ON COLUMN payment_links.expires_at IS
  'Vencimiento del link. Un link pending vencido se persiste como expired en el primer acceso público.';

-- Índices: listado por org+estado; el UNIQUE de token ya crea el índice
-- para el lookup de la página pública.
CREATE INDEX IF NOT EXISTS idx_payment_links_org_status
  ON payment_links (organization_id, status);

ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;

-- Miembros de la org leen, crean y actualizan (cancelar) los links de
-- su org. Sin policy DELETE (no se borran: se cancelan). Sin policy
-- para anon: el público NO accede por RLS — solo vía service role.
DROP POLICY IF EXISTS "Org members read payment_links" ON payment_links;
CREATE POLICY "Org members read payment_links"
  ON payment_links FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "Org members create payment_links" ON payment_links;
CREATE POLICY "Org members create payment_links"
  ON payment_links FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "Org members update payment_links" ON payment_links;
CREATE POLICY "Org members update payment_links"
  ON payment_links FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX IF NOT EXISTS idx_payment_links_patient
  ON payment_links (patient_id) WHERE patient_id IS NOT NULL;
