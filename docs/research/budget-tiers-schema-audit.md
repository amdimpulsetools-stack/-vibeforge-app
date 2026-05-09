# Budget Tiers (A/B/C) — Schema Isolation Audit

**Scope:** read-only audit of the proposed tier-based budget system schema for the `fertility_basic` addon. Hard requirement: orgs **without** the addon must keep working exactly as today.

**Branch:** `claude/add-terms-privacy-fH9H7` · **Date:** 2026-05-09

---

## 1. TL;DR — Verdict de aislamiento

**GO with concerns.** El diseño propuesto es estructuralmente compatible con el patrón ya establecido en el codebase: el aislamiento del addon vive a **nivel aplicación** (mig 127, 130, 136), no en RLS. Las tres modificaciones (`services.is_budget_eligible`, nueva tabla `service_budget_tiers`, extensión de `budget_records`) no rompen orgs sin addon **siempre y cuando** (a) la UI de servicios siga renderizando `is_budget_eligible` solo cuando el addon esté activo, (b) la RLS de la tabla nueva replique exactamente el patrón de `budget_records` (org-membership, sin gate de addon en SQL), y (c) se documente que `treatment_type` queda como columna denormalizada — NO se dropea. Hay 4 concerns 🟡 y 0 🔴.

---

## 2. Análisis del cambio en `services`

`services` es **multi-tenant** desde la mig 013 (`supabase/migrations/013_multi_tenant.sql:157-161`), con RLS basada en `organization_id IN (SELECT get_user_org_ids())` (líneas 386-393). Hay precedente claro de extender `services` con flags booleanos:

- `requires_consent BOOLEAN NOT NULL DEFAULT false` — `supabase/migrations/102_informed_consent_tier1.sql:23-24`
- `modality service_modality NOT NULL DEFAULT 'in_person'` — `supabase/migrations/038_teleconsultation.sql:15-16`
- `pre_appointment_instructions TEXT` — `supabase/migrations/080_email_vars_new_fields.sql:1-3`
- `sunat_product_code/unit_of_measure/igv_affectation` — `supabase/migrations/108_einvoice_module.sql:309-313`

**Impacto en orgs sin addon:** ninguno funcional. La columna queda en `false`, y ningún query existente la lee. Postgres ≥ 11 implementa `ADD COLUMN ... DEFAULT <constant>` como metadata-only (instant), por lo que la migración no bloquea con la tabla cargada.

**`SELECT *` que la traerían en payload:**
- `app/(dashboard)/admin/services/page.tsx:62-65` — `select("*, service_categories(id, name)")`
- `app/(dashboard)/admin/doctors/[id]/page.tsx:64` — `services.select("*")`
- `app/(dashboard)/scheduler/history/page.tsx:56` — `services.select("*")`
- `app/(dashboard)/admin/discount-codes/page.tsx:125` — `services` con `*`
- `app/(dashboard)/scheduler/appointment-sidebar.tsx:213`, `app/(dashboard)/patients/treatment-plans-panel.tsx:106`, `app/(dashboard)/patients/page.tsx:91`, `components/einvoice/emit-dialog.tsx:270`

Todas son lecturas tolerantes a columnas extras (no validan estricto). Sin embargo, el tipo TS de `Service` (probablemente generado en `types/database.ts`) DEBE regenerarse (`npm run types`) tras la migración, o de lo contrario `Service` no expondrá la propiedad y los componentes nuevos no la podrán leer con tipado correcto.

**Índices:** ninguno afectado. Si se prevé filtrar por `is_budget_eligible = true` masivamente, considerar índice parcial: `CREATE INDEX idx_services_budget_eligible ON services(organization_id) WHERE is_budget_eligible = true;` — pero solo si los benchmarks lo justifican (la cardinalidad por org es baja, full scan es trivial).

---

## 3. Análisis de `service_budget_tiers`

**RLS recomendada:** heredada vía `service_id → services.organization_id`, con check explícito vía `EXISTS`. NO es necesario gate de addon en SQL — el patrón establecido (mig 053 `clinical_followups`, mig 136 `budget_records`) ya prueba que el addon-gate vive en la capa de aplicación. Mezclar gate de addon en RLS introduciría:
- riesgo de filas "huérfanas" cuando el addon se desactiva (rows existen pero RLS las oculta — no es lo que se quiere para auditoría),
- complicación al re-activar (filas regresan, pero hay que garantizar que la suscripción no se purgó).

**Comportamiento al desactivar addon:** las filas DEBEN sobrevivir (auditoría comercial, igual que `budget_records` que es append-only — ver `supabase/migrations/136_fertility_budget_records.sql:13`, "no DELETE policy"). Reactivar el addon devuelve acceso transparente. Esto NO requiere cambio de schema; solo asegurar que `/api/addons/[key]/deactivate` no haga `DELETE` en cascada sobre tiers.

**Inserts cuando el addon no está activo:** debe rechazarse en la capa API (mismo patrón que `app/api/budgets/route.ts:51-61` y `:100-105`). NO recomiendo trigger DB que valide presencia del addon — añade acoplamiento entre `organization_addons` y la tabla, y hace tests + seeds frágiles. La defensa en profundidad ya existe (RLS multi-tenant + check de addon en cada endpoint).

**🟡 Concern A — `service_budget_tiers.is_active`:** la propuesta usa `is_active` pero la tabla ya tiene `(service_id, tier)` UNIQUE. Si un admin desactiva el tier B y luego quiere recrearlo, no puede insertar un duplicado. Ajuste: o (a) hacer el UNIQUE parcial `WHERE is_active = true`, o (b) eliminar `is_active` y usar soft-delete vía nueva fila + `created_at` desc.

---

## 4. Análisis de `budget_records` extension

**`treatment_type` deprecation:** la columna sigue con `NOT NULL CHECK` en `supabase/migrations/136_fertility_budget_records.sql:24-26`. La propuesta la mantiene como denormalized snapshot — correcto. **No dropear** porque:
- el frontend la consume directo en 9+ lugares (cards, filtros, follow-up dashboard) — ver `app/(dashboard)/scheduler/budgets/budget-card.tsx:172`, `app/(dashboard)/scheduler/budgets/page.tsx:111`, `app/(dashboard)/patients/fertility-budget-records-section.tsx:262-263`, `app/api/clinical-followups/dashboard/route.ts:246`,
- el filtro de la lista lo usa como predicado SQL: `app/api/budgets/route.ts:307,330`,
- el tipo `BudgetTreatmentType` está exportado y consumido en formularios (`components/clinical/budget-record-modal.tsx:25`).

Cuántas filas existen hoy: la tabla es nueva (mig 136), pero al estar en producción para Vitra ya hay data. El backfill debería derivar `service_id` desde el nombre del servicio cuando sea posible.

**🟡 Concern B — `service_id NULL` en filas legacy:** los nuevos reports que usen `INNER JOIN services` van a perder filas históricas. Documentar explícitamente que (a) se usa `LEFT JOIN`, o (b) se hace backfill best-effort vía mapping `treatment_type → services.name` antes de soltar la migración.

**🟡 Concern C — constraint `service_id → is_budget_eligible`:** la propuesta NO incluye este check. Recomiendo no agregarlo como constraint DB (demasiado rígido — un admin puede legítimamente quitar el flag a un servicio retroactivamente y aún querer ver sus presupuestos pasados). Validar al INSERT en API solamente.

**🟡 Concern D — `sent_at NULLABLE`:** búsqueda exhaustiva en `app/api/cron/`, `app/api/budgets/`, `app/api/clinical-followups/dashboard/`. Conclusión:
- `app/api/cron/daily-summary/route.ts:354` usa `sent_at` pero sobre `marketing_email_logs` — NO es `budget_records`. Safe.
- Todos los reads de `budget_records.sent_at` están en `app/api/budgets/route.ts` (líneas 290, 303, 310, 311, 352-354) — todos manejan `null` razonablemente (sort estable, gte/lte de fecha pasa-a-través con `null`).
- El cliente UI (`app/(dashboard)/scheduler/budgets/budget-card.tsx:151,177`, `app/(dashboard)/patients/fertility-budget-records-section.tsx:332`) hace `formatDate(budget.sent_at)` — si llega `null` muestra "Invalid date". Hay que **defensar al cliente** antes de la migración o garantizar que el endpoint use `COALESCE(sent_at, assigned_at)` en el payload.

`sent_by_user_id NULLABLE`: ya tenía `ON DELETE SET NULL` (línea 21 de mig 136) y el código lo trata como nullable (`app/api/budgets/route.ts:410-432`). Cambiar a NULLABLE en CHECK es no-op semántico.

---

## 5. Aislamiento del addon — checklist

| Aspecto | Cumple? | Cómo |
|---|---|---|
| Org sin addon → tabla `service_budget_tiers` invisible | ✅ Sí, vía app gate | RLS multi-tenant + endpoints requieren addon. Patrón idéntico a `budget_records` (`app/api/budgets/route.ts:100-105`) |
| Org sin addon → flag `is_budget_eligible` en services se ignora | ⚠️ Depende de UI | DB devuelve `false`, sin lectores actuales. UI nueva DEBE gatear con `useOrgAddons().hasAddon('fertility_basic')` antes de mostrar el toggle |
| Desinstalar addon → datos del addon NO se borran | ✅ Sí | Ningún `ON DELETE CASCADE` desde `organization_addons` hacia tablas de fertility (verificado en mig 091, 127, 130, 136). Tiers y budgets sobreviven |
| Reactivar addon → datos vuelven accesibles | ✅ Sí | RLS no depende del estado del addon, solo de membership |
| Reports base de Yenda (revenue, daily-summary) → NO leen `budget_records` | ✅ Sí | `app/api/cron/daily-summary/route.ts` no toca `budget_records` (verificado). Único consumidor del `sent_at` budget es el endpoint addon-gated `/api/budgets` |
| `/admin/services` → muestra el flag solo si addon activo | ⚠️ Cross-ref UI audit | `app/(dashboard)/admin/services/page.tsx:62-64` hace `select("*")`. La columna llega siempre; el render del toggle DEBE wrappearse con `hasAddon('fertility_basic')` |
| API `/api/services` → no devuelve `is_budget_eligible` salvo si addon activo | 🟡 Concern | No existe `/api/services` dedicado (consulta directa con cliente Supabase). Si se crea uno, considerar projection condicional. Hoy: el dato leak es low-impact (boolean = false fijo) |
| Eliminación de servicio con tiers → CASCADE definido | ✅ Sí | Propuesta ya incluye `ON DELETE CASCADE` desde `service_budget_tiers.service_id`. `budget_records.service_id` queda con default (sin CASCADE → bloquea borrado, deseable para auditoría) — recomiendo `ON DELETE SET NULL` para no bloquear borrado de servicios obsoletos |

---

## 6. Riesgos detectados / Concerns

| Sev | Riesgo | Mitigación |
|---|---|---|
| 🟡 | UI de `/admin/services` muestra flag a TODAS las orgs si no se gatea | Cross-ref con UI agent: wrappear el toggle con `hasAddon('fertility_basic')`. Server fetch puede dejar la columna pasar |
| 🟡 | `service_budget_tiers (service_id, tier)` UNIQUE bloquea recreación tras `is_active=false` | Cambiar a UNIQUE parcial `WHERE is_active=true`, o quitar `is_active` y usar soft-delete por timestamp |
| 🟡 | Filas legacy de `budget_records` con `service_id IS NULL` desaparecen en reports con INNER JOIN | Backfill best-effort por nombre + LEFT JOIN obligatorio en queries de reporting |
| 🟡 | UI cliente hace `formatDate(sent_at)` y rompe con `null` | Antes de `ALTER COLUMN sent_at DROP NOT NULL`: parchear `budget-card.tsx`, `fertility-budget-records-section.tsx`, `followup-card.tsx` con guard `sent_at ? formatDate(sent_at) : "—"` |
| 🟢 | `budget_records.service_id` sin CASCADE/SET NULL implícito bloquea borrado de servicios | Definir explícito `ON DELETE SET NULL` en la FK |
| 🟢 | Tipos TS desactualizados tras la migración | `npm run types` antes de tocar UI |
| 🟢 | `treatment_type` y `service_id` pueden divergir | Trigger opcional que sincronice `treatment_type` desde `service_id` al INSERT, o documentar como snapshot (mi recomendación: documentar) |

---

## 7. Recomendaciones específicas para la migración

```sql
-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 140: Budget tiers (A/B/C) for fertility_basic addon
-- Idempotente. Aislamiento: capa app (sin gate de addon en RLS) —
-- consistente con mig 136. RLS solo multi-tenant.
-- ═══════════════════════════════════════════════════════════════════

-- 1. services flag (instant, metadata-only en PG ≥ 11)
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_budget_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN services.is_budget_eligible IS
  'Solo relevante si la org tiene addon fertility_basic|fertility_premium activo. Marca el servicio como elegible para tiers A/B/C en service_budget_tiers.';

-- 2. service_budget_tiers
CREATE TABLE IF NOT EXISTS service_budget_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('A','B','C')),
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PEN',
  includes_text TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE parcial: permite recrear un tier tras soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_budget_tiers_service_tier_active
  ON service_budget_tiers(service_id, tier) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sbt_service_active
  ON service_budget_tiers(service_id) WHERE is_active = true;

ALTER TABLE service_budget_tiers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename='service_budget_tiers' AND policyname='sbt_select') THEN
    CREATE POLICY sbt_select ON service_budget_tiers FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND s.organization_id IN (SELECT get_user_org_ids())
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename='service_budget_tiers' AND policyname='sbt_insert') THEN
    CREATE POLICY sbt_insert ON service_budget_tiers FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND is_org_admin(s.organization_id)
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename='service_budget_tiers' AND policyname='sbt_update') THEN
    CREATE POLICY sbt_update ON service_budget_tiers FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND is_org_admin(s.organization_id)
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename='service_budget_tiers' AND policyname='sbt_delete') THEN
    CREATE POLICY sbt_delete ON service_budget_tiers FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND is_org_admin(s.organization_id)
      ));
  END IF;
END $$;

-- updated_at: reusar función global existente (mig 001, supabase/migrations/001_initial_schema.sql:7)
CREATE TRIGGER set_updated_at_service_budget_tiers
  BEFORE UPDATE ON service_budget_tiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. budget_records extension
ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS assigned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'budget_records_tier_check'
  ) THEN
    ALTER TABLE budget_records
      ADD CONSTRAINT budget_records_tier_check
      CHECK (tier IS NULL OR tier IN ('A','B','C'));
  END IF;
END $$;

ALTER TABLE budget_records ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE budget_records ALTER COLUMN sent_by_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_records_service ON budget_records(service_id) WHERE service_id IS NOT NULL;

-- Backfill best-effort (NO obligatorio, solo si la data lo amerita):
-- UPDATE budget_records br
-- SET service_id = s.id
-- FROM services s
-- WHERE br.service_id IS NULL
--   AND s.organization_id = br.organization_id
--   AND upper(s.name) LIKE '%' || br.treatment_type || '%';

COMMENT ON COLUMN budget_records.treatment_type IS
  'Snapshot denormalizado del tipo de tratamiento. Fuente de verdad: services.name vía service_id (cuando service_id IS NOT NULL). Conservado para reports históricos y backward compat con la UI.';
```

**Trigger de validación de addon:** **NO** se recomienda. Acopla la tabla a `organization_addons` y rompe el patrón de los demás módulos addon-gated del codebase. La validación queda en la API (espejo de `isFertilityActive` en `app/api/budgets/route.ts:51-61`).

---

## 8. Cross-ref para el agente de UI

Páginas que **deben** gatearse a `hasAddon('fertility_basic')` o `hasAnyAddon(['fertility_basic','fertility_premium'])`:

- `app/(dashboard)/admin/services/page.tsx` — toggle/columna de `is_budget_eligible` en la tabla de servicios y en el form de creación/edición
- Nueva ruta `app/(dashboard)/admin/services/[id]/tiers/` (si se crea) — gate completo del módulo
- `app/(dashboard)/scheduler/budgets/*` — ya está gateado en API; verificar que `useOrgAddons` se use también en el sidebar/nav (`components/layout/sidebar.tsx`) para ocultar el link a usuarios sin addon
- `components/clinical/budget-record-modal.tsx` — al introducir el selector de tier, mostrar SOLO si `hasAddon('fertility_basic')`. Caída elegante a la vista actual con `treatment_type` enum si no hay addon (pero el modal en sí ya solo se abre desde rutas addon-gated)

Filtros que deben ocultarse para orgs sin addon:
- Filtro de `treatment_type` en `app/(dashboard)/scheduler/budgets/budget-filters-sheet.tsx`
- Cualquier filtro nuevo por `tier` (A/B/C) en la vista de budgets

Componentes condicionales nuevos:
- `<TierSelector />` solo dentro de `budget-record-modal` y solo cuando el `service_id` seleccionado tenga `is_budget_eligible = true` Y existan rows en `service_budget_tiers` para ese servicio
- En `fertility-budget-records-section.tsx` (vista paciente): mostrar `tier` al lado de `treatment_type` solo si el budget tiene `tier !== null`

Defensas pre-migración (UI):
- `formatDate(sent_at)` en `budget-card.tsx:177`, `fertility-budget-records-section.tsx:332`, `followup-card.tsx:386` debe convertirse en `sent_at ? formatDate(sent_at) : "—"` ANTES de aplicar `ALTER COLUMN sent_at DROP NOT NULL`

Recordatorio: regenerar tipos vía `npm run types` después de la migración para que `Service` y `BudgetRecord` expongan las columnas nuevas en TS.
