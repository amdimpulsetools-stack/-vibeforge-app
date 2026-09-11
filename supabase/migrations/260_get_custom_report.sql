-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 260: get_custom_report — "Resumen de cobros del periodo" de /reports
--
-- Caso (11-sep-2026): la doctora quiere imprimir, para un rango de fechas,
-- una hoja con lo cobrado agrupado en cuatro tablas (Descripción · Cantidad
-- · Precio · Total) — Servicios, Adelantos y pagos a cuenta, Farmacia,
-- Cobros por tratamientos — y un TOTAL FINAL de lo que marque. Hoy esa
-- información está repartida entre la tarjeta "Cobrado total" del
-- Financiero, el desglose de la mig 250 y la pestaña Tratamientos; no hay
-- ninguna vista que la ponga junta ni que se pueda llevar en papel.
--
-- Decisión (docs/spec-reporte-personalizado.md §2, §3 y §9): el reporte NO
-- inventa una definición nueva de "cobrado". Cada sección ES una cubeta de
-- get_reports_overview(mig 251).totals.collected_breakdown, calculada con
-- las MISMAS CTEs (range_appointments y range_payments copiadas, no
-- reescritas), el mismo rango por payment_date, el mismo source y el
-- mismo precio real de la cita (mig 100/219):
--   Servicios                 = collected_breakdown.period_appointments
--   Adelantos y pagos a cuenta= other_appointments + other + plans
--   Farmacia                  = collected_breakdown.pharmacy
--   Cobros por tratamientos   = totals.treatment_payments_amount
--   TOTAL FINAL (4 secciones) = payments_amount + treatment_payments_amount
-- Montos BRUTOS con IGV, por fecha de cobro (CLAUDE.md, regla de oro).
-- Devoluciones de Caja: informativas, FUERA del total (mismo criterio que
-- get_reports_overview, que tampoco las neta). Precio: real si es único
-- en el grupo, NULL ("varios") + min/max si difiere; nunca un promedio.
--
-- Qué reproduce de la 251 y en qué se aparta (deliberado, comentado
-- "custom:" en el cuerpo):
--   · range_appointments: cuerpo VERBATIM (251:29-66), incluida
--     collected_in_range. Única diferencia: `a.organization_id = p_org_id`
--     (org explícita, ya gateada) en vez de `IN (SELECT get_user_org_ids())`
--     — el reporte es POR ORG; sumar las orgs de un usuario multi-org en
--     una hoja impresa de una clínica sería un error. Consecuencia: para
--     un usuario multi-org, get_reports_overview (que sí suma todas) puede
--     no cuadrar con este reporte; para la doctora (una org) es idéntico.
--   · range_payments: el CASE de cubetas VERBATIM (251:71-80); se exponen
--     columnas extra solo para agrupar (id, appointment_id,
--     treatment_plan_id, treatment_concept_id, sale_id, notes) y el WHERE
--     lleva `organization_id = p_org_id` por lo mismo.
--   · Cubetas de reconciliación (251:98-105, 120-129) reproducidas en la
--     CTE `buckets` y devueltas en `reconciliation` para que la UI cuadre
--     en el mismo payload, sin segunda llamada.
--
-- Gating (patrón M12, mig 236): p_org_id ∈ get_user_org_ids() y
-- get_user_org_role(p_org_id) ∈ owner/admin; cualquier otro rol ⇒
-- 'forbidden' con ERRCODE insufficient_privilege (42501) para que la ruta
-- HTTP lo mapee a 403 sin leer el mensaje. treatments_caller_role (mig
-- 245) no aplica: existe para las asesoras del módulo Tratamientos.
--
-- "Hoy" = día civil de la org (organizations.timezone, mig 240), mismo
-- cálculo que la mig 245:134; nunca CURRENT_DATE (UTC en Supabase).
-- Tope 366 días. Rango invertido o sección desconocida ⇒ check_violation.
--
-- Contrato del JSON: types/custom-report.ts (CustomReport). Borrador y
-- banco de pruebas: docs/reporte-personalizado/sql/ (38 aserciones,
-- incluida TOTAL FINAL == payments_amount + treatment_payments_amount).
--
-- Columnas verificadas contra las migraciones reales (no contra el stub):
--   patient_payments: id/amount/appointment_id/notes/payment_date (008),
--     organization_id (013), treatment_plan_id (099), source/sale_id (213),
--     treatment_id/treatment_concept_id (242).
--   appointments: doctor_id/office_id/service_id/appointment_date/
--     start_time/status (007), organization_id (013), price_snapshot (011),
--     discount_amount (100).  services.name/base_price (004).
--   doctors.full_name/color (005).  offices.name (003).
--   pharmacy_sales.id/organization_id/status (216).
--   pharmacy_sale_items.sale_id/description/quantity/unit_price/line_total
--     (216).  treatment_payment_concepts.id/label (242).
--   treatment_plans.id/title (053; el FK de patient_payments es de la 099).
--   cash_movements.organization_id/movement_type/amount/created_at (214).
--   organization_addons.organization_id/addon_key/enabled (091).
--   organizations.timezone (240).  get_user_org_ids/get_user_org_role (235).
--
-- Aditiva: función nueva, no reemplaza ninguna. Rollback = DROP.

CREATE OR REPLACE FUNCTION public.get_custom_report(
  p_org_id   uuid,
  p_from     date   DEFAULT NULL,   -- NULL ⇒ "hoy" civil de la org (mig 240)
  p_to       date   DEFAULT NULL,   -- NULL ⇒ p_from
  p_sections text[] DEFAULT NULL    -- NULL ⇒ todas
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
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_role := get_user_org_role(p_org_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── "Hoy" civil de la org (mig 240 / 245:134), nunca CURRENT_DATE en UTC ──
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
    -- Una sola pasada sobre las citas del rango; los bloques de abajo
    -- reutilizan este CTE (Postgres lo materializa una vez al haber
    -- múltiples referencias).
    -- VERBATIM mig 251:29-66 (custom: organization_id = p_org_id).
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
    -- CASE VERBATIM mig 251:71-80 (custom: columnas extra para agrupar y
    -- organization_id = p_org_id).
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

  -- ── 2. ADELANTOS Y PAGOS A CUENTA = other_appointments + other + plans ──
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
    -- Anticipos a planes de tratamiento (tabla mig 053, FK del pago mig
    -- 099, core). Sin esta cubeta el TOTAL FINAL no cuadraría con
    -- "Cobrado total" (spec §9.3).
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

  -- ── 4. COBROS POR TRATAMIENTOS = treatment_payments_amount, por concepto ──
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

  -- ── Cubetas de referencia (VERBATIM mig 251:98-105, 120-129) para reconciliar ──
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
    -- showTreatments en financial-report.tsx).
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
      -- neta; el dashboard v3 (mig 230/233) sí. Decisión del founder
      -- (spec §9.4): bruto en V1, el neteo se decide con la contadora.
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
  'Mig 260: "Resumen de cobros del periodo" de /reports. Tablas agrupadas (Descripción · Cantidad · Precio · Total) por sección + TOTAL FINAL. Cada sección reproduce una cubeta de get_reports_overview.collected_breakdown (misma CTE, mismo rango por payment_date, brutos con IGV). Gating M12: owner/admin de p_org_id. Contrato: types/custom-report.ts.';

-- Verificación sugerida (como owner/admin de la org):
-- SELECT get_custom_report('<org>', '2026-09-01', '2026-09-07');
-- (r->>'grand_total') debe ser igual a payments_amount + treatment_payments_amount
-- de get_reports_overview('2026-09-01','2026-09-07') para un usuario de UNA org.
