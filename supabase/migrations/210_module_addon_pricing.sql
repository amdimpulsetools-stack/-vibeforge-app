-- ============================================================
-- Migración 210 — Facturación de módulos (addons de pago)
--
-- Contexto: la maquinaria de cobro YA EXISTE (mig 152: plan_addons +
-- purchase_addon_atomic + sync a Mercado Pago con updatePreApprovalAmount).
-- Hasta hoy solo se usaba para cupos extra ('extra_member' /
-- 'extra_office'). Esta migración construye el PUENTE para que un addon
-- de MÓDULO (almacen, captacion) también pueda cobrarse: se suma al
-- monto de la suscripción mensual de MP, igual que un cupo extra.
--
-- Decisiones del founder codificadas aquí (fuente de verdad EN LA BASE,
-- nunca hardcodeada en el cliente):
--   · almacen   → S/39/mes, INCLUIDO desde el plan Centro Médico
--                 (slug 'professional') hacia arriba.
--   · captacion → S/99/mes, se cobra en TODOS los planes.
--
-- Aditiva e idempotente: se puede correr N veces sin efecto acumulado.
-- ============================================================

-- ── 1. Catálogo de addons: precio y regla de inclusión ──────────
--
-- monthly_price NULL = addon sin cobro directo (el 99% del catálogo:
-- módulos de especialidad incluidos en el plan). Solo los addons con
-- precio pasan por el flujo de compra.
ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS monthly_price numeric(10,2);

-- included_from_plan = slug del plan A PARTIR DEL CUAL el módulo va
-- incluido sin cobro (comparación por jerarquía:
-- independiente < professional < enterprise). NULL = no lo incluye
-- ningún plan, se cobra siempre.
--
-- Se modela como columna declarativa (y no como un if en el código)
-- para que el founder pueda cambiar la política comercial con un UPDATE
-- —"almacén ahora va incluido desde Clínica"— sin tocar ni desplegar
-- una línea de TypeScript.
ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS included_from_plan text;

COMMENT ON COLUMN addons.monthly_price IS
  'Mig 210: precio mensual en PEN del addon de módulo. NULL = sin cobro directo. Se suma al preapproval de MP vía plan_addons (addon_type = module_<key>).';
COMMENT ON COLUMN addons.included_from_plan IS
  'Mig 210: slug del plan desde el cual el módulo va incluido sin cobro (independiente < professional < enterprise). NULL = se cobra en todos los planes.';

-- Guardas de integridad. Idempotentes vía DROP IF EXISTS + ADD.
ALTER TABLE addons DROP CONSTRAINT IF EXISTS addons_monthly_price_positive;
ALTER TABLE addons
  ADD CONSTRAINT addons_monthly_price_positive
  CHECK (monthly_price IS NULL OR monthly_price > 0);

ALTER TABLE addons DROP CONSTRAINT IF EXISTS addons_included_from_plan_valid;
ALTER TABLE addons
  ADD CONSTRAINT addons_included_from_plan_valid
  CHECK (
    included_from_plan IS NULL
    OR included_from_plan IN ('independiente', 'professional', 'enterprise')
  );

-- ── 2. Precios vigentes (fuente de verdad) ──────────────────────
-- Almacén: S/39/mes en Independiente; incluido en Centro Médico y
-- Clínica (los planes que ya pagan por multi-consultorio y stock real).
UPDATE addons
   SET monthly_price = 39.00,
       included_from_plan = 'professional'
 WHERE key = 'almacen';

-- Captación: S/99/mes en TODOS los planes. Es un módulo de adquisición
-- (paga sola con un paciente al mes), no una feature de plan.
UPDATE addons
   SET monthly_price = 99.00,
       included_from_plan = NULL
 WHERE key = 'captacion';

-- Backfill del resto del catálogo: NO hace falta. Las columnas nacen
-- NULL y NULL ya significa "sin cobro directo", que es exactamente el
-- estado actual de los 14 addons de especialidad/workflow. Se deja el
-- statement escrito y comentado por si alguna vez hay que forzar el
-- reseteo de una fila mal editada a mano:
--
-- UPDATE addons
--    SET monthly_price = NULL,
--        included_from_plan = NULL
--  WHERE key NOT IN ('almacen', 'captacion');

-- OJO: esta migración NO enciende is_active. Los módulos siguen ocultos
-- del marketplace (mig 207 y 209) y solo visibles para las orgs con
-- grant explícito en organization_addons. El lanzamiento comercial es
-- un UPDATE aparte: UPDATE addons SET is_active = true WHERE key = ...

-- ── 3. plan_addons.addon_type acepta módulos ────────────────────
-- El CHECK original (mig 020) solo permitía 'extra_office' /
-- 'extra_member'. Los módulos usan el namespace 'module_<key>' para no
-- chocar con los tipos de asiento existentes ni con la lógica de
-- límites de cupos que filtra por esos dos valores exactos.
-- Se borra CUALQUIER CHECK que mencione addon_type (mig 020 lo creó con
-- nombre autogenerado; el DO block evita depender de que ese nombre sea
-- exactamente 'plan_addons_addon_type_check' en todas las DBs).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'plan_addons'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%addon_type%'
  LOOP
    EXECUTE format('ALTER TABLE plan_addons DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE plan_addons
  ADD CONSTRAINT plan_addons_addon_type_check
  CHECK (
    addon_type IN ('extra_office', 'extra_member')
    OR addon_type LIKE 'module\_%'
  );

-- Un módulo se cobra UNA vez por org (quantity = 1). A diferencia de
-- los asientos extra —donde N filas activas del mismo addon_type son
-- legítimas— dos filas 'module_almacen' activas serían doble cobro.
-- Este índice parcial lo vuelve imposible a nivel de base, incluso si
-- un bug del API lo intentara.
CREATE UNIQUE INDEX IF NOT EXISTS plan_addons_module_active_unique
  ON plan_addons (organization_id, addon_type)
  WHERE status = 'active' AND addon_type LIKE 'module\_%';

-- ── 4. billing_events: tipos para la compra/baja de módulos ─────
-- Se separan de 'addon_added' / 'addon_cancelled' (que significan
-- "cupo extra") para que el founder distinga en Health un ingreso por
-- módulo de uno por asiento sin abrir el metadata.
ALTER TABLE billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'payment_failed',
    'entered_grace',
    'grace_extended',
    'grace_expired',
    'recovered_to_active',
    'past_due_terminated',
    'cancelled_by_user',
    'cancelled_by_mp',
    'email_sent',
    'plan_changed',
    'plan_change_mp_sync_failed',
    'addon_added',
    'addon_cancelled',
    'addon_mp_sync_failed',
    'org_delete_requested',
    'org_delete_cancelled',
    'org_delete_anonymized',
    'reactivation_requested',
    'reactivation_completed',
    'deletion_grace_reminder_sent',
    'refund_issued',
    'refund_received',
    'refund_failed',
    'reactivation_addons_restored',
    'reactivation_addons_sync_failed',
    -- Mig 210 — facturación de módulos
    'module_addon_added',
    'module_addon_cancelled',
    'module_addon_mp_sync_failed'
  ));

-- ── 5. Notas de facturación (sin prorrateo) ─────────────────────
-- El cambio de monto se empuja a MP con preApproval.update, que aplica
-- desde el SIGUIENTE ciclo: MP no cobra ni devuelve la fracción del
-- ciclo en curso. Consecuencia deliberada y comunicada en la UI:
--   · activar a mitad de ciclo → el módulo se usa gratis hasta el
--     próximo cobro;
--   · desactivar a mitad de ciclo → se conserva lo ya pagado del ciclo.
-- Es el mismo comportamiento que ya tienen los cupos extra desde la
-- Wave 2 Sprint 1, así que no introduce un modelo mental nuevo.
