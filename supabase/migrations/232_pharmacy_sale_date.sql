-- ============================================================
-- Migración 232 — Farmacia (POS): fecha del hecho (sale_date)
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
--
-- EL PROBLEMA. `pharmacy_sales` no tenía fecha de venta: solo el sello
-- inmutable `confirmed_at` (timestamptz). El tab "Ventas del día"
-- filtraba por ese sello y no existía historial ni forma de registrar
-- una venta de ayer que se quedó en el cuaderno. Peor: la RPC de
-- confirmación usaba `current_date` (UTC), así que toda venta cobrada
-- entre las 19:00 y las 23:59 de Lima caía en el kardex y en los pagos
-- con fecha DEL DÍA SIGUIENTE.
--
-- LA SOLUCIÓN: una columna `sale_date` que responde "¿de qué día es
-- esta venta?" en el huso del negocio. La tabla de criterios de fecha
-- del módulo queda así:
--
--   confirmed_at   → CUÁNDO se registró en el sistema. Auditoría
--                    inmutable, `now()` siempre. NO se toca.
--   sale_date      → CUÁNDO ocurrió el hecho, fecha civil de Lima.
--                    Editable SOLO en borrador (retroactiva hasta 90
--                    días, tope que aplica la RPC).
--   movement_date  → kardex: alineado a sale_date (la salida de stock
--                    pertenece al día del hecho).
--   payment_date   → caja/reportes: alineado a sale_date. El TURNO de
--                    caja (cash_shift_id) sigue siendo el abierto al
--                    momento de cobrar — el dinero entra hoy aunque la
--                    venta sea de ayer.
--
-- El CHECK de tabla solo acota el FUTURO (hoy Lima + 1, margen por
-- desfases de reloj): un tope hacia atrás como CHECK bloquearía
-- cualquier backfill futuro. El tope de 90 días hacia atrás vive en
-- `pharmacy_confirm_sale`, que es el único camino por el que una fecha
-- ajena a "hoy" puede entrar a una venta confirmada.
--
-- De pasada se corrige `pharmacy_void_sale`: seguía decidiendo si
-- registrar la devolución en caja mirando SOLO la fila de
-- `cash_settings`, cuando la mig 226 estableció el interruptor dual
-- (addon 'caja' habilitado Y fila de config). Con el addon apagado, la
-- anulación ya no exige caja abierta ni escribe cash_movements.
-- ============================================================

-- ── 1. Columna, backfill y CHECK ────────────────────────────────

ALTER TABLE pharmacy_sales
  ADD COLUMN sale_date date NOT NULL
  DEFAULT ((now() AT TIME ZONE 'America/Lima')::date);

-- Backfill: la fecha del hecho de una venta ya cerrada es la fecha
-- LIMA de su confirmación (los borradores vivos se quedan con el
-- default de hoy: la RPC la reescribirá al confirmar).
UPDATE pharmacy_sales
   SET sale_date = (confirmed_at AT TIME ZONE 'America/Lima')::date
 WHERE confirmed_at IS NOT NULL;

-- NOT VALID + VALIDATE: el CHECK nace después del backfill y se valida
-- sobre lo ya escrito, sin bloquear la tabla con un rewrite.
ALTER TABLE pharmacy_sales
  ADD CONSTRAINT ph_sale_date_not_future_chk
  CHECK (sale_date <= (now() AT TIME ZONE 'America/Lima')::date + 1)
  NOT VALID;

ALTER TABLE pharmacy_sales
  VALIDATE CONSTRAINT ph_sale_date_not_future_chk;

COMMENT ON COLUMN pharmacy_sales.sale_date IS
  'Fecha del HECHO en huso America/Lima (mig 232). confirmed_at es el sello inmutable de registro; esta es la fecha civil de la venta, retroactiva hasta 90 días vía pharmacy_confirm_sale.';

-- ── 2. Índice del historial ─────────────────────────────────────
-- El índice parcial de la 216 (WHERE status='confirmada') no cubre la
-- query del tab, que también lista anuladas. Este sí.
CREATE INDEX IF NOT EXISTS idx_pharmacy_sales_org_saledate
  ON pharmacy_sales (organization_id, sale_date DESC, sale_number DESC)
  WHERE status IN ('confirmada','anulada');

-- ── 3. pharmacy_confirm_sale: v_date sale de sale_date ──────────
-- Copia VERBATIM de la mig 217 con TRES cambios (buscar "mig 232"):
--   a) validación de rango de p_movement_date (hoy-90 .. hoy+1, Lima);
--   b) v_date := COALESCE(p_movement_date, s.sale_date, hoy Lima) —
--      adiós al current_date UTC que corría las ventas nocturnas;
--   c) el UPDATE de cierre congela sale_date = v_date.
CREATE OR REPLACE FUNCTION pharmacy_confirm_sale(
  p_sale_id        uuid,
  p_payment_method text,
  p_movement_date  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  s           pharmacy_sales%ROWTYPE;
  v_role      text;
  v_number    bigint;
  v_date      date;
  -- mig 232: "hoy" es el de Lima, no el del servidor (UTC).
  v_today     date := (now() AT TIME ZONE 'America/Lima')::date;
  v_label     text;
  it          record;
  v_cost      numeric(12,4);
  v_stock     numeric(12,3);
  v_lot_stock numeric(12,3);
  v_mov       uuid;
  v_mov_ids   uuid[] := '{}';
  v_warnings  text[] := '{}';
  v_gross     numeric(12,2);
  v_disc      numeric(12,2);
  v_taxed     numeric(12,2);
  v_exempt    numeric(12,2);
  v_unaff     numeric(12,2);
  v_igv       numeric(12,2);
  v_total     numeric(12,2);
  v_items     integer;
  v_payment   uuid;
  v_shift     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El lock ANTES de mirar el estado: sin él, dos confirmaciones
  -- simultáneas leerían 'borrador' las dos y cobrarían dos veces.
  SELECT * INTO s FROM pharmacy_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  -- IDEMPOTENCIA. Dentro del lock: si la otra llamada ganó, aquí ya dice
  -- 'confirmada' y devolvemos su resultado en vez de cobrar otra vez.
  IF s.status <> 'borrador' THEN
    RETURN jsonb_build_object(
      'sale_id',       s.id,
      'status',        s.status,
      'already',       true,
      'sale_number',   s.sale_number,
      'total',         s.total,
      'payment_id',    s.payment_id,
      'cash_shift_id', s.cash_shift_id,
      'movement_ids',  COALESCE(
                         (SELECT jsonb_agg(i.movement_id ORDER BY i.position)
                            FROM pharmacy_sale_items i
                           WHERE i.sale_id = s.id AND i.movement_id IS NOT NULL),
                         '[]'::jsonb),
      'warnings',      '[]'::jsonb
    );
  END IF;

  -- ── Autorización ──────────────────────────────────────────────
  SELECT role INTO v_role
    FROM organization_members
   WHERE organization_id = s.organization_id AND user_id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No perteneces a esta organización.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Mismo criterio que caja_open_shift (mig 215): el médico no cobra.
  -- 'assistant' y 'member' entran como recepción heredada — antes de la
  -- mig 020 no existía el rol 'receptionist' y esas filas siguen vivas.
  IF v_role NOT IN ('owner','admin','receptionist','assistant','member') THEN
    RAISE EXCEPTION 'Tu rol no puede cobrar en farmacia. Pídeselo a recepción o a un administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_addons oa
     WHERE oa.organization_id = s.organization_id
       AND oa.addon_key = 'almacen'
       AND oa.enabled = true
  ) THEN
    RAISE EXCEPTION 'El módulo Almacén no está activo en esta organización.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*) INTO v_items FROM pharmacy_sale_items WHERE sale_id = s.id;
  IF v_items = 0 THEN
    RAISE EXCEPTION 'No se puede cobrar una venta sin productos.' USING ERRCODE = 'check_violation';
  END IF;

  IF btrim(coalesce(p_payment_method, '')) = '' THEN
    RAISE EXCEPTION 'Elige un método de pago para cobrar.' USING ERRCODE = 'check_violation';
  END IF;

  -- mig 232: tope de retroactividad. El CHECK de tabla solo acota el
  -- futuro (para no bloquear backfills); el pasado se acota AQUÍ, que
  -- es el único camino por el que entra una fecha ajena a hoy.
  IF p_movement_date IS NOT NULL
     AND (p_movement_date < v_today - 90 OR p_movement_date > v_today + 1) THEN
    RAISE EXCEPTION 'La fecha de venta puede retroceder como máximo 90 días y no puede ser futura.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- mig 232: fecha del HECHO en Lima. Cae al sale_date del borrador
  -- (que nace con el default de hoy Lima), jamás al current_date UTC
  -- que corría al día siguiente las ventas de 19:00-23:59.
  v_date := COALESCE(p_movement_date, s.sale_date, v_today);

  -- ── Lock por producto ─────────────────────────────────────────
  -- Dos cajeras no venden la última unidad en paralelo. ORDER BY sobre
  -- el hash: dos ventas con los mismos productos en distinto orden
  -- tomarían los locks cruzados y se abrazarían en un deadlock.
  -- El bucle explícito no es adorno: en un `PERFORM ... FROM (subconsulta
  -- ORDER BY)` el planificador no garantiza conservar ese orden, y un
  -- orden distinto entre dos transacciones es exactamente el abrazo
  -- mortal que se quiere evitar.
  FOR it IN
    SELECT DISTINCT product_id
      FROM pharmacy_sale_items
     WHERE sale_id = s.id AND product_id IS NOT NULL
     ORDER BY product_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(it.product_id::text));
  END LOOP;

  -- ── Totales: se AGREGAN, no se reciben ────────────────────────
  -- Los importes de línea son GENERATED (mig 216) a partir de cantidad,
  -- precio, descuento y afectación: aquí no hay nada que creerle al
  -- navegador, solo que sumar. 1 gravado; 8 exonerado; el resto (9, 12,
  -- 16, 17, 20) inafecto — así el total siempre reconcilia con
  -- ph_sale_totals_chk.
  SELECT COALESCE(sum(line_gross), 0),
         COALESCE(sum(line_discount), 0),
         COALESCE(sum(line_subtotal) FILTER (WHERE igv_affectation = 1), 0),
         COALESCE(sum(line_subtotal) FILTER (WHERE igv_affectation = 8), 0),
         COALESCE(sum(line_subtotal) FILTER (WHERE igv_affectation NOT IN (1,8)), 0),
         COALESCE(sum(line_igv), 0),
         COALESCE(sum(line_total), 0)
    INTO v_gross, v_disc, v_taxed, v_exempt, v_unaff, v_igv, v_total
    FROM pharmacy_sale_items
   WHERE sale_id = s.id;

  -- ── Correlativo ───────────────────────────────────────────────
  -- Un solo statement (patrón mig 110): crea la fila la primera vez e
  -- incrementa las siguientes, con el lock de fila que serializa dos
  -- confirmaciones simultáneas. Se reserva ANTES de los movimientos
  -- porque el número viaja en las notas del kardex.
  INSERT INTO pharmacy_sale_counters (organization_id, current_number)
  VALUES (s.organization_id, 1)
  ON CONFLICT (organization_id) DO UPDATE
    SET current_number = pharmacy_sale_counters.current_number + 1
  RETURNING current_number INTO v_number;

  v_label := 'NV-' || lpad(v_number::text, 6, '0');

  -- ── Kardex: una salida por línea de PRODUCTO ──────────────────
  FOR it IN
    SELECT * FROM pharmacy_sale_items
     WHERE sale_id = s.id AND product_id IS NOT NULL
     ORDER BY position, created_at
  LOOP
    -- CPP vigente, congelado en la línea y en el movimiento.
    v_cost := pharmacy_avg_cost(it.product_id);

    -- Stock = SUM(quantity), el invariante de la 209.
    SELECT COALESCE(sum(quantity), 0) INTO v_stock
      FROM inventory_movements WHERE product_id = it.product_id;

    -- El stock insuficiente NO bloquea la venta: el producto ya está en
    -- la mano del cliente y negarse a cobrarlo no lo devuelve al
    -- estante. Se cobra, se descuenta y queda el aviso — que es
    -- exactamente lo que hace visible un descuadre real de inventario.
    IF v_stock < it.quantity THEN
      v_warnings := v_warnings || format(
        '%s: stock insuficiente (hay %s, se vendieron %s).',
        it.description,
        trim(to_char(v_stock, 'FM999999990.999')),
        trim(to_char(it.quantity, 'FM999999990.999'))
      );
    END IF;

    IF it.lot_id IS NOT NULL THEN
      SELECT COALESCE(sum(quantity), 0) INTO v_lot_stock
        FROM inventory_movements WHERE lot_id = it.lot_id;
      IF v_lot_stock < it.quantity THEN
        v_warnings := v_warnings || format(
          '%s: el lote elegido solo tenía %s.',
          it.description,
          trim(to_char(v_lot_stock, 'FM999999990.999'))
        );
      END IF;
    END IF;

    INSERT INTO inventory_movements (
      organization_id, product_id, lot_id,
      movement_type, quantity,
      unit_cost, unit_sale_price,
      movement_date, reason_code, notes,
      patient_id, appointment_id,
      sale_line_id, created_by
    ) VALUES (
      s.organization_id, it.product_id, it.lot_id,
      'salida', -it.quantity,
      v_cost,
      -- Precio realmente cobrado por unidad, ya con el descuento de
      -- línea dentro. La columna es numeric(10,2) (mig 209).
      CASE WHEN it.quantity > 0 THEN round(it.line_total / it.quantity, 2) ELSE 0 END,
      v_date, 'venta', 'Venta ' || v_label,
      s.patient_id, s.appointment_id,
      it.id,          -- ← UNIQUE parcial (mig 213): idempotencia de base
      v_uid
    )
    RETURNING id INTO v_mov;

    v_mov_ids := v_mov_ids || v_mov;

    UPDATE pharmacy_sale_items
       SET unit_cost = v_cost, movement_id = v_mov
     WHERE id = it.id;
  END LOOP;

  -- ── Cobro ─────────────────────────────────────────────────────
  -- El turno lo ata SOLO el trigger caja_stamp_payment (mig 214): el POS
  -- no pasa cash_shift_id. Un cuarto formulario que "recuerde" atar el
  -- turno sería un cuarto sitio donde olvidarlo.
  --
  -- patient_id puede ser NULL: venta a público general.
  INSERT INTO patient_payments (
    organization_id, patient_id, appointment_id,
    amount, payment_method, payment_date,
    notes, source, sale_id, created_by
  ) VALUES (
    s.organization_id, s.patient_id, s.appointment_id,
    v_total, p_payment_method, v_date,
    'Farmacia ' || v_label, 'pos', s.id, v_uid
  )
  RETURNING id, cash_shift_id INTO v_payment, v_shift;

  -- ── Cierre de la venta ────────────────────────────────────────
  UPDATE pharmacy_sales
     SET status              = 'confirmada',
         sale_number         = v_number,
         -- mig 232: la fecha del hecho queda congelada junto al resto.
         sale_date           = v_date,
         confirmed_at        = now(),
         confirmed_by        = v_uid,
         gross_amount        = v_gross,
         discount_amount     = v_disc,
         subtotal_taxed      = v_taxed,
         subtotal_exempt     = v_exempt,
         subtotal_unaffected = v_unaff,
         igv_amount          = v_igv,
         total               = v_total,
         payment_id          = v_payment,
         cash_shift_id       = v_shift,
         -- F4: nota de venta interna. NADA de emisión electrónica.
         billing_mode        = 'interno',
         billing_status      = 'no_aplica'
   WHERE id = s.id;

  RETURN jsonb_build_object(
    'sale_id',       s.id,
    'status',        'confirmada',
    'already',       false,
    'sale_number',   v_number,
    'sale_label',    v_label,
    'total',         v_total,
    'payment_id',    v_payment,
    'cash_shift_id', v_shift,
    'movement_ids',  to_jsonb(v_mov_ids),
    'warnings',      to_jsonb(v_warnings)
  );
END $$;

REVOKE ALL ON FUNCTION pharmacy_confirm_sale(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pharmacy_confirm_sale(uuid, text, date) TO authenticated;

-- ── 4. pharmacy_void_sale: interruptor dual de Caja (mig 226) ───
-- Copia VERBATIM de la mig 217 con UN cambio (buscar "mig 232"): la
-- decisión de registrar la devolución en caja usa el criterio de la
-- mig 226 — addon 'caja' habilitado en organization_addons Y fila en
-- cash_settings — en vez de mirar solo la fila. Con el addon apagado,
-- la config queda en pausa y la anulación no exige caja abierta.
CREATE OR REPLACE FUNCTION pharmacy_void_sale(
  p_sale_id uuid,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  s           pharmacy_sales%ROWTYPE;
  v_reason    text;
  v_admin     boolean;
  v_label     text;
  it          record;
  v_mov       uuid;
  v_mov_ids   uuid[] := '{}';
  v_scope     text;
  v_shift     uuid;
  v_tender    text;
  v_pay_pat   uuid;
  v_cash_mov  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Escribe el motivo de la anulación.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO s FROM pharmacy_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Idempotente: anular dos veces devuelve el estado, no un error feo.
  IF s.status = 'anulada' THEN
    RETURN jsonb_build_object(
      'sale_id',     s.id,
      'status',      'anulada',
      'already',     true,
      'sale_number', s.sale_number,
      'total',       s.total,
      'void_reason', s.void_reason
    );
  END IF;

  IF s.status <> 'confirmada' THEN
    RAISE EXCEPTION 'Solo se puede anular una venta confirmada. Un borrador se elimina sin más.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Quien confirmó puede deshacer su propio error DENTRO DEL MISMO DÍA;
  -- pasado ese día ya es un asunto de administración (el dinero entró en
  -- un arqueo y probablemente ya se cerró).
  v_admin := is_org_admin(s.organization_id);
  IF NOT v_admin
     AND NOT (s.confirmed_by = v_uid AND s.confirmed_at::date = current_date) THEN
    RAISE EXCEPTION
      'Solo un administrador puede anular esta venta (o quien la cobró, el mismo día).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_label := 'NV-' || lpad(coalesce(s.sale_number, 0)::text, 6, '0');

  -- ── Dinero: se resuelve el turno ANTES de tocar el stock ───────
  -- Si no hay caja abierta esto revienta aquí y la transacción entera se
  -- deshace, incluidos los contra-movimientos que todavía no escribimos.
  IF s.payment_id IS NOT NULL THEN
    SELECT pp.tender_kind, pp.patient_id INTO v_tender, v_pay_pat
      FROM patient_payments pp WHERE pp.id = s.payment_id;

    -- mig 232: interruptor DUAL de la mig 226 (caja_stamp_payment) —
    -- la caja actúa solo con addon 'caja' habilitado Y fila de config.
    -- Desactivar el addon pausa el módulo sin perder la configuración.
    IF EXISTS (
      SELECT 1 FROM organization_addons oa
       WHERE oa.organization_id = s.organization_id
         AND oa.addon_key = 'caja'
         AND oa.enabled
    ) THEN
      SELECT shift_scope INTO v_scope
        FROM cash_settings WHERE organization_id = s.organization_id;
    END IF;

    IF v_scope IS NOT NULL THEN
      SELECT sh.id INTO v_shift
        FROM cash_shifts sh
       WHERE sh.organization_id = s.organization_id
         AND sh.status = 'open'
         AND (v_scope = 'organization' OR sh.opened_by = v_uid)
       ORDER BY sh.opened_at DESC
       LIMIT 1;

      IF v_shift IS NULL THEN
        RAISE EXCEPTION 'Abre caja para registrar la devolución.'
          USING ERRCODE = 'check_violation';
      END IF;

      -- amount NEGATIVO: cash_movements lleva signo (mig 214) y el
      -- esperado del arqueo es un solo SUM sin CASE. El tender se hereda
      -- del cobro original: una venta pagada con tarjeta no puede
      -- descuadrar el efectivo del cajón al devolverse.
      INSERT INTO cash_movements (
        organization_id, shift_id, movement_type, amount, tender_kind,
        reason_code, notes, patient_id, payment_id, created_by
      ) VALUES (
        s.organization_id, v_shift, 'devolucion', -s.total,
        COALESCE(v_tender, 'efectivo'),
        'devolucion_paciente',
        'Anulación ' || v_label || ' — ' || v_reason,
        COALESCE(s.patient_id, v_pay_pat), s.payment_id, v_uid
      )
      RETURNING id INTO v_cash_mov;
    END IF;
  END IF;

  -- ── Stock: un contra-movimiento por línea ─────────────────────
  -- Corrección = contra-asiento, jamás UPDATE (el kardex es append-only
  -- por trigger, mig 209). El UNIQUE de reverses_movement_id hace que
  -- una doble anulación falle sola, sin necesidad de comprobarlo.
  FOR it IN
    SELECT i.*, m.unit_cost AS mov_cost, m.lot_id AS mov_lot
      FROM pharmacy_sale_items i
      JOIN inventory_movements m ON m.id = i.movement_id
     WHERE i.sale_id = s.id AND i.movement_id IS NOT NULL
     ORDER BY i.position, i.created_at
  LOOP
    INSERT INTO inventory_movements (
      organization_id, product_id, lot_id,
      movement_type, quantity,
      unit_cost,                       -- heredado: no contamina el CPP
      movement_date, reason_code, notes,
      patient_id, reverses_movement_id, created_by
    ) VALUES (
      s.organization_id, it.product_id, it.mov_lot,
      'ajuste', it.quantity,           -- la salida era negativa: vuelve
      it.mov_cost,
      current_date, 'devolucion_paciente',
      'Anulación ' || v_label || ' — ' || v_reason,
      s.patient_id, it.movement_id, v_uid
    )
    RETURNING id INTO v_mov;

    v_mov_ids := v_mov_ids || v_mov;
  END LOOP;

  UPDATE pharmacy_sales
     SET status         = 'anulada',
         voided_at      = now(),
         voided_by      = v_uid,
         void_reason    = v_reason,
         billing_status = 'anulado'
   WHERE id = s.id;

  RETURN jsonb_build_object(
    'sale_id',          s.id,
    'status',           'anulada',
    'already',          false,
    'sale_number',      s.sale_number,
    'sale_label',       v_label,
    'total',            s.total,
    'void_reason',      v_reason,
    'cash_movement_id', v_cash_mov,
    'cash_shift_id',    v_shift,
    'movement_ids',     to_jsonb(v_mov_ids)
  );
END $$;

REVOKE ALL ON FUNCTION pharmacy_void_sale(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pharmacy_void_sale(uuid, text) TO authenticated;

-- ── 5. pharmacy_day_summary: el cierre del día, agregado en base ─
-- El tab de Ventas mostraba un total sumado en el cliente sobre las
-- filas que le cupieron; el desglose por medio de pago ni existía
-- (vive en patient_payments). Esta RPC agrega POR DÍA sobre sale_date:
-- ventas confirmadas suman importes, las anuladas solo cuentan en
-- voided_count (su plata ya se devolvió o se va a devolver).
--
-- Mismo gate que la RLS de lectura de la 216: miembro de la org Y
-- addon 'almacen' habilitado. Recibe la org EXPLÍCITA (validada contra
-- get_user_org_ids()): un usuario en varias clínicas vería aquí la
-- mezcla de todas mientras la lista de abajo filtra por la activa.
-- SECURITY DEFINER porque cruza a patient_payments; STABLE porque
-- solo lee.
CREATE OR REPLACE FUNCTION pharmacy_day_summary(
  p_organization_id uuid,
  p_from date,
  p_to   date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH ventas AS (
    SELECT s.id, s.sale_date, s.status, s.total, s.igv_amount,
           s.subtotal_taxed + s.subtotal_exempt + s.subtotal_unaffected AS subtotal,
           pp.tender_kind,
           pp.payment_method,
           (SELECT COALESCE(sum(i.quantity), 0)
              FROM pharmacy_sale_items i
             WHERE i.sale_id = s.id) AS items_qty
      FROM pharmacy_sales s
      LEFT JOIN patient_payments pp ON pp.id = s.payment_id
     WHERE s.organization_id = p_organization_id
       AND p_organization_id IN (SELECT get_user_org_ids())
       AND EXISTS (
         SELECT 1 FROM organization_addons oa
          WHERE oa.organization_id = s.organization_id
            AND oa.addon_key = 'almacen'
            AND oa.enabled = true
       )
       AND s.status IN ('confirmada','anulada')
       AND s.sale_date BETWEEN p_from AND p_to
  )
  SELECT COALESCE(jsonb_agg(day_row ORDER BY day DESC), '[]'::jsonb)
  FROM (
    SELECT v.sale_date AS day,
           jsonb_build_object(
             'day',          v.sale_date,
             'sales_count',  count(*) FILTER (WHERE v.status = 'confirmada'),
             'voided_count', count(*) FILTER (WHERE v.status = 'anulada'),
             'items_count',  COALESCE(sum(v.items_qty)  FILTER (WHERE v.status = 'confirmada'), 0),
             'subtotal',     COALESCE(sum(v.subtotal)   FILTER (WHERE v.status = 'confirmada'), 0),
             'igv',          COALESCE(sum(v.igv_amount) FILTER (WHERE v.status = 'confirmada'), 0),
             'total',        COALESCE(sum(v.total)      FILTER (WHERE v.status = 'confirmada'), 0),
             -- El tender clasificado por Caja (mig 213): lo que cuadra
             -- contra el cajón. 'otro' recoge también los pagos sin
             -- clasificar, para que la suma de los tres SIEMPRE dé total.
             'by_tender', jsonb_build_object(
               'efectivo',    COALESCE(sum(v.total) FILTER (WHERE v.status = 'confirmada' AND v.tender_kind = 'efectivo'), 0),
               'electronico', COALESCE(sum(v.total) FILTER (WHERE v.status = 'confirmada' AND v.tender_kind = 'electronico'), 0),
               'otro',        COALESCE(sum(v.total) FILTER (WHERE v.status = 'confirmada'
                                AND (v.tender_kind IS NULL OR v.tender_kind NOT IN ('efectivo','electronico'))), 0)
             ),
             -- El método literal que eligió la cajera (Efectivo, Yape…).
             'by_method', (
               SELECT COALESCE(jsonb_object_agg(m.method, m.amount), '{}'::jsonb)
                 FROM (
                   SELECT COALESCE(v2.payment_method, 'Sin método') AS method,
                          sum(v2.total) AS amount
                     FROM ventas v2
                    WHERE v2.sale_date = v.sale_date
                      AND v2.status = 'confirmada'
                    GROUP BY 1
                 ) m
             )
           ) AS day_row
      FROM ventas v
     GROUP BY v.sale_date
  ) days
$$;

REVOKE ALL ON FUNCTION pharmacy_day_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pharmacy_day_summary(uuid, date, date) TO authenticated;

-- ── 6. Comentarios ──────────────────────────────────────────────
COMMENT ON FUNCTION pharmacy_confirm_sale(uuid, text, date) IS
  'Farmacia F4 (mig 217, ajustada en 232): único camino que descuenta stock y cobra. v_date = COALESCE(p_movement_date, sale_date, hoy Lima), retroactivo hasta 90 días; alinea movement_date, payment_date y sale_date. NO emite comprobante electrónico.';
COMMENT ON FUNCTION pharmacy_void_sale(uuid, text) IS
  'Farmacia F4 (mig 217, ajustada en 232): anulación atómica. La devolución en caja usa el interruptor dual de la mig 226 (addon ''caja'' habilitado Y fila en cash_settings); sin caja abierta no se revierte nada.';
COMMENT ON FUNCTION pharmacy_day_summary(uuid, date, date) IS
  'Farmacia (mig 232): cierre del día del POS. Agrega por sale_date las ventas confirmadas (importes, ítems, desglose por tender y por método vía patient_payments); las anuladas solo cuentan en voided_count. Gate: miembro de la org + addon ''almacen''.';
