-- =============================================
-- MIGRATION 108: E-Invoice module (SUNAT via provider)
-- =============================================
-- Módulo de facturación electrónica. Tablas e extensiones para soportar:
--   - Configuración por org (credenciales del proveedor encriptadas, datos
--     fiscales de la clínica, preferencias de emisión)
--   - Series autorizadas por SUNAT (F001, B001, etc.) con correlativo local
--   - Comprobantes emitidos (factura / boleta / NC / ND)
--   - Items de cada comprobante
--
-- El provider concreto (Nubefact hoy, Factpro o directo SUNAT en el futuro)
-- es transparente para el schema — guardamos el ID interno del provider
-- en `einvoices.provider_invoice_id` y los enlaces/CDR en campos dedicados.
--
-- Seguridad: los tokens del proveedor se encriptan AES-256-GCM antes de
-- persistir (ver lib/encryption.ts). Una fuga de DB no basta para usarlos.

-- =============================================
-- 1. einvoice_configs — una por organization
-- =============================================

CREATE TABLE IF NOT EXISTS einvoice_configs (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider selection (hoy solo 'nubefact'; diseñado para ser extensible)
  provider                     TEXT NOT NULL DEFAULT 'nubefact' CHECK (provider IN ('nubefact')),
  mode                         TEXT NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'production')),
  is_active                    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Datos fiscales de la clínica (obligatorios para emitir)
  ruc                          TEXT,              -- 11 dígitos
  legal_name                   TEXT,              -- razón social SUNAT
  trade_name                   TEXT,              -- nombre comercial (opcional)
  fiscal_address               TEXT,              -- dirección fiscal completa
  ubigeo                       TEXT,              -- código UBIGEO SUNAT (6 dígitos)

  -- Credenciales del proveedor (encriptadas AES-256-GCM)
  provider_route_encrypted     TEXT,              -- URL base del provider (ruta única del emisor)
  provider_token_encrypted     TEXT,              -- token de autenticación

  -- Preferencias operativas
  default_currency             TEXT NOT NULL DEFAULT 'PEN' CHECK (default_currency IN ('PEN', 'USD')),
  default_igv_percent          NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  auto_emit_on_payment         BOOLEAN NOT NULL DEFAULT FALSE,
  auto_send_email              BOOLEAN NOT NULL DEFAULT TRUE,

  -- Estado del certificado digital (el certificado mismo vive en el provider)
  certificate_expires_at       TIMESTAMPTZ,

  -- Observabilidad
  last_error                   TEXT,
  last_error_at                TIMESTAMPTZ,
  last_success_at              TIMESTAMPTZ,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_by_user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_einvoice_configs_org ON einvoice_configs(organization_id);

ALTER TABLE einvoice_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read einvoice_configs"
  ON einvoice_configs FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org admins write einvoice_configs"
  ON einvoice_configs FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE TRIGGER set_updated_at_einvoice_configs
  BEFORE UPDATE ON einvoice_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 2. einvoice_series — una o varias por org
-- =============================================
-- Series autorizadas por SUNAT para cada tipo de comprobante.
-- Facturas + NC/ND de factura comparten prefijo 'F'; boletas + NC/ND de
-- boleta comparten prefijo 'B'. El correlativo (current_number) se
-- mantiene LOCAL y se usa como "siguiente = current_number + 1" antes de
-- emitir. Si el provider rechaza por duplicado (código 23 en Nubefact),
-- bumpeamos local y retry.

CREATE TABLE IF NOT EXISTS einvoice_series (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- 1=factura, 2=boleta, 3=nota_credito, 4=nota_debito (matchea Nubefact)
  doc_type          SMALLINT NOT NULL CHECK (doc_type BETWEEN 1 AND 4),
  series            TEXT NOT NULL CHECK (char_length(series) = 4),
  current_number    BIGINT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, doc_type, series)
);

CREATE INDEX IF NOT EXISTS idx_einvoice_series_org_type
  ON einvoice_series(organization_id, doc_type) WHERE is_active = TRUE;

-- Only one default per (org, doc_type). Partial unique index enforces it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_einvoice_series_one_default
  ON einvoice_series(organization_id, doc_type)
  WHERE is_default = TRUE;

ALTER TABLE einvoice_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read einvoice_series"
  ON einvoice_series FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org admins write einvoice_series"
  ON einvoice_series FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE TRIGGER set_updated_at_einvoice_series
  BEFORE UPDATE ON einvoice_series
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 3. einvoices — un registro por comprobante emitido
-- =============================================

CREATE TABLE IF NOT EXISTS einvoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Relaciones opcionales (el comprobante puede nacer de distintos puntos)
  appointment_id        UUID REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id            UUID REFERENCES patients(id) ON DELETE SET NULL,
  treatment_plan_id     UUID,  -- FK suave, sin cascada (existe en mig 099)

  -- Identificación SUNAT
  doc_type              SMALLINT NOT NULL CHECK (doc_type BETWEEN 1 AND 4),
  series                TEXT NOT NULL CHECK (char_length(series) = 4),
  number                BIGINT NOT NULL,

  -- Cliente (snapshot al momento de emitir — inmutable post-emisión)
  customer_doc_type     TEXT NOT NULL,     -- '6'=RUC, '1'=DNI, '4'=CE, '7'=Pasaporte, '-'=Varios, etc.
  customer_doc_number   TEXT NOT NULL,
  customer_name         TEXT NOT NULL,
  customer_address      TEXT,              -- obligatorio en factura, opcional boleta
  customer_email        TEXT,

  -- Totales (snapshot)
  currency              TEXT NOT NULL DEFAULT 'PEN',
  exchange_rate         NUMERIC(8,4),
  igv_percent           NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  subtotal_taxed        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- total_gravada
  subtotal_exempt       NUMERIC(12,2) NOT NULL DEFAULT 0,   -- total_exonerada
  subtotal_unaffected   NUMERIC(12,2) NOT NULL DEFAULT 0,   -- total_inafecta
  subtotal_free         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- total_gratuita
  igv_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL,

  -- Referencia a documento que modifica (NC / ND)
  referenced_doc_type   SMALLINT,
  referenced_series     TEXT,
  referenced_number     BIGINT,
  note_type             TEXT,   -- tipo_de_nota_de_credito / _debito code

  -- Estado interno
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',        -- aún no enviado al provider
    'sending',      -- en camino
    'accepted',     -- aceptado por SUNAT
    'rejected',     -- SUNAT rechazó
    'cancelling',   -- comunicación de baja en curso
    'cancelled',    -- SUNAT aceptó anulación
    'error'         -- error técnico (reintento posible)
  )),

  -- Respuesta del provider
  provider              TEXT NOT NULL DEFAULT 'nubefact',
  provider_invoice_id   TEXT,               -- UUID/ID interno en el provider
  provider_link         TEXT,               -- URL pública del comprobante
  pdf_url               TEXT,
  xml_url               TEXT,
  cdr_url               TEXT,
  sunat_accepted        BOOLEAN,
  sunat_response_code   TEXT,
  sunat_description     TEXT,
  qr_code_data          TEXT,               -- cadena SUNAT para QR
  hash_code             TEXT,

  -- Ticket asíncrono (para anulaciones que SUNAT procesa en background)
  cancellation_ticket   TEXT,
  cancellation_reason   TEXT,
  cancelled_at          TIMESTAMPTZ,

  -- Errores y retries
  last_error            TEXT,
  last_error_code       TEXT,
  last_error_at         TIMESTAMPTZ,
  retry_count           INTEGER NOT NULL DEFAULT 0,

  -- Respuesta cruda del provider (auditoría)
  provider_raw_response JSONB,

  issued_at             TIMESTAMPTZ,
  issued_by_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un comprobante (doc_type + series + number) es único por org
  UNIQUE (organization_id, doc_type, series, number)
);

CREATE INDEX IF NOT EXISTS idx_einvoices_org_issued
  ON einvoices(organization_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_einvoices_appointment
  ON einvoices(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_einvoices_patient
  ON einvoices(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_einvoices_pending_cancellation
  ON einvoices(organization_id)
  WHERE status = 'cancelling';
CREATE INDEX IF NOT EXISTS idx_einvoices_status
  ON einvoices(organization_id, status);

ALTER TABLE einvoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read einvoices"
  ON einvoices FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Write: cualquier miembro activo puede emitir (recepcionistas emiten
-- en la operación normal). La lógica fina de permisos (qué role puede
-- anular, etc.) vive en la capa de app.
CREATE POLICY "Org members write einvoices"
  ON einvoices FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org members update einvoices"
  ON einvoices FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE TRIGGER set_updated_at_einvoices
  BEFORE UPDATE ON einvoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 4. einvoice_line_items — items de cada comprobante
-- =============================================

CREATE TABLE IF NOT EXISTS einvoice_line_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  einvoice_id           UUID NOT NULL REFERENCES einvoices(id) ON DELETE CASCADE,
  service_id            UUID REFERENCES services(id) ON DELETE SET NULL,

  position              INTEGER NOT NULL DEFAULT 1,  -- orden de aparición
  description           TEXT NOT NULL,
  quantity              NUMERIC(12,4) NOT NULL,       -- hasta 4 decimales por SUNAT
  unit_of_measure       TEXT NOT NULL DEFAULT 'ZZ',   -- NIU=productos, ZZ=servicios

  -- Precio
  unit_value            NUMERIC(12,4) NOT NULL,       -- valor_unitario (sin IGV)
  unit_price            NUMERIC(12,4) NOT NULL,       -- precio_unitario (con IGV)
  discount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal              NUMERIC(12,2) NOT NULL,       -- cantidad * valor_unitario
  igv_affectation       SMALLINT NOT NULL,            -- tipo_de_igv: 1=gravado, 8=exonerado, 9=inafecto, etc.
  igv_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL,

  -- Metadata SUNAT
  sunat_product_code    TEXT,              -- codigo_producto_sunat (catálogo SUNAT)
  internal_code         TEXT               -- "codigo" en el payload — código interno del servicio
);

CREATE INDEX IF NOT EXISTS idx_einvoice_items_invoice
  ON einvoice_line_items(einvoice_id);

ALTER TABLE einvoice_line_items ENABLE ROW LEVEL SECURITY;

-- Items heredan el acceso de su invoice. No hay policies independientes
-- de "roles"; la org-membership viene dada por la invoice asociada.
CREATE POLICY "Line items follow invoice access"
  ON einvoice_line_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM einvoices e
    WHERE e.id = einvoice_line_items.einvoice_id
      AND e.organization_id IN (SELECT get_user_org_ids())
  ));

CREATE POLICY "Line items write follows invoice access"
  ON einvoice_line_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM einvoices e
    WHERE e.id = einvoice_line_items.einvoice_id
      AND e.organization_id IN (SELECT get_user_org_ids())
  ));

-- =============================================
-- 5. Extensiones a tablas existentes
-- =============================================

-- services: metadata fiscal
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS sunat_product_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT DEFAULT 'ZZ',
  ADD COLUMN IF NOT EXISTS igv_affectation SMALLINT DEFAULT 1;  -- 1=gravado default

COMMENT ON COLUMN services.igv_affectation IS
  'Código SUNAT de afectación IGV: 1=Gravado (default), 8=Exonerado, 9=Inafecto, 12=Inafecto por muestras médicas. Ver manual Nubefact.';

-- patients: datos fiscales separados del contacto
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS fiscal_doc_type TEXT,   -- '1'=DNI, '6'=RUC, '4'=CE, '7'=Pasaporte, '-'=Varios
  ADD COLUMN IF NOT EXISTS fiscal_doc_number TEXT,
  ADD COLUMN IF NOT EXISTS legal_name TEXT,        -- razón social si es empresa
  ADD COLUMN IF NOT EXISTS fiscal_address TEXT,    -- dirección fiscal (puede diferir de contacto)
  ADD COLUMN IF NOT EXISTS ubigeo TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_email TEXT;      -- email fiscal (puede diferir del contacto)

-- appointments + patient_payments: link al comprobante
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS einvoice_id UUID REFERENCES einvoices(id) ON DELETE SET NULL;

ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS einvoice_id UUID REFERENCES einvoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_einvoice
  ON appointments(einvoice_id) WHERE einvoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_payments_einvoice
  ON patient_payments(einvoice_id) WHERE einvoice_id IS NOT NULL;
