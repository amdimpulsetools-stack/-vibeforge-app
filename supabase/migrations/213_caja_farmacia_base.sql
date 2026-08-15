-- =============================================================
-- 213 — Base aditiva para Caja y Farmacia (F1 del plan 15-ago)
-- =============================================================
-- Regla de esta migración: TODO es aditivo y nullable (o con default
-- que replica el comportamiento actual). Con las columnas en NULL el
-- sistema se comporta idéntico. Cero backfill. Los 4 formularios de
-- cobro existentes no se tocan.
--
-- Las FKs a cash_shifts / pharmacy_sales NO se crean aquí: esas tablas
-- llegan en las migraciones de sus módulos (F3/F4). Aquí solo se
-- reservan las columnas para que el resto del código pueda desplegarse
-- y "reposar" sin cambio de comportamiento.

-- ─────────────────────────────────────────────
-- 1. patient_payments — origen, turno, autor, tipo de medio
-- ─────────────────────────────────────────────

ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'clinical',
  ADD COLUMN IF NOT EXISTS cash_shift_id uuid,
  ADD COLUMN IF NOT EXISTS sale_id       uuid,
  ADD COLUMN IF NOT EXISTS created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tender_kind   text;

DO $$ BEGIN
  ALTER TABLE patient_payments
    ADD CONSTRAINT patient_payments_source_chk CHECK (source IN ('clinical','pos'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE patient_payments
    ADD CONSTRAINT patient_payments_tender_chk
    CHECK (tender_kind IS NULL OR tender_kind IN ('efectivo','electronico','otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- source='clinical' por default ⇒ el significado de SUM(amount) para la
-- deuda del paciente (get_patient_summary, mig 202) no cambia hoy. Cuando
-- exista el POS (F4), sus ventas entrarán con source='pos' y los RPC de
-- deuda filtrarán source='clinical' en esa misma fase.

CREATE INDEX IF NOT EXISTS idx_patient_payments_org_created
  ON patient_payments (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_payments_shift
  ON patient_payments (cash_shift_id) WHERE cash_shift_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 2. Clasificador de medio de pago (paridad con lib/einvoice/payment-mapper.ts)
-- ─────────────────────────────────────────────
-- Orden calcado del mapper TS: wallets/tarjetas ANTES que efectivo, para
-- que etiquetas mixtas ("Tarjeta / efectivo") clasifiquen como electrónico.
-- Si cambias los regex aquí, revisa también payment-mapper.ts (y viceversa).

CREATE OR REPLACE FUNCTION caja_classify_tender(p_method text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN btrim(coalesce(p_method,'')) = '' THEN 'otro'
    WHEN translate(lower(p_method),'áéíóúñ','aeioun') ~
         '(yape|plin|tunki|bim|lukita|agora|transfer|deposito|abono|tarjeta|visa|master|amex|credito|debito|card|pos|izipay|niubiz|culqi|mercado ?pago|cheque|link)'
      THEN 'electronico'
    WHEN translate(lower(p_method),'áéíóúñ','aeioun') ~
         '(efectivo|cash|contado|billete|moneda)'
      THEN 'efectivo'
    ELSE 'otro'
  END
$$;

REVOKE ALL ON FUNCTION caja_classify_tender(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_classify_tender(text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- 3. Sello de autor y medio en cada pago nuevo
-- ─────────────────────────────────────────────
-- Solo estampa datos que hoy se pierden (quién digitó, tipo de medio).
-- NO ata a turnos (eso llega con cash_settings/cash_shifts en F3) y NO
-- puede rechazar un pago: siempre RETURN NEW.

CREATE OR REPLACE FUNCTION caja_stamp_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();  -- NULL con service_role: correcto
  END IF;
  IF NEW.tender_kind IS NULL THEN
    NEW.tender_kind := caja_classify_tender(NEW.payment_method);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_patient_payments_stamp ON patient_payments;
CREATE TRIGGER trg_patient_payments_stamp
  BEFORE INSERT ON patient_payments
  FOR EACH ROW EXECUTE FUNCTION caja_stamp_payment();

-- ─────────────────────────────────────────────
-- 4. inventory_movements — idempotencia para el POS
-- ─────────────────────────────────────────────
-- Un doble clic / reintento de red del POS no podrá descontar stock dos
-- veces: la línea de venta solo puede generar UN movimiento. Misma técnica
-- que payment_history_mp_payment_id_unique (mig 151).

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS sale_line_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_sale_line_uniq
  ON inventory_movements (sale_line_id) WHERE sale_line_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 5. einvoice_line_items — líneas de producto en comprobantes
-- ─────────────────────────────────────────────
-- Exclusión mutua, NO "exactamente uno": el emit-dialog crea líneas
-- manuales con service_id NULL y deben seguir siendo válidas.

ALTER TABLE einvoice_line_items
  ADD COLUMN IF NOT EXISTS product_id   uuid REFERENCES inventory_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_item_id uuid;

DO $$ BEGIN
  ALTER TABLE einvoice_line_items
    ADD CONSTRAINT einvoice_line_kind_chk CHECK (product_id IS NULL OR service_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_einvoice_items_product
  ON einvoice_line_items (product_id) WHERE product_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 6. inventory_products — metadatos fiscales para vender
-- ─────────────────────────────────────────────
-- igv_affectation es del PRODUCTO, no de la cajera (catálogo 07 estilo
-- NubeFact: 1 gravado, 8 exonerado, 9 inafecto, 12/16/17/20 especiales).
-- is_sellable=false: insumos que jamás se venden al mostrador.

ALTER TABLE inventory_products
  ADD COLUMN IF NOT EXISTS sunat_product_code text,
  ADD COLUMN IF NOT EXISTS unit_of_measure    text NOT NULL DEFAULT 'NIU',
  ADD COLUMN IF NOT EXISTS igv_affectation    smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_sellable        boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE inventory_products
    ADD CONSTRAINT inventory_products_igv_chk
    CHECK (igv_affectation IN (1,8,9,12,16,17,20));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
