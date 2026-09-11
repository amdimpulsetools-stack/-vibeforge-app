-- ═══════════════════════════════════════════════════════════════════
-- BORRADOR mig 2XX: get_custom_report — "Reporte personalizado" de /reports
--
-- Un solo RPC, una sola pasada por citas y cobros del rango, JSON con las
-- tablas agrupadas de cada sección + total por sección + TOTAL FINAL.
--
-- REGLA DE ORO: cada sección REPRODUCE una cubeta de
-- get_reports_overview(mig 250/251).totals.collected_breakdown — mismas
-- CTEs (copiadas, no reescritas), mismo rango por payment_date, mismo
-- source, mismo precio real de la cita (mig 100/219):
--   SERVICIOS                 = collected_breakdown.period_appointments
--   ABONOS Y SERVICIOS FUTUROS= other_appointments + other + plans
--   FARMACIA                  = collected_breakdown.pharmacy
--   PAGOS POR TRATAMIENTOS    = totals.treatment_payments_amount
--   TOTAL FINAL (4 secciones) = payments_amount + treatment_payments_amount
--
-- Gating (patrón M12, mig 236): org del caller + rol owner/admin.
-- Cambios respecto de la 251 (deliberados, comentados con "custom:"):
--   · organization_id = p_org_id (org explícita, ya gateada) en vez de
--     IN (SELECT get_user_org_ids()): sargable y sin mezclar orgs de un
--     usuario multi-org.
--   · range_payments expone las columnas de agrupación (appointment_id,
--     treatment_plan_id, treatment_concept_id, sale_id, notes). El CASE
--     de la cubeta es VERBATIM.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_custom_report(
  p_org_id   uuid,
  p_from     date   DEFAULT NULL,   -- NULL ⇒ "hoy" civil de la org (mig 240)
  p_to       date   DEFAULT NULL,   -- NULL ⇒ p_from
  p_sections text[] DEFAULT NULL    -- NULL ⇒ todas las disponibles
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role        text;
  v_tz          text;
  v_today       date;
  v_from        date;
  v_to          date;
  v_sections    text[];
  v_has_almacen boolean;
  v_has_fert    boolean;
  result        json;
BEGIN
  -- ── Gating: org del caller + rol permitido (patrón M12, mig 236) ──
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_role := get_user_org_role(p_org_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- ── "Hoy" civil de la org (mig 240 / 245), nunca CURRENT_DATE en UTC ──
  SELECT COALESCE(o.timezone, 'America/Lima') INTO v_tz
    FROM organizations o WHERE o.id = p_org_id;
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_from  := COALESCE(p_from, v_today);
  v_to    := COALESCE(p_to, v_from);
  IF v_to < v_from THEN
    RAISE EXCEPTION 'Rango inválido: la fecha final es anterior a la inicial'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_to - v_from > 366 THEN
    RAISE EXCEPTION 'El rango máximo del reporte es de un año'
      USING ERRCODE = 'check_violation';
  END IF;

  v_sections := COALESCE(p_sections, ARRAY['services','advances','pharmacy','treatments']);
  IF EXISTS (
    SELECT 1 FROM unnest(v_sections) s
    WHERE s NOT IN ('services','advances','pharmacy','treatments')
  ) THEN
    RAISE EXCEPTION 'Sección desconocida' USING ERRCODE = 'check_violation';
  END IF;

  -- Módulos activos (mismo criterio que la RLS de pharmacy_sales, mig 216,
  -- y que treatment_start_from_budget, mig 245).
  SELECT EXISTS (
    SELECT 1 FROM organization_addons oa
    WHERE oa.organization_id = p_org_id AND oa.addon_key = 'almacen' AND oa.enabled = true
  ) INTO v_has_almacen;
  SELECT EXISTS (
    SELECT 1 FROM organization_addons oa
    WHERE oa.organization_id = p_org_id
      AND oa.addon_key IN ('fertility_basic','fertility_premium') AND oa.enabled = true
  ) INTO v_has_fert;

  WITH range_appointments AS (
    -- VERBATIM mig 251 (custom: organization_id = p_org_id).
    SELECT
      a.id                                   AS appointment_id,
      a.appointment_date,
      a.start_time,
      a.status,
      COALESCE(d.full_name, 'Sin doctor')    AS doctor_name,
      COALESCE(d.color, '#9ca3af')           AS doctor_color,
      COALESCE(s.name, 'Sin servicio')       AS service_name,
      -- Precio REAL de la cita (fórmula canónica mig 100 / 219): precio
      -- acordado con fallback al catálogo, menos descuento, nunca negativo.
      GREATEST(
        0,
        COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0)
      )                                      AS base_price,
      COALESCE(o.name, 'Sin consultorio')    AS office_name,
      -- Mig 251: cobrado sobre ESTA cita dentro del rango (clínico, sin
      -- farmacia ni tratamientos). Mismo criterio que la cubeta
      -- period_appointments de collected_breakdown.
      COALESCE((
        SELECT SUM(pp.amount) FROM patient_payments pp
        WHERE pp.appointment_id = a.id
          AND pp.payment_date >= v_from
          AND pp.payment_date <= v_to
          AND COALESCE(pp.source, 'clinical') = 'clinical'
          AND pp.treatment_id IS NULL
      ), 0)                                  AS collected_in_range
    FROM appointments a
    LEFT JOIN doctors d  ON d.id = a.doctor_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN offices o  ON o.id = a.office_id
    WHERE a.organization_id = p_org_id
      AND a.appointment_date >= v_from
      AND a.appointment_date <= v_to
  ),
  range_payments AS (
    -- Cobros del rango por fecha de pago, ya clasificados en su cubeta.
    -- CASE VERBATIM mig 250/251 (custom: columnas extra para agrupar).
    SELECT
      pp.id,
      pp.amount,
      pp.appointment_id,
      pp.treatment_plan_id,
      pp.treatment_concept_id,
      pp.sale_id,
      pp.notes,
      CASE
        WHEN COALESCE(pp.source, 'clinical') = 'pos'            THEN 'pharmacy'
        WHEN pp.treatment_id IS NOT NULL                        THEN 'treatments'
        WHEN pp.appointment_id IS NOT NULL
             AND pp.appointment_id IN (SELECT appointment_id FROM range_appointments)
                                                                THEN 'period_appointments'
        WHEN pp.appointment_id IS NOT NULL                      THEN 'other_appointments'
        WHEN pp.treatment_plan_id IS NOT NULL                   THEN 'plans'
        ELSE 'other'
      END AS bucket
    FROM patient_payments pp
    WHERE pp.organization_id = p_org_id
      AND pp.payment_date >= v_from
      AND pp.payment_date <= v_to
  ),

  -- ── 1. SERVICIOS = cubeta period_appointments, agrupada por servicio ──
  -- Cantidad = citas del rango con cobro en el rango; Precio = precio real
  -- de esas citas (NULL = "varios" cuando difieren); Total = Σ cobrado.
  -- attended / production_total replican `services[].revenue` de la mig
  -- 198/251 (producción: precio de las citas completadas) por si la UI
  -- quiere una columna secundaria "Atendidas / Producción".
  svc AS (
    SELECT
      ra.service_name                                                     AS description,
      COUNT(*) FILTER (WHERE ra.collected_in_range > 0)                   AS quantity,
      MIN(ra.base_price) FILTER (WHERE ra.collected_in_range > 0)         AS price_min,
      MAX(ra.base_price) FILTER (WHERE ra.collected_in_range > 0)         AS price_max,
      COALESCE(SUM(ra.collected_in_range), 0)                             AS total,
      COUNT(*) FILTER (WHERE ra.status = 'completed')                     AS attended,
      COALESCE(SUM(ra.base_price) FILTER (WHERE ra.status = 'completed'), 0) AS production_total,
      MIN(ra.appointment_date)                                            AS first_date
    FROM range_appointments ra
    GROUP BY ra.service_name
    HAVING COALESCE(SUM(ra.collected_in_range), 0) > 0
        OR COUNT(*) FILTER (WHERE ra.status = 'completed') > 0
  ),

  -- ── 2. ABONOS Y SERVICIOS FUTUROS = other_appointments + other + plans ──
  adv_appt AS (
    -- Cobros del rango sobre citas de OTRAS fechas: adelantos (cita
    -- posterior al rango) y pagos atrasados (cita anterior).
    SELECT
      CASE WHEN a.appointment_date > v_to THEN 'appointment_future'
           ELSE 'appointment_past' END                                    AS kind,
      COALESCE(s.name, 'Sin servicio')                                    AS description,
      COUNT(DISTINCT rp.appointment_id)                                   AS quantity,
      MIN(GREATEST(0, COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0))) AS price_min,
      MAX(GREATEST(0, COALESCE(a.price_snapshot, s.base_price, 0) - COALESCE(a.discount_amount, 0))) AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    JOIN appointments a ON a.id = rp.appointment_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE rp.bucket = 'other_appointments'
    GROUP BY 1, 2
  ),
  adv_direct AS (
    -- Abonos directos: registrados desde el drawer del paciente (o link de
    -- cobro Culqi) sin cita, plan ni tratamiento. Cantidad = nº de cobros.
    SELECT
      'direct'::text                                                      AS kind,
      'Abono directo (sin cita asociada)'::text                           AS description,
      COUNT(*)                                                            AS quantity,
      MIN(rp.amount)                                                      AS price_min,
      MAX(rp.amount)                                                      AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    WHERE rp.bucket = 'other'
    HAVING COUNT(*) > 0
  ),
  adv_plan AS (
    -- Anticipos a planes de tratamiento (mig 099, core). El founder no
    -- los listó; si se omiten, TOTAL FINAL no cuadra con "Cobrado total".
    SELECT
      'plan'::text                                                        AS kind,
      'Anticipo a plan — ' || COALESCE(tp.title, 'Plan sin título')       AS description,
      COUNT(*)                                                            AS quantity,
      MIN(rp.amount)                                                      AS price_min,
      MAX(rp.amount)                                                      AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    LEFT JOIN treatment_plans tp ON tp.id = rp.treatment_plan_id
    WHERE rp.bucket = 'plans'
    GROUP BY 2
  ),
  adv AS (
    SELECT * FROM adv_appt
    UNION ALL SELECT * FROM adv_direct
    UNION ALL SELECT * FROM adv_plan
  ),

  -- ── 3. FARMACIA = cubeta pharmacy, detallada por producto ──
  -- Del cobro (source='pos') a su venta por sale_id (PK) y a sus líneas.
  -- Σ line_total de una venta confirmada == pharmacy_sales.total ==
  -- patient_payments.amount (pharmacy_confirm_sale, mig 217/232).
  pos_pay AS (
    SELECT rp.id, rp.amount, rp.sale_id, s.status AS sale_status
    FROM range_payments rp
    LEFT JOIN pharmacy_sales s ON s.id = rp.sale_id AND s.organization_id = p_org_id
    WHERE rp.bucket = 'pharmacy'
  ),
  ph_items AS (
    SELECT
      i.description,
      SUM(i.quantity)                                                     AS quantity,
      MIN(i.unit_price)                                                   AS price_min,
      MAX(i.unit_price)                                                   AS price_max,
      SUM(i.line_total)                                                   AS total,
      false                                                               AS voided
    FROM pos_pay pp
    JOIN pharmacy_sale_items i ON i.sale_id = pp.sale_id
    WHERE pp.sale_status = 'confirmada'
    GROUP BY i.description
  ),
  ph_voided AS (
    -- La venta anulada CONSERVA su cobro (mig 217/232: la devolución vive
    -- en cash_movements si Caja está activa; sin Caja no hay reverso).
    -- Por eso sigue dentro de "Cobrado total" y aquí se muestra aparte.
    SELECT
      'Ventas anuladas (cobro aún registrado; devolución por Caja)'::text AS description,
      COUNT(*)::numeric                                                   AS quantity,
      MIN(pp.amount)                                                      AS price_min,
      MAX(pp.amount)                                                      AS price_max,
      SUM(pp.amount)                                                      AS total,
      true                                                                AS voided
    FROM pos_pay pp
    WHERE pp.sale_status = 'anulada'
    HAVING COUNT(*) > 0
  ),
  ph_orphan AS (
    -- Cobro pos sin venta localizable (no debería existir; cierre contable).
    SELECT
      'Farmacia (sin detalle de venta)'::text                             AS description,
      COUNT(*)::numeric                                                   AS quantity,
      MIN(pp.amount)                                                      AS price_min,
      MAX(pp.amount)                                                      AS price_max,
      SUM(pp.amount)                                                      AS total,
      false                                                               AS voided
    FROM pos_pay pp
    WHERE pp.sale_status IS NULL OR pp.sale_status NOT IN ('confirmada','anulada')
    HAVING COUNT(*) > 0
  ),
  ph_adjust AS (
    -- Cierre contable: si Σ líneas ≠ Σ cobros pos (p.ej. alguien editó
    -- patient_payments.amount de una venta fuera de turno cerrado — la
    -- policy de UPDATE de la mig 008 lo permite), la diferencia aparece
    -- como fila y la sección SIGUE cuadrando con la cubeta pharmacy.
    SELECT
      'Ajuste (cobro registrado ≠ detalle de venta)'::text                AS description,
      NULL::numeric                                                       AS quantity,
      NULL::numeric                                                       AS price_min,
      NULL::numeric                                                       AS price_max,
      (SELECT COALESCE(SUM(amount), 0) FROM pos_pay)
        - (SELECT COALESCE(SUM(total), 0) FROM ph_items)
        - (SELECT COALESCE(SUM(total), 0) FROM ph_voided)
        - (SELECT COALESCE(SUM(total), 0) FROM ph_orphan)                 AS total,
      false                                                               AS voided
  ),
  ph AS (
    SELECT * FROM ph_items
    UNION ALL SELECT * FROM ph_voided
    UNION ALL SELECT * FROM ph_orphan
    UNION ALL SELECT * FROM ph_adjust WHERE total <> 0
  ),

  -- ── 4. PAGOS POR TRATAMIENTOS = treatment_payments_amount, por concepto ──
  tr AS (
    SELECT
      COALESCE(c.label, 'Sin concepto')                                   AS description,
      COUNT(*)                                                            AS quantity,
      MIN(rp.amount)                                                      AS price_min,
      MAX(rp.amount)                                                      AS price_max,
      SUM(rp.amount)                                                      AS total
    FROM range_payments rp
    LEFT JOIN treatment_payment_concepts c ON c.id = rp.treatment_concept_id
    WHERE rp.bucket = 'treatments'
    GROUP BY 1
  ),

  -- ── Cubetas de referencia (VERBATIM mig 250/251) para reconciliar ──
  buckets AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE bucket <> 'treatments'), 0)         AS payments_amount,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'treatments'), 0)          AS treatment_payments_amount,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'period_appointments'), 0) AS period_appointments,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'other_appointments'), 0)  AS other_appointments,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'plans'), 0)               AS plans,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'pharmacy'), 0)            AS pharmacy,
      COALESCE(SUM(amount) FILTER (WHERE bucket = 'other'), 0)               AS other
    FROM range_payments
  ),
  totals AS (
    SELECT
      (SELECT COALESCE(SUM(total), 0) FROM svc) AS services_total,
      (SELECT COALESCE(SUM(total), 0) FROM adv) AS advances_total,
      (SELECT COALESCE(SUM(total), 0) FROM ph)  AS pharmacy_total,
      (SELECT COALESCE(SUM(total), 0) FROM tr)  AS treatments_total,
      b.*
    FROM buckets b
  )
  SELECT json_build_object(
    'range', json_build_object('from', v_from, 'to', v_to, 'timezone', v_tz),
    'role', v_role,
    -- Qué secciones existen para ESTA org: módulos activos, o datos
    -- históricos aunque el módulo se haya apagado (mismo criterio que
    -- showTreatments en financial-report.tsx:185).
    'sections_available', json_build_object(
      'services',   true,
      'advances',   true,
      'pharmacy',   v_has_almacen OR t.pharmacy > 0,
      'treatments', v_has_fert OR t.treatments_total > 0
    ),
    'sections', json_build_object(
      'services', CASE WHEN 'services' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total,
                   'attended', attended,
                   'production_total', production_total
                 ) ORDER BY total DESC, first_date ASC, description ASC), '[]'::json) FROM svc),
        'total', t.services_total
      ) END,
      'advances', CASE WHEN 'advances' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'kind', kind,
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total
                 ) ORDER BY kind, total DESC, description ASC), '[]'::json) FROM adv),
        'total', t.advances_total,
        'by_bucket', json_build_object(
          'other_appointments', t.other_appointments, 'other', t.other, 'plans', t.plans)
      ) END,
      'pharmacy', CASE WHEN 'pharmacy' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total,
                   'voided', voided
                 ) ORDER BY voided ASC, total DESC, description ASC), '[]'::json) FROM ph),
        'total', t.pharmacy_total
      ) END,
      'treatments', CASE WHEN 'treatments' = ANY(v_sections) THEN json_build_object(
        'rows', (SELECT COALESCE(json_agg(json_build_object(
                   'description', description,
                   'quantity', quantity,
                   'price', CASE WHEN price_min = price_max THEN price_min END,
                   'price_min', price_min, 'price_max', price_max,
                   'total', total
                 ) ORDER BY total DESC, description ASC), '[]'::json) FROM tr),
        'total', t.treatments_total
      ) END
    ),
    -- TOTAL FINAL = Σ de las secciones marcadas.
    'grand_total',
        CASE WHEN 'services'   = ANY(v_sections) THEN t.services_total   ELSE 0 END
      + CASE WHEN 'advances'   = ANY(v_sections) THEN t.advances_total   ELSE 0 END
      + CASE WHEN 'pharmacy'   = ANY(v_sections) THEN t.pharmacy_total   ELSE 0 END
      + CASE WHEN 'treatments' = ANY(v_sections) THEN t.treatments_total ELSE 0 END,
    -- Reconciliación con get_reports_overview (misma definición, mismo rango).
    'reconciliation', json_build_object(
      'payments_amount',           t.payments_amount,
      'treatment_payments_amount', t.treatment_payments_amount,
      'collected_breakdown', json_build_object(
        'period_appointments', t.period_appointments,
        'other_appointments',  t.other_appointments,
        'plans',               t.plans,
        'pharmacy',            t.pharmacy,
        'other',               t.other),
      'expected_grand_total',
          CASE WHEN 'services'   = ANY(v_sections) THEN t.period_appointments ELSE 0 END
        + CASE WHEN 'advances'   = ANY(v_sections) THEN t.other_appointments + t.other + t.plans ELSE 0 END
        + CASE WHEN 'pharmacy'   = ANY(v_sections) THEN t.pharmacy ELSE 0 END
        + CASE WHEN 'treatments' = ANY(v_sections) THEN t.treatment_payments_amount ELSE 0 END,
      -- Informativo, FUERA del total: devoluciones registradas en Caja en
      -- el rango (fecha civil de la org). get_reports_overview no las
      -- neta; el dashboard v3 (mig 230/233) sí. Ver pregunta al founder.
      'refunds_in_range', (
        SELECT COALESCE(SUM(cm.amount), 0)
        FROM cash_movements cm
        WHERE cm.organization_id = p_org_id
          AND cm.movement_type = 'devolucion'
          AND (cm.created_at AT TIME ZONE v_tz)::date >= v_from
          AND (cm.created_at AT TIME ZONE v_tz)::date <= v_to
      )
    )
  ) INTO result
  FROM totals t;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_custom_report(uuid, date, date, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_custom_report(uuid, date, date, text[]) TO authenticated;

COMMENT ON FUNCTION public.get_custom_report(uuid, date, date, text[]) IS
  'Reporte personalizado de /reports: tablas agrupadas (Descripción · Cantidad · Precio · Total) por sección + TOTAL FINAL. Cada sección reproduce una cubeta de get_reports_overview.collected_breakdown (misma CTE, mismo rango por payment_date). Gating M12: owner/admin de p_org_id.';
