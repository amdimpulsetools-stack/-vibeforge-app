-- ============================================================
-- Módulo Almacén — Fase 1: fundación (spec 12-ago-2026)
--
-- Nace del Excel real de la clínica piloto de fertilidad. Los dos
-- defectos que enfermaron ese Excel NO EXISTEN en este esquema:
--   · No hay columna `stock` editable → el stock se DERIVA:
--     SUM(inventory_movements.quantity). (6 celdas sobrescritas a
--     mano y un stock −2 en el Excel.)
--   · No hay columna `cost` mutable en el producto → el costo se
--     CONGELA en cada movimiento y jamás se recalcula hacia atrás.
--     (El Excel revalorizaba 7 meses de stock al sobrescribir el
--     costo con la última compra.)
--
-- Addon `almacen` con is_active=false (beta oculta, patrón mig 207):
-- ninguna clínica lo ve; solo las orgs del founder tienen grant.
-- Migración 100% aditiva: cero ALTER sobre tablas existentes, cero
-- cambios de RPC. Decisión comercial: addon S/39 en Independiente,
-- incluido en Centro Médico (básico) y Clínica (completo).
-- ============================================================

-- ── 1. Catálogo ─────────────────────────────────────────────────
-- Vocabulario clínico deliberado: presentation = cómo COMPRA
-- (LAPICERO, AMPOLLA, CAJA, VIAL...), base_unit = la unidad MÍNIMA
-- en la que se controla y consume (UND, U, ML, TABLETA). Todo
-- movimiento se graba en base_unit — es el único invariante.
CREATE TABLE IF NOT EXISTS inventory_products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name                    text NOT NULL CHECK (btrim(name) <> ''),
  sku                     text,
  category                text,

  presentation            text NOT NULL DEFAULT 'UND',
  base_unit               text NOT NULL DEFAULT 'UND',
  -- Formaliza el "SE VENDE POR UNIDADES" del Excel: 1 CAJA = 30 UND
  -- → 30. 1 VIAL de botox = 100 U → 100. Sin fraccionar = 1.
  units_per_presentation  numeric(12,3) NOT NULL DEFAULT 1
                          CHECK (units_per_presentation > 0),

  -- Precio VIGENTE. El historial lo escribe un trigger (§2); el
  -- precio realmente cobrado va congelado en cada movimiento.
  sale_price              numeric(10,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),

  -- Umbral de alerta en base_unit. 0 = sin alerta.
  min_stock               numeric(12,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),

  -- Nivel Clínica: lotes/vencimiento activos para ESTE producto.
  track_lots              boolean NOT NULL DEFAULT false,

  -- Baja lógica SIEMPRE. En el Excel desaparecieron 21 productos sin
  -- rastro (incluidas gonadotropinas de alto valor).
  is_discontinued         boolean NOT NULL DEFAULT false,
  discontinued_at         timestamptz,
  discontinued_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  discontinued_reason     text,

  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT inv_prod_discontinued_chk CHECK (
    is_discontinued = false
    OR (discontinued_at IS NOT NULL AND btrim(coalesce(discontinued_reason,'')) <> '')
  )
);

-- Un nombre activo por org: el importador del Excel (F3) depende de
-- esto para no duplicar "SAIZEN" / "saizen " / "Saizen".
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_org_name
  ON inventory_products(organization_id, upper(btrim(name)))
  WHERE is_discontinued = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_org_sku
  ON inventory_products(organization_id, upper(btrim(sku)))
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_products_org_active
  ON inventory_products(organization_id) WHERE is_discontinued = false;

DROP TRIGGER IF EXISTS trg_inventory_products_updated_at ON inventory_products;
CREATE TRIGGER trg_inventory_products_updated_at
  BEFORE UPDATE ON inventory_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. Historial de precios (CHORIOMON 90→250 sin registro) ─────
CREATE TABLE IF NOT EXISTS inventory_price_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  old_price       numeric(10,2),
  new_price       numeric(10,2) NOT NULL,
  effective_from  date NOT NULL DEFAULT CURRENT_DATE,
  reason          text,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_price_history_product
  ON inventory_price_history(product_id, effective_from DESC);

-- Escrito por TRIGGER, no por disciplina de la app. SECURITY DEFINER
-- porque la tabla no tiene policy de INSERT (nadie escribe historial
-- a mano); search_path fijado (regla mig 193).
CREATE OR REPLACE FUNCTION inventory_log_price_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO inventory_price_history
    (organization_id, product_id, old_price, new_price, changed_by)
  VALUES
    (NEW.organization_id, NEW.id, OLD.sale_price, NEW.sale_price, auth.uid());
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION inventory_log_price_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_price_change ON inventory_products;
CREATE TRIGGER trg_inventory_price_change
  AFTER UPDATE OF sale_price ON inventory_products
  FOR EACH ROW
  WHEN (OLD.sale_price IS DISTINCT FROM NEW.sale_price)
  EXECUTE FUNCTION inventory_log_price_change();

-- ── 3. Lotes ────────────────────────────────────────────────────
-- Existen desde el día 1 (el importador aterriza aquí la fecha única
-- del Excel como lote SIN-LOTE); la UI los muestra en plan Clínica.
-- Sin columna de cantidad: el saldo del lote es SUM(movements) — el
-- mismo invariante que todo lo demás.
CREATE TABLE IF NOT EXISTS inventory_lots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,

  lot_code        text NOT NULL DEFAULT 'SIN-LOTE',
  -- Fecha desconocida = NULL. Jamás "0.0" como en el Excel.
  expiry_date     date CHECK (expiry_date IS NULL OR expiry_date > DATE '2000-01-01'),
  unit_cost       numeric(12,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  supplier        text,   -- texto a propósito: proveedores-entidad es ERP
  received_at     date NOT NULL DEFAULT CURRENT_DATE,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  UNIQUE (product_id, lot_code)
);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_org_expiry
  ON inventory_lots(organization_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

-- ── 4. Movimientos — el corazón, append-only ────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id            uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  lot_id                uuid REFERENCES inventory_lots(id) ON DELETE RESTRICT,

  movement_type         text NOT NULL
                        CHECK (movement_type IN ('entrada','salida','ajuste','merma')),

  -- CANTIDAD CON SIGNO en base_unit: entrada > 0; salida/merma < 0;
  -- ajuste cualquiera ≠ 0. Stock = SUM(quantity), un solo SUM sin
  -- CASE — un bug de signo no puede corromper el saldo.
  quantity              numeric(12,3) NOT NULL CHECK (quantity <> 0),

  -- Informativo ("entraron 2 CAJAS"). No participa en ningún cálculo:
  -- units_per_presentation puede cambiar y esto preserva el hecho.
  presentation_quantity numeric(12,3),

  -- COSTO CONGELADO por base_unit (entrada: compra; salida/merma:
  -- COGS estampado al momento). PRECIO CONGELADO solo en salidas.
  unit_cost             numeric(12,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  unit_sale_price       numeric(10,2) CHECK (unit_sale_price IS NULL OR unit_sale_price >= 0),

  cost_total            numeric(14,2) GENERATED ALWAYS AS (round(abs(quantity) * unit_cost, 2)) STORED,
  revenue_total         numeric(14,2) GENERATED ALWAYS AS (round(abs(quantity) * unit_sale_price, 2)) STORED,

  -- Fecha del KARDEX (retroactiva permitida) ≠ created_at (digitación).
  movement_date         date NOT NULL DEFAULT CURRENT_DATE,

  reason_code           text CHECK (reason_code IN (
                          'saldo_inicial','compra','venta','uso_en_cita','uso_interno',
                          'conteo_fisico','rotura','vencido','robo_perdida',
                          'error_registro','devolucion_paciente','devolucion_proveedor',
                          'donacion','muestra_medica','otro')),
  notes                 text,

  -- Trazabilidad clínica (se puebla desde F2; nullable siempre).
  patient_id            uuid REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id        uuid REFERENCES appointments(id) ON DELETE SET NULL,

  -- Corrección = CONTRA-MOVIMIENTO, jamás UPDATE/DELETE. Ambas filas
  -- quedan en el kardex y netean a cero.
  reverses_movement_id  uuid UNIQUE REFERENCES inventory_movements(id) ON DELETE RESTRICT,

  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT inv_mov_sign_chk CHECK (
      (movement_type = 'entrada'           AND quantity > 0)
   OR (movement_type IN ('salida','merma') AND quantity < 0)
   OR (movement_type = 'ajuste'            AND quantity <> 0)
  ),
  -- La respuesta a las 1,392 unidades (S/177,377) que entraron al
  -- Excel sin registro: no existe entrada sin costo.
  CONSTRAINT inv_mov_entrada_cost_chk CHECK (movement_type <> 'entrada' OR unit_cost IS NOT NULL),
  CONSTRAINT inv_mov_reason_chk       CHECK (movement_type NOT IN ('ajuste','merma') OR reason_code IS NOT NULL),
  CONSTRAINT inv_mov_price_chk        CHECK (unit_sale_price IS NULL OR movement_type = 'salida'),
  CONSTRAINT inv_mov_self_rev_chk     CHECK (reverses_movement_id IS NULL OR reverses_movement_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_product_date
  ON inventory_movements(organization_id, product_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_date
  ON inventory_movements(organization_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_salidas
  ON inventory_movements(organization_id, product_id, movement_date DESC)
  WHERE movement_type = 'salida';
CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot
  ON inventory_movements(lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_patient
  ON inventory_movements(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_appointment
  ON inventory_movements(appointment_id) WHERE appointment_id IS NOT NULL;

-- Append-only en la BASE, no solo en RLS: service_role bypassa RLS
-- (el importador de F3 correrá con service_role) pero NO bypassa un
-- trigger. Corrige con contra-movimiento o ajuste con motivo.
CREATE OR REPLACE FUNCTION inventory_movements_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION
    'inventory_movements es append-only. Corrige con un contra-movimiento (reverses_movement_id) o un ajuste con motivo; nunca con UPDATE/DELETE.';
END $$;

REVOKE ALL ON FUNCTION inventory_movements_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_movements_append_only ON inventory_movements;
CREATE TRIGGER trg_inventory_movements_append_only
  BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_append_only();

-- ── 5. Ajustes por organización ─────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_settings (
  organization_id     uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  expiry_alert_days   int  NOT NULL DEFAULT 90  CHECK (expiry_alert_days BETWEEN 1 AND 365),
  low_rotation_days   int  NOT NULL DEFAULT 90  CHECK (low_rotation_days BETWEEN 7 AND 365),
  costing_method      text NOT NULL DEFAULT 'promedio'
                      CHECK (costing_method IN ('promedio','lote')),
  warn_on_negative    boolean NOT NULL DEFAULT true,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 6. RLS ──────────────────────────────────────────────────────
-- Lectura: todos los miembros. Catálogo/precios: solo owner-admin
-- (decisión de negocio). Movimientos y lotes: cualquier miembro
-- INSERTA (recepción vende, el médico consume) — sin policy de
-- UPDATE/DELETE a propósito, como wa_* en mig 206.
ALTER TABLE inventory_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_settings      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read inventory_products"
  ON inventory_products FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org admins write inventory_products"
  ON inventory_products FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Org members read inventory_price_history"
  ON inventory_price_history FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));
-- (sin policies de escritura: solo el trigger escribe)

CREATE POLICY "Org members read inventory_lots"
  ON inventory_lots FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org members insert inventory_lots"
  ON inventory_lots FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
    AND created_by = auth.uid()
  );

CREATE POLICY "Org admins update inventory_lots"
  ON inventory_lots FOR UPDATE
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "Org members read inventory_movements"
  ON inventory_movements FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org members insert inventory_movements"
  ON inventory_movements FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
    AND created_by = auth.uid()
  );

CREATE POLICY "Org members read inventory_settings"
  ON inventory_settings FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org admins write inventory_settings"
  ON inventory_settings FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ── 7. Addon oculto + grants beta (patrón mig 207) ─────────────
INSERT INTO addons (key, name, description, category, icon, is_premium, min_plan, sort_order, is_active)
VALUES (
  'almacen',
  'Almacén',
  'Control de stock de medicamentos e insumos: movimientos, vencimientos, alertas y rentabilidad real.',
  'workflow',
  'warehouse',
  true,
  'starter', -- disponible desde Independiente (como addon de pago S/39)
  21,
  false -- oculto mientras se desarrolla; se enciende con la facturación de módulos
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO organization_addons (organization_id, addon_key, enabled)
SELECT o.id, 'almacen', true
FROM organizations o
JOIN user_profiles up ON up.id = o.owner_id
WHERE (up.email = 'oscarfiverr@gmail.com' AND o.name = 'Clínica de Oscar Duran')
   OR (up.email = 'amdimpulsetools@gmail.com' AND o.name = 'Centro Médico Amdimpulsetools')
ON CONFLICT (organization_id, addon_key) DO UPDATE SET enabled = true;

-- ── Comentarios ─────────────────────────────────────────────────
COMMENT ON TABLE inventory_products IS
  'Almacén F1: catálogo con vocabulario clínico. SIN columnas stock/cost editables a propósito: el stock se deriva de movements y el costo se congela por movimiento.';
COMMENT ON TABLE inventory_movements IS
  'Almacén F1: kardex append-only (trigger prohíbe UPDATE/DELETE incluso a service_role). Corrección = contra-movimiento. Stock = SUM(quantity).';
COMMENT ON TABLE inventory_lots IS
  'Almacén F1: lotes con vencimiento POR LOTE (defecto principal del Excel). Saldo del lote = SUM(movements por lot_id). UI en plan Clínica.';
COMMENT ON TABLE inventory_price_history IS
  'Almacén F1: historial de precios escrito por trigger — quién, cuándo y por qué cambió el precio.';
COMMENT ON TABLE inventory_settings IS
  'Almacén F1: umbrales por org (fertilidad alerta a 90 días, dental a 30).';
