-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 191: sincronización de precios de la Dra. Patricia Quispe
--                (REPROFERTILIDAD EIRL)
--
-- Acompaña al plugin `budget_pdf_patricia` (12 plantillas de precio
-- único). Alinea `service_budget_tiers` con los totales que imprime el
-- PDF, de modo que el monto que la asesora ve al asignar sea el mismo
-- que sale en el documento que firma la paciente.
--
-- Fuente de los importes: los 13 .docx de
-- `docs/Budgets/NUEVOS PRESUPUESTOS PARA IMPRIMIR/`. El xlsx de esa
-- misma carpeta (tarifario de octubre 2025) se IGNORA — decisión del
-- founder 2026-08-06: manda el .docx.
--
-- ⚠ ORG EXPLÍCITA, NO POR PLUGIN
-- ─────────────────────────────────────────────────────────────────
-- La mig 180 recorría `org_plugins WHERE plugin_key = 'budget_pdf_vitra'`
-- porque Vitra es una sola org. Aquí NO se puede: en producción existen
-- DOS organizaciones llamadas "Dra. Patricia Quispe".
--
--   · 7ca9ae0f-5715-474d-a4b5-74372c9639a6 → LA ACTIVA. Es la que tiene
--     pacientes, citas y servicios reales, y la que corre con
--     `pricing_mode = 'single'` (mig 181).
--   · fd4c150b-…                            → intento de onboarding
--     ABANDONADO de junio de 2026 (la que aparece en el post-mortem de
--     `followup_rules` del PRD). No se toca: si el plugin se instalara
--     por error en ella, un filtro por `plugin_key` le reescribiría los
--     precios a una org que nadie usa.
--
-- Por eso el UUID va escrito a mano abajo. Si el founder consolida las
-- dos orgs, hay que revisar este archivo antes de reaplicarlo.
--
-- ⚠ TIER 'A' = "el precio", no "el paquete A"
-- ─────────────────────────────────────────────────────────────────
-- Con `pricing_mode='single'` la UI colapsa los tiers a una sola
-- tarjeta y el PDF omite el rótulo "PAQUETE A", pero por debajo se
-- sigue escribiendo `tier='A'` en `budget_records` (mig 181). Esta
-- migración solo toca el tier A; B y C se dejan como estén (si
-- existen, quedan inertes porque la UI no los muestra).
--
-- Idempotente: los UPDATE llevan `IS DISTINCT FROM`, así que reaplicar
-- no reescribe nada ya correcto; los INSERT van con ON CONFLICT DO
-- NOTHING. Inerte para cualquier otra organización.
--
-- ⚠ Banking de ovocitos NO entra en este lote: el .docx trae dos
--   totales (S/ 39,700 y S/ 9,350) y está pendiente confirmar si es un
--   presupuesto o dos. Ver `lib/budget-pdf/patricia/routing.ts`.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- Org ACTIVA de la Dra. Patricia Quispe (ver cabecera).
  v_org        UUID := '7ca9ae0f-5715-474d-a4b5-74372c9639a6';
  v_category   UUID;
  v_service    UUID;
  v_row        RECORD;
  v_pat        TEXT;
  v_order      INT  := 100;
  -- Servicios ya reclamados por un presupuesto anterior del bucle. Los
  -- grupos van de más específico a más genérico ("FIV con semen
  -- donado" antes que "FIV"), así que sin esto el genérico volvería a
  -- coger el servicio del específico y le pisaría el precio.
  v_claimed    UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Guard: si el UUID no existe en este entorno (p. ej. una BD de
  -- staging recién creada), la migración no hace nada en vez de fallar.
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org) THEN
    RAISE NOTICE 'mig 191: org % no existe en este entorno — no-op.', v_org;
    RETURN;
  END IF;

  SELECT id INTO v_category
  FROM service_categories
  WHERE organization_id = v_org
    AND name = 'Reproducción Asistida (TRA)'
  LIMIT 1;

  -- ───────────────────────────────────────────────────────────────
  -- Los 12 presupuestos activos. UNA fila por presupuesto.
  --
  --   matches → patrones ILIKE contra los nombres de servicio que la
  --             clínica ya tiene cargados, comparados SIN TILDES (ver
  --             el translate() del SELECT). Se prueban en orden y gana
  --             el primero que encuentre un servicio libre; son
  --             sinónimos del MISMO presupuesto, no presupuestos
  --             distintos (por eso van en un array y no en filas
  --             sueltas: con filas sueltas, un sinónimo que no casa
  --             daría de alta un servicio duplicado).
  --   name    → nombre canónico, solo se usa si hay que dar de alta.
  --   amount  → total del .docx, ya con las erratas corregidas a la
  --             suma real de los ítems.
  --
  -- El ORDEN DE LAS FILAS importa: de más específico a más genérico.
  -- "FIV con semen donado" tiene que evaluarse antes que "FIV", o el
  -- patrón '%FIV%' se llevaría por delante el servicio del primero.
  -- ───────────────────────────────────────────────────────────────
  FOR v_row IN
    SELECT * FROM (VALUES
      (ARRAY['%OVULOS DONADOS%SEMEN DONADO%', '%OVODON%SEMEN DONADO%'],
       'FIV con óvulos donados y semen donado',      29250.00),
      (ARRAY['%DONANTE CONOCIDA%'],
       'FIV con óvulos donados (donante conocida)',  25850.00),
      (ARRAY['%MIXT%'],
       'FIV mixta (óvulos propios + donados)',       40550.00),
      (ARRAY['%OVULOS DONADOS%', '%OVODON%'],
       'FIV con óvulos donados (ovodonación)',       29350.00),
      (ARRAY['%DUO%STIM%', '%ACUMULACI%'],
       'DUO STIM',                                   37100.00),
      (ARRAY['%ROPA%'],
       'Método ROPA',                                21200.00),
      (ARRAY['%INSEMINAC%SEMEN DONADO%'],
       'Inseminación intrauterina con semen donado',  2750.00),
      (ARRAY['%INSEMINAC%'],
       'Inseminación intrauterina',                   2750.00),
      (ARRAY['%CRIO%OVOCITO%', '%CRIO%OVULO%', '%VITRIFICAC%OVOCITO%'],
       'Criopreservación de ovocitos',               14000.00),
      (ARRAY['%TRANSFERENCIA EMBRIONARIA%'],
       'Transferencia embrionaria',                   5000.00),
      (ARRAY['%FIV%SEMEN DONADO%', '%FECUNDACI%SEMEN DONADO%'],
       'FIV con semen donado',                       21000.00),
      (ARRAY['%FIV%', '%FECUNDACI%IN VITRO%'],
       'Fecundación in Vitro (FIV)',                 21000.00)
    ) AS t(matches, name, amount)
  LOOP
    -- Primer servicio libre que case con alguno de los sinónimos.
    -- `display_order` en el ORDER BY hace la elección determinista si
    -- hubiera más de uno.
    v_service := NULL;
    FOREACH v_pat IN ARRAY v_row.matches LOOP
      SELECT id INTO v_service
      FROM services
      WHERE organization_id = v_org
        -- ILIKE es insensible a mayúsculas pero NO a tildes: sin este
        -- translate(), '%OVULOS DONADOS%' nunca casaría con "FIV con
        -- óvulos donados…" y la migración daría de alta un servicio
        -- duplicado en cada pasada. Se normaliza el NOMBRE, no el
        -- patrón (los patrones ya se escriben sin tildes arriba).
        AND translate(name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') ILIKE v_pat
        AND NOT (id = ANY (v_claimed))
      ORDER BY display_order NULLS LAST, created_at
      LIMIT 1;
      EXIT WHEN v_service IS NOT NULL;
    END LOOP;

    IF v_service IS NULL THEN
      INSERT INTO services (
        organization_id, category_id, name,
        base_price, duration_minutes,
        is_active, is_budget_eligible, created_by_addon,
        display_order
      )
      VALUES (
        v_org, v_category, v_row.name,
        v_row.amount, 60,
        true, true, 'fertility_basic',
        v_order
      )
      RETURNING id INTO v_service;
      v_order := v_order + 5;
    ELSE
      UPDATE services
        SET is_budget_eligible = true,
            base_price = v_row.amount
      WHERE id = v_service
        AND (is_budget_eligible IS DISTINCT FROM true
             OR base_price IS DISTINCT FROM v_row.amount);
    END IF;

    -- Tier A = el precio único de la org (pricing_mode='single').
    INSERT INTO service_budget_tiers (service_id, tier, amount, currency, is_active)
    VALUES (v_service, 'A', v_row.amount, 'PEN', true)
    ON CONFLICT DO NOTHING;

    UPDATE service_budget_tiers
      SET amount = v_row.amount, updated_at = NOW()
    WHERE service_id = v_service
      AND tier = 'A'
      AND is_active = true
      AND amount IS DISTINCT FROM v_row.amount;

    v_claimed := v_claimed || v_service;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK (comentado — ejecutar a mano si hace falta revertir)
--
-- No hay un "estado anterior" que restaurar automáticamente: los
-- montos previos eran los que la clínica había tecleado en la UI. Lo
-- que sí es reversible sin pérdida es el alta de servicios que esta
-- migración creó, y eso se identifica por `created_at`.
--
--   -- 1. Servicios dados de alta por la migración (ajustar la ventana
--   --    al momento real de aplicación):
--   -- SELECT id, name, created_at
--   -- FROM services
--   -- WHERE organization_id = '7ca9ae0f-5715-474d-a4b5-74372c9639a6'
--   --   AND created_at >= '2026-08-06'::date;
--
--   -- 2. Borrar sus tiers y el servicio (CASCADE ya se lleva los
--   --    tiers, pero se deja explícito). NUNCA borrar un servicio con
--   --    presupuestos asignados — comprobar primero:
--   -- SELECT service_id, count(*) FROM budget_records
--   -- WHERE service_id IN (…) GROUP BY service_id;
--
--   -- DELETE FROM service_budget_tiers WHERE service_id IN (…);
--   -- DELETE FROM services WHERE id IN (…);
--
--   -- 3. Los montos de los servicios preexistentes se reponen a mano
--   --    desde Ajustes → Servicios, o con un UPDATE puntual por
--   --    service_id.
-- ═══════════════════════════════════════════════════════════════════
