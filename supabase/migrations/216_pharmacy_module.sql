-- ============================================================
-- Migración 216 — Módulo Farmacia (POS): venta, líneas y correlativo
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
--
-- ALCANCE F4: FARMACIA SIN EMISIÓN ELECTRÓNICA. La venta existe,
-- descuenta stock, cobra y emite un ticket INTERNO. `einvoice_id` nace
-- NULL y se queda NULL en toda esta fase: la columna y su UNIQUE están
-- aquí para que F5 (emisión) sea aditiva, no porque algo las use hoy.
--
-- Tres invariantes gobiernan el módulo:
--
--   1. EL BORRADOR ES LA CLAVE DE IDEMPOTENCIA. Agregar el primer
--      producto crea una venta en 'borrador'; su UUID viaja a la RPC de
--      confirmación. Un doble clic, un reintento de red o dos pestañas
--      no pueden cobrar dos veces ni descontar stock dos veces: la
--      segunda llamada encuentra la venta ya 'confirmada' y devuelve el
--      MISMO resultado (mig 217).
--
--   2. LA ARITMÉTICA NO SE ESCRIBE, SE DERIVA. line_gross, line_total,
--      line_subtotal y line_igv son columnas GENERATED: el navegador no
--      puede escribirlas ni siquiera si quisiera, y un borrador jamás
--      queda con importes inconsistentes. Es la misma decisión que
--      cost_total/revenue_total en la 209 y difference_cash en la 214.
--      La fórmula es la MISMA de lib/einvoice/mapper.ts computeLineTax
--      (gross → total → subtotal por división → IGV por DIFERENCIA),
--      portada aquí sin duplicar criterio.
--
--   3. CERRAR UNA VENTA NO ES ESCRIBIR UNA FILA. Confirmar y anular
--      pasan por RPC (mig 217). No existe ni una policy que permita
--      mutar una venta que ya no es borrador, y un trigger lo sostiene
--      incluso frente a service_role (que bypassa RLS pero no triggers).
--
-- La venta A PÚBLICO GENERAL es de primera clase: patient_id es
-- OPCIONAL. En un mostrador de farmacia la mayoría de las ventas no
-- tienen ficha de paciente, y obligar a crear una sería obligar a
-- ensuciar el padrón clínico con compradores de paracetamol.
-- ============================================================

-- ── 1. Cabecera de venta ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pharmacy_sales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Se asigna AL CONFIRMAR, no al crear el borrador: un carrito
  -- abandonado no puede quemar un número de la serie (el hueco en el
  -- correlativo es justo lo que hace impresentable un talonario).
  sale_number          bigint,

  status               text NOT NULL DEFAULT 'borrador'
                       CHECK (status IN ('borrador','confirmada','anulada')),

  -- Opcional a propósito (venta a público general). customer_label
  -- guarda lo que la cajera escribió cuando no hay ficha.
  patient_id           uuid REFERENCES patients(id) ON DELETE SET NULL,
  customer_label       text,
  appointment_id       uuid REFERENCES appointments(id) ON DELETE SET NULL,

  currency             text NOT NULL DEFAULT 'PEN' CHECK (currency = 'PEN'),

  -- La aritmética POR LÍNEA es GENERATED con 18% (ver §2). Mientras esa
  -- sea la tasa, este CHECK impide que alguien escriba aquí un 10 y
  -- crea que las líneas lo respetaron. Si el IGV del Perú cambia, este
  -- CHECK y las expresiones GENERATED se mueven juntos, en una misma
  -- migración: es imposible que uno cambie sin el otro.
  igv_percent          numeric(5,2) NOT NULL DEFAULT 18.00
                       CHECK (igv_percent = 18.00),

  -- TOTALES CONGELADOS. Los escribe únicamente pharmacy_confirm_sale
  -- agregando las líneas; en borrador son 0 y no significan nada.
  gross_amount         numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount      numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_taxed       numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_exempt      numeric(12,2) NOT NULL DEFAULT 0,
  subtotal_unaffected  numeric(12,2) NOT NULL DEFAULT 0,
  igv_amount           numeric(12,2) NOT NULL DEFAULT 0,
  total                numeric(12,2) NOT NULL DEFAULT 0,

  -- SIEMPRE nullable. En F4 nace NULL y muere NULL.
  einvoice_id          uuid REFERENCES einvoices(id) ON DELETE SET NULL,

  -- 'interno' = se entregó nota de venta (F4). 'electronico' lo escribirá
  -- F5. 'pendiente' = todavía no se decidió (borrador).
  billing_mode         text NOT NULL DEFAULT 'pendiente'
                       CHECK (billing_mode IN ('pendiente','electronico','interno')),
  billing_status       text NOT NULL DEFAULT 'no_aplica'
                       CHECK (billing_status IN ('no_aplica','pendiente','emitido','fallido','anulado')),
  -- Nº de la boleta FÍSICA emitida fuera del sistema, cuando la clínica
  -- todavía usa talonario. Texto libre: es un dato ajeno, no una serie.
  external_receipt     text,

  -- Copia de conveniencia para listar/filtrar sin join. El vínculo
  -- AUTORITATIVO es patient_payments.cash_shift_id, que lo estampa el
  -- trigger de Caja. SET NULL y no RESTRICT justamente porque es espejo:
  -- perderlo no pierde el rastro del dinero.
  cash_shift_id        uuid REFERENCES cash_shifts(id) ON DELETE SET NULL,
  payment_id           uuid REFERENCES patient_payments(id) ON DELETE SET NULL,

  confirmed_at         timestamptz,
  confirmed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at            timestamptz,
  voided_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason          text,

  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- Una venta confirmada tiene número y sello, o no está confirmada.
  CONSTRAINT ph_sale_confirmada_chk CHECK (
    status <> 'confirmada'
    OR (confirmed_at IS NOT NULL AND sale_number IS NOT NULL)
  ),
  -- Toda anulación lleva firma. Misma regla que la diferencia de caja
  -- (cash_shift_diff_reason_chk, mig 214): no hay reverso sin motivo.
  CONSTRAINT ph_sale_anulada_chk CHECK (
    status <> 'anulada'
    OR (voided_at IS NOT NULL AND btrim(coalesce(void_reason,'')) <> '')
  ),
  -- Un borrador no ha cobrado ni ha emitido nada. Sin esto, un carrito
  -- abandonado podría quedar apuntando a un pago real.
  CONSTRAINT ph_sale_borrador_chk CHECK (
    status <> 'borrador'
    OR (einvoice_id IS NULL AND payment_id IS NULL)
  ),
  -- LA identidad del comprobante: lo que se cobra es exactamente la
  -- suma de las bases más el impuesto. Si esto no cuadra, la venta no
  -- entra en la base — venga la escritura de donde venga.
  CONSTRAINT ph_sale_totals_chk CHECK (
    total = subtotal_taxed + subtotal_exempt + subtotal_unaffected + igv_amount
  ),
  -- Permite la FK compuesta de las líneas (§2): garantiza que un ítem
  -- no pueda declarar una organización distinta a la de su venta.
  CONSTRAINT pharmacy_sales_id_org_uniq UNIQUE (id, organization_id)
);

-- Correlativo único POR ORGANIZACIÓN, solo sobre ventas numeradas.
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_sales_org_number_uniq
  ON pharmacy_sales (organization_id, sale_number)
  WHERE sale_number IS NOT NULL;

-- Un comprobante electrónico ampara UNA venta (dormido en F4).
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_sales_einvoice_uniq
  ON pharmacy_sales (einvoice_id)
  WHERE einvoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_org_confirmed
  ON pharmacy_sales (organization_id, confirmed_at DESC)
  WHERE status = 'confirmada';
CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_patient
  ON pharmacy_sales (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_shift
  ON pharmacy_sales (cash_shift_id) WHERE cash_shift_id IS NOT NULL;
-- El POS abre su carrito buscando el borrador del cajero.
CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_org_draft
  ON pharmacy_sales (organization_id, created_by) WHERE status = 'borrador';

DROP TRIGGER IF EXISTS trg_pharmacy_sales_updated_at ON pharmacy_sales;
CREATE TRIGGER trg_pharmacy_sales_updated_at
  BEFORE UPDATE ON pharmacy_sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. Líneas de venta ──────────────────────────────────────────
--
-- LA ARITMÉTICA VIVE AQUÍ Y ES GENERATED. Portada 1:1 de computeLineTax
-- (lib/einvoice/mapper.ts), que es la única matemática fiscal del
-- producto:
--
--   line_gross    = round(quantity * unit_price, 2)
--   line_total    = line_gross − line_discount
--   line_subtotal = gravado ? round(line_total / 1.18, 2) : line_total
--   line_igv      = line_total − line_subtotal        ← por DIFERENCIA
--
-- El orden importa: se redondea sobre el IMPORTE DE LÍNEA, nunca sobre
-- el valor unitario (redondear la unidad y multiplicar repite el error
-- una vez por unidad). Y el IGV sale por resta, jamás redondeado por su
-- cuenta, para que subtotal + igv = total al céntimo SIEMPRE.
--
-- Que sean GENERATED y no columnas que escribe la RPC es deliberado:
-- el navegador no puede mentir en los importes ni por accidente ni a
-- propósito, y un borrador a medio editar nunca queda descuadrado.
-- Las expresiones no se referencian entre sí porque Postgres no lo
-- permite; de ahí que estén desplegadas.
CREATE TABLE IF NOT EXISTS pharmacy_sale_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid NOT NULL,
  -- Denormalizado para que la RLS de la línea no dependa de un join.
  organization_id uuid NOT NULL,

  position        int NOT NULL DEFAULT 1,

  -- Exactamente uno: o es producto de almacén, o es un servicio.
  product_id      uuid REFERENCES inventory_products(id) ON DELETE RESTRICT,
  service_id      uuid REFERENCES services(id) ON DELETE RESTRICT,
  lot_id          uuid REFERENCES inventory_lots(id) ON DELETE RESTRICT,

  -- SNAPSHOT del nombre: renombrar el producto mañana no reescribe el
  -- ticket que el cliente se llevó hoy.
  description     text NOT NULL CHECK (btrim(description) <> ''),

  -- 3 decimales = la misma precisión del kardex (mig 209).
  quantity        numeric(12,3) NOT NULL CHECK (quantity > 0),
  -- SNAPSHOT del precio, CON IGV incluido (convención del catálogo).
  unit_price      numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  line_discount   numeric(12,2) NOT NULL DEFAULT 0 CHECK (line_discount >= 0),

  -- Del PRODUCTO, no de la cajera (mig 213). Mismo catálogo 07.
  igv_affectation smallint NOT NULL DEFAULT 1
                  CHECK (igv_affectation IN (1,8,9,12,16,17,20)),

  line_gross    numeric(12,2) GENERATED ALWAYS AS (
                  round(quantity * unit_price, 2)
                ) STORED,
  line_total    numeric(12,2) GENERATED ALWAYS AS (
                  round(quantity * unit_price, 2) - line_discount
                ) STORED,
  line_subtotal numeric(12,2) GENERATED ALWAYS AS (
                  CASE WHEN igv_affectation = 1
                    THEN round((round(quantity * unit_price, 2) - line_discount) / 1.18, 2)
                    ELSE round(quantity * unit_price, 2) - line_discount
                  END
                ) STORED,
  line_igv      numeric(12,2) GENERATED ALWAYS AS (
                  CASE WHEN igv_affectation = 1
                    THEN (round(quantity * unit_price, 2) - line_discount)
                         - round((round(quantity * unit_price, 2) - line_discount) / 1.18, 2)
                    ELSE 0
                  END
                ) STORED,

  -- CPP congelado por la RPC al confirmar (el margen de la venta de hoy
  -- no cambia porque mañana compres más caro). 4 decimales = kardex.
  unit_cost       numeric(12,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  -- El movimiento de kardex que descontó esta línea. RESTRICT: el
  -- movimiento no se borra mientras la línea lo señale.
  movement_id     uuid REFERENCES inventory_movements(id) ON DELETE RESTRICT,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ph_item_kind_chk CHECK (num_nonnulls(product_id, service_id) = 1),
  -- Un lote sin producto no existe: los servicios no tienen lote.
  CONSTRAINT ph_item_lot_chk CHECK (lot_id IS NULL OR product_id IS NOT NULL),
  -- Un descuento no puede superar lo que se cobra. Es un CHECK real (no
  -- una tautología) porque line_gross es derivado y line_discount es
  -- entrada: aquí es donde se rechaza el descuento imposible.
  CONSTRAINT ph_item_discount_chk CHECK (line_discount <= round(quantity * unit_price, 2)),
  -- Un servicio no descuenta stock, así que no puede tener movimiento.
  CONSTRAINT ph_item_service_mov_chk CHECK (movement_id IS NULL OR product_id IS NOT NULL),

  -- FK COMPUESTA: la línea hereda la organización de su venta y no puede
  -- inventarse otra. Sin esto, la RLS por organization_id de la línea
  -- sería una promesa que nada sostiene.
  CONSTRAINT pharmacy_sale_items_sale_fk
    FOREIGN KEY (sale_id, organization_id)
    REFERENCES pharmacy_sales (id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_sale_items_sale
  ON pharmacy_sale_items (sale_id, position);
CREATE INDEX IF NOT EXISTS idx_pharmacy_sale_items_product
  ON pharmacy_sale_items (product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_sale_items_movement_uniq
  ON pharmacy_sale_items (movement_id) WHERE movement_id IS NOT NULL;

-- ── 3. Una venta cerrada no se toca, venga de donde venga ───────
-- La RLS (§5) ya impide mutar ventas no-borrador desde el cliente. Este
-- trigger sostiene la misma regla frente a service_role, que bypassa
-- RLS pero no bypassa un trigger (patrón mig 209/214). Lo que cambia el
-- estado de una venta cerrada es exclusivamente la RPC de la 217, y lo
-- hace tocando la CABECERA, nunca las líneas.
CREATE OR REPLACE FUNCTION pharmacy_items_draft_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale   uuid;
  v_status text;
BEGIN
  v_sale := CASE WHEN TG_OP = 'DELETE' THEN OLD.sale_id ELSE NEW.sale_id END;

  SELECT status INTO v_status FROM pharmacy_sales WHERE id = v_sale;

  -- La venta ya no existe: estamos dentro de un CASCADE (se borró la
  -- venta, o la organización). Dejar pasar, o el borrado en cascada
  -- moriría contra su propio guardián.
  IF v_status IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_status <> 'borrador' THEN
    RAISE EXCEPTION
      'Esta venta ya fue cerrada: sus líneas no se pueden modificar. Anúlala con pharmacy_void_sale y registra una venta nueva.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

REVOKE ALL ON FUNCTION pharmacy_items_draft_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pharmacy_items_draft_only ON pharmacy_sale_items;
CREATE TRIGGER trg_pharmacy_items_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON pharmacy_sale_items
  FOR EACH ROW EXECUTE FUNCTION pharmacy_items_draft_only();

-- ── 4. Correlativo por organización ─────────────────────────────
-- Reserva atómica con un solo statement dentro de la RPC (patrón mig
-- 110): INSERT ... ON CONFLICT DO UPDATE ... RETURNING crea la fila la
-- primera vez e incrementa las siguientes, tomando el lock de fila que
-- serializa dos confirmaciones simultáneas. Un SELECT-y-luego-UPDATE
-- deja pasar dos ventas con el mismo número.
CREATE TABLE IF NOT EXISTS pharmacy_sale_counters (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  current_number  bigint NOT NULL DEFAULT 0 CHECK (current_number >= 0)
);

-- ── 5. RLS ──────────────────────────────────────────────────────
-- Patrón mig 209 + GATE DE ADDON: leer el POS exige ser miembro de la
-- org Y que la org tenga 'almacen' habilitado. Sin el gate, una org que
-- nunca compró el módulo vería ventas si alguna fila se colara.
--
-- Escritura directa SOLO sobre borradores. Confirmar y anular pasan por
-- RPC: no existe policy que permita mutar una venta cerrada, que es lo
-- que hace imposible "arreglar" una venta de ayer editando su total.
ALTER TABLE pharmacy_sales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_sale_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_sale_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read pharmacy_sales"
  ON pharmacy_sales FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND EXISTS (
      SELECT 1 FROM organization_addons oa
       WHERE oa.organization_id = pharmacy_sales.organization_id
         AND oa.addon_key = 'almacen'
         AND oa.enabled = true
    )
  );

CREATE POLICY "Org members create pharmacy_sales drafts"
  ON pharmacy_sales FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
    AND EXISTS (
      SELECT 1 FROM organization_addons oa
       WHERE oa.organization_id = pharmacy_sales.organization_id
         AND oa.addon_key = 'almacen'
         AND oa.enabled = true
    )
    AND created_by = auth.uid()
    AND status = 'borrador'
  );

-- USING y WITH CHECK exigen 'borrador' los dos: el primero impide tomar
-- una venta cerrada, el segundo impide que un UPDATE se auto-ascienda a
-- 'confirmada' sin pasar por la RPC.
CREATE POLICY "Org members update pharmacy_sales drafts"
  ON pharmacy_sales FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND status = 'borrador'
  )
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
    AND status = 'borrador'
  );

CREATE POLICY "Org members delete pharmacy_sales drafts"
  ON pharmacy_sales FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND status = 'borrador'
  );

CREATE POLICY "Org members read pharmacy_sale_items"
  ON pharmacy_sale_items FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND EXISTS (
      SELECT 1 FROM organization_addons oa
       WHERE oa.organization_id = pharmacy_sale_items.organization_id
         AND oa.addon_key = 'almacen'
         AND oa.enabled = true
    )
  );

CREATE POLICY "Org members write pharmacy_sale_items of drafts"
  ON pharmacy_sale_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pharmacy_sales s
       WHERE s.id = pharmacy_sale_items.sale_id
         AND s.organization_id = pharmacy_sale_items.organization_id
         AND s.organization_id IN (SELECT get_user_org_ids())
         AND s.status = 'borrador'
    )
  );

CREATE POLICY "Org members update pharmacy_sale_items of drafts"
  ON pharmacy_sale_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_sales s
       WHERE s.id = pharmacy_sale_items.sale_id
         AND s.organization_id IN (SELECT get_user_org_ids())
         AND s.status = 'borrador'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pharmacy_sales s
       WHERE s.id = pharmacy_sale_items.sale_id
         AND s.organization_id = pharmacy_sale_items.organization_id
         AND s.organization_id IN (SELECT get_user_org_ids())
         AND s.status = 'borrador'
    )
  );

CREATE POLICY "Org members delete pharmacy_sale_items of drafts"
  ON pharmacy_sale_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pharmacy_sales s
       WHERE s.id = pharmacy_sale_items.sale_id
         AND s.organization_id IN (SELECT get_user_org_ids())
         AND s.status = 'borrador'
    )
  );

-- El correlativo se lee (para mostrar "siguiente NV") pero NO se
-- escribe desde el cliente: lo reserva la RPC. Sin policy de escritura.
CREATE POLICY "Org members read pharmacy_sale_counters"
  ON pharmacy_sale_counters FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

-- ── 6. get_patient_summary: la deuda clínica no se contamina ────
--
-- Reescritura de la mig 202 con UN SOLO cambio: total_paid suma
-- únicamente los pagos con source='clinical'.
--
-- POR QUÉ AHORA Y POR QUÉ NO CAMBIA NADA HOY: la mig 213 creó
-- patient_payments.source con DEFAULT 'clinical', así que a día de hoy
-- TODAS las filas son 'clinical' y este filtro es un no-op exacto — el
-- badge de deuda del PatientDrawer devuelve los mismos números.
--
-- El día que el POS venda (F4), sus cobros entran con source='pos'. Sin
-- este filtro, un paciente que compra paracetamol en el mostrador
-- vería su deuda clínica bajar S/ 8: el dinero de la farmacia estaría
-- pagando consultas que nadie pagó. La deuda clínica se calcula contra
-- lo facturado en citas, y solo los cobros clínicos la cancelan.
--
-- Todo lo demás (total_billed, conteos, primera/última visita) queda
-- literalmente igual que en la 202, incluido SECURITY INVOKER.
CREATE OR REPLACE FUNCTION get_patient_summary(p_patient_id UUID)
RETURNS TABLE (
  total_billed NUMERIC,
  total_paid NUMERIC,
  appointments_count INTEGER,
  completed_count INTEGER,
  first_appointment_date DATE,
  last_appointment_date DATE,
  payments_count INTEGER
)
LANGUAGE sql SECURITY INVOKER STABLE
SET search_path = public, pg_temp
AS $$
  WITH appt AS (
    SELECT
      COALESCE(SUM(COALESCE(s.base_price, 0)) FILTER (WHERE a.status <> 'cancelled'), 0) AS total_billed,
      COUNT(*)::int AS appointments_count,
      COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed_count,
      MIN(a.appointment_date) AS first_appointment_date,
      MAX(a.appointment_date) AS last_appointment_date
    FROM appointments a
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.patient_id = p_patient_id
  ),
  pay AS (
    SELECT
      -- El único cambio respecto de la mig 202.
      COALESCE(SUM(pp.amount) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical'), 0) AS total_paid,
      COUNT(*) FILTER (WHERE COALESCE(pp.source, 'clinical') = 'clinical')::int AS payments_count
    FROM patient_payments pp
    WHERE pp.patient_id = p_patient_id
  )
  SELECT
    appt.total_billed,
    pay.total_paid,
    appt.appointments_count,
    appt.completed_count,
    appt.first_appointment_date,
    appt.last_appointment_date,
    pay.payments_count
  FROM appt, pay
$$;

REVOKE ALL ON FUNCTION get_patient_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_patient_summary(UUID) TO authenticated;

-- ── Comentarios ─────────────────────────────────────────────────
COMMENT ON TABLE pharmacy_sales IS
  'Farmacia F4: cabecera del POS. sale_number se asigna AL CONFIRMAR (un carrito abandonado no quema correlativo). Totales congelados por pharmacy_confirm_sale. einvoice_id nace y muere NULL en F4.';
COMMENT ON TABLE pharmacy_sale_items IS
  'Farmacia F4: líneas con precio y nombre CONGELADOS. line_gross/total/subtotal/igv son GENERATED con la aritmética de computeLineTax (IGV por diferencia): el navegador no puede escribir importes.';
COMMENT ON TABLE pharmacy_sale_counters IS
  'Farmacia F4: correlativo de nota de venta por organización. Se reserva con INSERT..ON CONFLICT DO UPDATE..RETURNING dentro de la RPC (patrón mig 110), nunca con SELECT+UPDATE.';
COMMENT ON COLUMN pharmacy_sales.cash_shift_id IS
  'Mig 216: copia de conveniencia. El vínculo autoritativo con el turno es patient_payments.cash_shift_id, que estampa el trigger caja_stamp_payment (mig 214).';
COMMENT ON COLUMN pharmacy_sales.einvoice_id IS
  'Mig 216: reservado para F5 (emisión electrónica). En F4 SIEMPRE NULL — la farmacia entrega nota de venta interna, que no es comprobante SUNAT.';
