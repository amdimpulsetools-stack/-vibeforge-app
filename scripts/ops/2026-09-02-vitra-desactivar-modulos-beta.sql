-- ═══════════════════════════════════════════════════════════════════
-- OPERACIÓN 2026-09-02 · VITRA — apagar módulos beta antes de la
-- capacitación (Almacén + Farmacia + Caja).
--
-- Farmacia NO tiene addon propio: viaja dentro de 'almacen' (sidebar
-- components/layout/sidebar.tsx:131, RLS mig 216, cron module-adoption).
-- Apagar 'almacen' + 'caja' apaga los tres módulos.
--
-- La config de Caja (cash_settings) NO se borra: el interruptor dual de
-- la mig 226 la deja en pausa y reactivar es un UPDATE de 1 línea.
-- NubeFact (einvoice_configs) no se toca. Nada de datos se borra.
--
-- ⚠ REGLA DE ORO: si la vista previa muestra un TURNO DE CAJA ABIERTO,
--   ciérrenlo desde la app (/caja → Cerrar turno) ANTES del paso 2.
--   El paso 2 aborta solo si lo detecta (misma guarda que el 409 de
--   /api/addons/caja/deactivate).
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- PASO 1 · VISTA PREVIA (solo lectura). Copia el UUID del bloque
-- "1 · ORG" para el paso 2 y confirma que el owner es Angela Quispe.
-- ═══════════════════════════════════════════════════════════════════
WITH vitra AS (
  SELECT o.id, o.name, o.slug, o.legal_name, o.is_active, o.owner_id
  FROM organizations o
  WHERE o.name       ILIKE '%vitra%'
     OR o.legal_name ILIKE '%vitra%'
     OR o.slug       ILIKE '%vitra%'
     -- Discriminante duro: el plugin de presupuestos FIV es exclusivo
     -- de Vitra (Patricia usa 'budget_pdf_patricia').
     OR EXISTS (
          SELECT 1 FROM org_plugins p
           WHERE p.organization_id = o.id
             AND p.plugin_key = 'budget_pdf_vitra'
        )
)
SELECT * FROM (

  -- ── 1. Identidad de la org + owner ─────────────────────────────────
  SELECT 1 AS orden, '1 · ORG' AS bloque, v.name AS organizacion,
         'id = ' || v.id::text AS dato,
         'owner: ' || COALESCE(up.full_name, '?')
           || ' <' || COALESCE(up.email, au.email, '?') || '>'
           || ' · slug=' || v.slug
           || ' · legal=' || COALESCE(v.legal_name, '—')
           || ' · activa=' || v.is_active::text AS valor
  FROM vitra v
  LEFT JOIN user_profiles up ON up.id = v.owner_id
  LEFT JOIN auth.users     au ON au.id = v.owner_id

  UNION ALL
  -- ── 2. Miembros owner/admin (contraste extra) ──────────────────────
  SELECT 2, '2 · MIEMBROS owner/admin', v.name,
         COALESCE(up.full_name, '(sin nombre)'),
         m.role || ' · ' || COALESCE(up.email, au.email, '?')
           || ' · activo=' || m.is_active::text
  FROM vitra v
  JOIN organization_members m ON m.organization_id = v.id
                             AND m.role IN ('owner','admin')
  LEFT JOIN user_profiles up ON up.id = m.user_id
  LEFT JOIN auth.users     au ON au.id = m.user_id

  UNION ALL
  -- ── 3. Addons de la org (TODOS, para ver qué queda encendido) ──────
  SELECT 3, '3 · ADDONS', v.name,
         oa.addon_key
           || CASE WHEN oa.addon_key IN ('almacen','caja')
                   THEN '   ← SE APAGA' ELSE '' END,
         'enabled=' || oa.enabled::text
           || ' · activado=' || COALESCE(oa.activated_at::date::text, '—')
  FROM vitra v
  JOIN organization_addons oa ON oa.organization_id = v.id

  UNION ALL
  -- ── 4. Config de Caja: NO se borra, se conserva para reactivar ─────
  SELECT 4, '4 · CAJA config', v.name,
         CASE WHEN cs.organization_id IS NULL
              THEN 'sin fila cash_settings'
              ELSE 'fila cash_settings PRESENTE — NO BORRAR' END,
         COALESCE('scope=' || cs.shift_scope
                  || ' · arqueo_ciego=' || cs.require_blind_count::text
                  || ' · fondo=' || cs.default_opening_float::text
                  || ' · tolerancia=' || cs.difference_tolerance::text, '—')
  FROM vitra v
  LEFT JOIN cash_settings cs ON cs.organization_id = v.id

  UNION ALL
  -- ── 5. TURNOS ABIERTOS ⚠ bloqueante: cerrar desde /caja primero ────
  SELECT 5, '5 · TURNOS ABIERTOS ⚠', v.name,
         COALESCE('turno ' || s.id::text, 'ninguno abierto ✔ — se puede apagar'),
         COALESCE('abierto ' || to_char(s.opened_at, 'YYYY-MM-DD HH24:MI')
                  || ' por ' || COALESCE(up.full_name, up.email, s.opened_by::text)
                  || ' · fondo=' || s.opening_float::text, '—')
  FROM vitra v
  LEFT JOIN cash_shifts s ON s.organization_id = v.id AND s.status = 'open'
  LEFT JOIN user_profiles up ON up.id = s.opened_by

  UNION ALL
  -- ── 6. Datos de prueba: POS de Farmacia ────────────────────────────
  SELECT 6, '6 · DATOS DE PRUEBA', v.name, 'pharmacy_sales',
         'total='        || (SELECT count(*) FROM pharmacy_sales x WHERE x.organization_id = v.id)::text
      || ' · borrador='    || (SELECT count(*) FROM pharmacy_sales x WHERE x.organization_id = v.id AND x.status = 'borrador')::text
      || ' · confirmadas=' || (SELECT count(*) FROM pharmacy_sales x WHERE x.organization_id = v.id AND x.status = 'confirmada')::text
      || ' · anuladas='    || (SELECT count(*) FROM pharmacy_sales x WHERE x.organization_id = v.id AND x.status = 'anulada')::text
  FROM vitra v

  UNION ALL
  -- ── 7. Datos de prueba: kardex de Almacén ──────────────────────────
  SELECT 7, '7 · DATOS DE PRUEBA', v.name, 'inventario',
         'productos='      || (SELECT count(*) FROM inventory_products  x WHERE x.organization_id = v.id)::text
      || ' · movimientos=' || (SELECT count(*) FROM inventory_movements x WHERE x.organization_id = v.id)::text
      || ' · lotes='       || (SELECT count(*) FROM inventory_lots      x WHERE x.organization_id = v.id)::text
  FROM vitra v

  UNION ALL
  -- ── 8. Plata: POS vs clínica (regla mig 213/219/233) ───────────────
  SELECT 8, '8 · PLATA', v.name, 'patient_payments',
         'pos='         || (SELECT count(*) FROM patient_payments x WHERE x.organization_id = v.id AND x.source = 'pos')::text
      || ' · clinical=' || (SELECT count(*) FROM patient_payments x WHERE x.organization_id = v.id AND COALESCE(x.source,'clinical') = 'clinical')::text
      || '  (los clinical NO se tocan)'
  FROM vitra v

  UNION ALL
  -- ── 9. ¿Se está cobrando algún módulo? (debería salir vacío) ───────
  SELECT 9, '9 · COBRO DE MÓDULOS', v.name, pa.addon_type,
         'status=' || pa.status || ' · unit_price=' || pa.unit_price::text
           || '  ⚠ si status=active, avisar antes de apagar'
  FROM vitra v
  JOIN plan_addons pa ON pa.organization_id = v.id
                     AND pa.addon_type LIKE 'module\_%'

  UNION ALL
  -- ── 10. NubeFact ANTES (baseline para comparar en el paso 3) ───────
  SELECT 10, '10 · NUBEFACT (antes)', v.name,
         CASE WHEN ec.organization_id IS NULL
              THEN 'SIN config de facturación ⚠'
              ELSE 'provider=' || ec.provider END,
         COALESCE('modo=' || ec.mode
                  || ' · is_active=' || ec.is_active::text
                  || ' · ruc=' || COALESCE(ec.ruc, '—')
                  || ' · ultimo_exito=' || COALESCE(ec.last_success_at::date::text, '—'), '—')
  FROM vitra v
  LEFT JOIN einvoice_configs ec ON ec.organization_id = v.id

) t
ORDER BY orden, dato;


-- ═══════════════════════════════════════════════════════════════════
-- PASO 2 · APAGAR. ÚNICO valor a reemplazar: el UUID marcado, copiado
-- del bloque "1 · ORG" del paso 1. Aborta solo si el id no existe, si
-- el nombre no contiene "vitra", o si hay un turno de caja abierto.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org   uuid := '<ORG-VITRA>';   -- ←←← PEGA AQUÍ EL UUID DEL PASO 1
  v_name  text;
  v_open  int;
  v_upd   int;
BEGIN
  SELECT name INTO v_name FROM organizations WHERE id = v_org;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Abortado: la organización % no existe. Copia el id exacto del bloque "1 · ORG".', v_org;
  END IF;

  -- Cinturón anti-cliente-equivocado. Si el paso 1 mostró un nombre que
  -- NO contiene "vitra", cambia esta condición por el nombre exacto que
  -- viste — no la borres.
  IF v_name NOT ILIKE '%vitra%' THEN
    RAISE EXCEPTION 'Abortado: la org % se llama "%" y no parece Vitra. No se apagó nada.', v_org, v_name;
  END IF;

  SELECT count(*) INTO v_open
    FROM cash_shifts
   WHERE organization_id = v_org AND status = 'open';

  IF v_open > 0 THEN
    RAISE EXCEPTION
      'Abortado: hay % turno(s) de caja ABIERTO(S) en "%". Ciérralo desde la app (/caja → Cerrar turno) ANTES de correr esto: con el addon apagado el sidebar oculta Caja y ese turno queda abierto para siempre, sin pantalla desde la cual cerrarlo.',
      v_open, v_name;
  END IF;

  UPDATE organization_addons
     SET enabled = false
   WHERE organization_id = v_org
     AND addon_key IN ('almacen', 'caja')   -- Farmacia viaja en 'almacen'
     AND enabled;
  GET DIAGNOSTICS v_upd = ROW_COUNT;

  RAISE NOTICE 'OK — % addon(s) apagado(s) en "%" (%). cash_settings, inventario, ventas y NubeFact intactos.',
    v_upd, v_name, v_org;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- PASO 3 · VERIFICACIÓN (solo lectura, sin placeholders).
-- Éxito = bloque A con enabled=false ✔ en las dos filas, bloque D sin
-- turnos colgados, bloque F con NubeFact activa.
-- ═══════════════════════════════════════════════════════════════════
WITH vitra AS (
  SELECT o.id, o.name
  FROM organizations o
  WHERE o.name       ILIKE '%vitra%'
     OR o.legal_name ILIKE '%vitra%'
     OR o.slug       ILIKE '%vitra%'
     OR EXISTS (SELECT 1 FROM org_plugins p
                 WHERE p.organization_id = o.id
                   AND p.plugin_key = 'budget_pdf_vitra')
)
SELECT * FROM (

  SELECT 1 AS orden, 'A · MÓDULOS APAGADOS' AS bloque, v.name AS organizacion,
         oa.addon_key AS dato,
         CASE WHEN oa.enabled THEN 'enabled=TRUE  ✗ SIGUE ENCENDIDO'
                              ELSE 'enabled=false ✔ APAGADO' END AS valor
  FROM vitra v
  JOIN organization_addons oa ON oa.organization_id = v.id
   AND oa.addon_key IN ('almacen', 'caja')

  UNION ALL
  SELECT 2, 'B · ADDONS QUE SIGUEN ACTIVOS', v.name, oa.addon_key,
         'enabled=' || oa.enabled::text
  FROM vitra v
  JOIN organization_addons oa ON oa.organization_id = v.id
   AND oa.addon_key NOT IN ('almacen', 'caja')
   AND oa.enabled

  UNION ALL
  SELECT 3, 'C · CONFIG DE CAJA CONSERVADA', v.name,
         CASE WHEN cs.organization_id IS NULL
              THEN 'sin fila (la org nunca configuró Caja)'
              ELSE 'cash_settings INTACTA ✔' END,
         COALESCE('scope=' || cs.shift_scope
                  || ' · arqueo_ciego=' || cs.require_blind_count::text
                  || ' · tolerancia=' || cs.difference_tolerance::text, '—')
  FROM vitra v
  LEFT JOIN cash_settings cs ON cs.organization_id = v.id

  UNION ALL
  SELECT 4, 'D · TURNOS', v.name,
         'abiertos = ' || (SELECT count(*) FROM cash_shifts s
                            WHERE s.organization_id = v.id AND s.status = 'open')::text,
         CASE WHEN EXISTS (SELECT 1 FROM cash_shifts s
                            WHERE s.organization_id = v.id AND s.status = 'open')
              THEN '✗ TURNO COLGADO — reactiva ''caja'' y ciérralo desde /caja'
              ELSE '✔ ninguno colgado' END
  FROM vitra v

  UNION ALL
  SELECT 5, 'E · DATOS CONSERVADOS', v.name, 'no se borró nada',
         'pharmacy_sales='   || (SELECT count(*) FROM pharmacy_sales      x WHERE x.organization_id = v.id)::text
      || ' · inv_products=' || (SELECT count(*) FROM inventory_products  x WHERE x.organization_id = v.id)::text
      || ' · inv_movs='     || (SELECT count(*) FROM inventory_movements x WHERE x.organization_id = v.id)::text
  FROM vitra v

  UNION ALL
  SELECT 6, 'F · NUBEFACT INTACTA ✔', v.name,
         CASE WHEN ec.organization_id IS NULL
              THEN '✗ SIN config de facturación'
              ELSE 'provider=' || ec.provider
                   || ' · modo=' || ec.mode
                   || ' · is_active=' || ec.is_active::text END,
         COALESCE('ruc=' || COALESCE(ec.ruc, '—')
                  || ' · razon_social=' || COALESCE(ec.legal_name, '—')
                  || ' · conectado=' || COALESCE(ec.connected_at::date::text, '—')
                  || ' · ultimo_exito=' || COALESCE(ec.last_success_at::date::text, '—')
                  || ' · ultimo_error=' || COALESCE(ec.last_error_at::date::text, 'ninguno'), '—')
  FROM vitra v
  LEFT JOIN einvoice_configs ec ON ec.organization_id = v.id

  UNION ALL
  SELECT 7, 'G · COBROS CLÍNICOS', v.name, 'patient_payments source=clinical',
         (SELECT count(*) FROM patient_payments x
           WHERE x.organization_id = v.id
             AND COALESCE(x.source, 'clinical') = 'clinical')::text
         || ' cobros — sin cambios (created_by/tender_kind se siguen estampando, mig 226)'
  FROM vitra v

) t
ORDER BY orden, dato;


-- ═══════════════════════════════════════════════════════════════════
-- OPCIONAL · Ocultar también las tarjetas en Settings → Módulos.
-- Con la fila apagada, Almacén (S/39) y Caja (S/19) siguen apareciendo
-- ahí con botón "Activar" (riesgo de re-encendido accidental + cobro).
-- Este DELETE las hace invisibles del marketplace (ambos addons tienen
-- is_active=false, así que sin fila de grant no se listan).
-- Correr DESPUÉS del paso 2, solo si se quiere cero riesgo:
-- ═══════════════════════════════════════════════════════════════════
-- DELETE FROM organization_addons
--  WHERE organization_id = '<ORG-VITRA>'::uuid
--    AND addon_key IN ('almacen','caja')
--    AND enabled = false;   -- red de seguridad: solo borra lo ya apagado

-- Para REACTIVAR después (funciona con la fila apagada o borrada):
-- INSERT INTO organization_addons (organization_id, addon_key, enabled)
-- VALUES ('<ORG-VITRA>'::uuid, 'almacen', true),
--        ('<ORG-VITRA>'::uuid, 'caja',    true)
-- ON CONFLICT (organization_id, addon_key) DO UPDATE SET enabled = true;
