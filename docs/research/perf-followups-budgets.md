# Auditoría de performance — Seguimientos & Presupuestos

Branch: `claude/add-terms-privacy-fH9H7` · Fecha: 2026-05-06 · Modo: read-only.

## TL;DR

1. 🔴 **Presupuestos hace ~7 round-trips secuenciales por render** y los 3 últimos no se paralelizan: 1 membership + 1 fertility-check + 1 list+joins + 3 counts (`Promise.all`) + 1 KPI fetch + 1 admin-client `user_profiles`. Membership/fertility-check + counts + KPI deberían ejecutarse en `Promise.all`. Probable contribuyente principal a "varios segundos".
2. 🔴 **Falta índice por `organization_id + status + closed_at`** en `clinical_followups`. Las dos queries de "Recuperados" y "Sin respuesta" + las 3 sub-queries de KPIs filtran por `(org, status, closed_at >= …)` y solo existe `idx_clinical_followups_org_status_expected` (que no incluye `closed_at`).
3. 🟡 **`/api/clinical-followups/dashboard` corre 3 `count exact` en cada GET** (uno por bucket) — incluso cuando el cliente solo pide `bucket=counts` o un solo bucket. Cada `count exact` es un seq-scan/index-scan completo del bucket. Cachear o usar `count: estimated` reduciría el costo a la mitad.
4. 🟡 **El page de Seguimientos dispara dos GETs casi simultáneos al montar** (legacy `refreshCounts()` + `fetchTab("pending")`) y cada uno re-ejecuta los 3 counts. Total: 6 counts + 1 list por carga inicial.
5. 🟢 **No hay React Query**. Toda navegación re-fetchea de cero (`cache: "no-store"`). Migrar estos endpoints a TanStack Query con `staleTime: 60s` daría carga instantánea en el back-and-forth.

---

## Diagnóstico — Seguimientos (`/scheduler/follow-ups`)

### Flujo de datos

`page.tsx` es 100 % client component (`"use client"` línea 1). En el mount dispara:

- **`page.tsx:87-93`** — `supabase.from("doctors").select("*")` directo desde el cliente (selecciona TODOS los campos del doctor incluyendo posibles textos largos).
- **`page.tsx:95-100`** — `fetch("/api/admin/fertility/rules")`.
- **`page.tsx:218-221`** + **`page.tsx:136-138`** — dos `useEffect` independientes que disparan `fetchTab("pending", …)` y `refreshCounts()`. Resultado: dos requests separados a `/api/clinical-followups/dashboard`, cada uno corriendo `loadBucketCounts` (3 count queries).

El endpoint en sí (`app/api/clinical-followups/dashboard/route.ts`):

- `route.ts:60-66` — fetch de membership (síncrono, antes de todo lo demás).
- `route.ts:87` — `loadBucketCounts` (3 paralelos en `Promise.all`, líneas 325-329) — **siempre se ejecuta**, incluso para listings.
- `route.ts:95-102` — fetch del bucket items con join `doctors(...)`, `patients(...)`, `budget_records!fk(...)`.
- `route.ts:399-420` — solo si `bucket === "recovered"`: 3 counts adicionales + 1 fetch de `organization_addons` para LTV.

### Hallazgos

| # | Sev | Hallazgo | Impacto | Fix |
|---|-----|----------|---------|-----|
| F1 | 🔴 | Doble fetch al montar: `useEffect` de `refreshCounts` (`page.tsx:136-138`) + `useEffect` de fetch inicial (`page.tsx:218-221`). Cada uno corre `loadBucketCounts` → 6 `count(*)`s totales. | -300 a -800ms en cold start | Eliminar la llamada separada a `bucket=counts`; el endpoint ya devuelve `counts` en cualquier respuesta de bucket (`route.ts:107-117`). Quitar el `useEffect` de `refreshCounts`. |
| F2 | 🔴 | Falta índice combinado para "Recuperados" y "Sin respuesta". Las queries filtran por `organization_id + status IN (…) + closed_at >= since` (`route.ts:294-300`, `310-317`). Hoy solo hay `idx_clinical_followups_org_status_expected(org, status, expected_by)`. Postgres usará ese índice para `(org, status)` pero `closed_at` será un filter post-index → con volumen creciente, slow. | Hoy bajo, a medio plazo creciente | `CREATE INDEX idx_clinical_followups_org_status_closed ON clinical_followups(organization_id, status, closed_at DESC);` |
| F3 | 🟡 | `loadBucketCounts` siempre corre 3 counts. Si el usuario está en el tab "Pendientes" igual estamos contando "Recuperados" y "Sin respuesta". | -100 a -300ms por request | (a) usar `count: "estimated"` (Postgres `pg_class.reltuples`) para los counts del tab inactivo, o (b) cachear counts en memoria del cliente con TTL 60s (ya hay `COUNTS_TTL_MS` pero no se respeta en respuestas list). |
| F4 | 🟡 | El SELECT de items trae `*` (`route.ts:235-236`). `clinical_followups` tiene ~20 columnas incluyendo `contact_events JSONB` y `notes TEXT`. La card solo usa: `id, status, source, rule_key, doctor_id, follow_up_date, expected_by, closed_at, attempt_count, priority, reason`. | -10 a -30 % de payload, +red | Whitelist explícita en `SELECT_WITH_DETAILS`. |
| F5 | 🟡 | `doctors.select("*")` en el cliente (`page.tsx:88-92`). Incluye campos como `bio`, `signature_url`, etc. y se hace al montar (no lazy). | +1 round-trip ~100-200ms | `select("id, full_name")`. |
| F6 | 🟡 | `cache: "no-store"` en cada GET (`page.tsx:107, 166`). Navegación back→forward re-fetchea todo. | -200 a -500ms en navegación | Adoptar React Query con `staleTime: 60_000`. El endpoint ya manda `Cache-Control: private, max-age=60`. |
| F7 | 🟢 | Card lazy-fetchea templates con `templateCache` module-level (`followup-card.tsx:59-67`) — correcto. No N+1. | n/a | OK. |
| F8 | 🟢 | Sin virtualización (`page.tsx:502-512`), pero `PAGE_SIZE = 20` con load-more. A volumen actual no es problema. | n/a | Defer hasta >100 cards. |
| F9 | 🟢 | RLS en `clinical_followups` usa `get_user_org_ids()` (mig 053:157, mig 013:51). La función es `STABLE SECURITY DEFINER`, Postgres la inlinea por request. No es la causa. | n/a | OK. |

---

## Diagnóstico — Presupuestos (`/scheduler/budgets`)

### Flujo de datos

`page.tsx` también 100 % client. En cada render dispara `refresh()` (`page.tsx:120-122`) que pega `/api/budgets`.

El endpoint `app/api/budgets/route.ts` GET hace, **secuencialmente**:

1. `route.ts:186-189` — `auth.getUser()`
2. `route.ts:195` — `getMembership()` — query a `organization_members` (1 round-trip)
3. `route.ts:199` — `isFertilityActive()` — query a `organization_addons` (1 round-trip más, **debería paralelizarse con #2**)
4. `route.ts:229-237` (si role=doctor sin advisor) — `doctors` lookup
5. `route.ts:250-254` — `appointments` para construir `scopedPatientIds`
6. `route.ts:260-287` — listing principal con join `patients` + `clinical_followups`, `count: "exact"`
7. `route.ts:309-312` — `user_profiles` admin-client lookup para nombres de "sent_by"
8. `route.ts:349-353` — **3 count queries `Promise.all`** (pendiente/aceptado/rechazado)
9. `route.ts:378` — KPI query (`since90d` rows con `acceptance_status, sent_at, accepted_at`)

Esto es **mínimo 6 round-trips serializados a Postgres** para el caso normal (owner/admin/receptionist/advisor), 8 para doctor restringido. Cada uno paga RTT del pool + RLS evaluation.

### Hallazgos

| # | Sev | Hallazgo | Impacto | Fix |
|---|-----|----------|---------|-----|
| B1 | 🔴 | Round-trips serializados (#2, #3 y luego #6, #8, #9 todos esperan al anterior). Solo el bloque de los 3 counts está paralelizado. | -500ms a -1.5s en p95 | Paralelizar: `Promise.all([getMembership, isFertilityActive])`, y luego `Promise.all([listingQuery, countsP, kpiQuery, sendersQuery])`. La lista no depende de counts ni KPIs. |
| B2 | 🔴 | El listing usa `select("*", { count: "exact" })` (`route.ts:262-265`). `count: "exact"` en `budget_records` con join nested forza a Postgres a contar TODAS las filas que matchean el WHERE — más caro que la query de ítems. Y luego de todas formas se vuelven a calcular 3 counts en `route.ts:349-353`. El `count` del listing es **redundante**. | -100 a -300ms | `count` por bucket ya viene de las 3 queries paralelas (`route.ts:349-353`). Reemplazar `count: "exact"` por `head: false` sin count en el listing. Calcular `hasMore` con `data.length === limit` o con `range(offset, offset+limit)` y tomar `limit+1`. |
| B3 | 🔴 | KPI query (`route.ts:360-378`) lee TODOS los `budget_records` de los últimos 90 días sin paginación, incluyendo `acceptance_status, sent_at, accepted_at`. Para una clínica con volumen alto esto crece linealmente. Se hace en cada page-load. | medio plazo: lineal con volumen | (a) Materializar KPIs en una vista o columna agregada por org (`acceptance_metrics_30d`), refrescada por trigger o cron. (b) Mover el cómputo a un RPC SQL: `SELECT acceptance_status, count(*), avg(accepted_at - sent_at) FROM budget_records WHERE org=… AND sent_at>=… GROUP BY 1` — un round-trip y agregación en DB. |
| B4 | 🟡 | `acc.sent_at` se compara como string (`route.ts:380`: `r.sent_at >= since30d`). Funciona porque ambos son ISO-8601 UTC (`2026-04-…`). Frágil pero no rompe perf. | bajo | Documentar o convertir explícitamente. |
| B5 | 🟡 | `select("*")` en listing (`route.ts:262`) trae `notes TEXT`, `rejection_reason TEXT`, `treatment_plan_id`, `followup_id`, `created_at`, `updated_at`, etc. La card no usa varios. | bajo | Whitelist. |
| B6 | 🟡 | `user_profiles` lookup hecho via `createAdminClient` (bypass RLS, `route.ts:306-312`). Está paralelizable con counts y KPIs, hoy es secuencial al listing. | -50 a -150ms | Mover dentro del `Promise.all` mencionado en B1. |
| B7 | 🟡 | La búsqueda por `q` (nombre paciente) se hace **en JS post-fetch** (`route.ts:293-300`) sobre la página actual. Si q="garcia" y "García" está en la página 3, no aparece. Además limita la utilidad de `limit=20`. | UX/correctitud | Mover a SQL: filtrar por `patients.full_name ilike '%q%'` con un `inner join` en supabase: `select("…, patient:patients!inner(…)").ilike("patient.full_name", q)`. Requiere índice trigram. |
| B8 | 🟡 | Filtro `treatment_types` con múltiples valores se aplica en JS (`page.tsx:108-112`) — la API solo toma uno (`route.ts:271`). Same problem as B7 (página 1 podría no contener todos los matches). | UX/correctitud | Aceptar array en API: `query.in("treatment_type", types)`. |
| B9 | 🟢 | `idx_budget_records_org_status_sent(org_id, acceptance_status, sent_at DESC)` (mig 136:42) cubre listing y counts. Bien. | n/a | OK. |
| B10 | 🟢 | RLS de `budget_records` (mig 136:58) usa subselect a `organization_members`. Verificar que `organization_members(user_id, is_active)` tenga índice — si no, RLS es seq-scan en cada query. | bajo, **incierto** | Recomendar `EXPLAIN ANALYZE` en producción; si falta, agregar `CREATE INDEX ON organization_members(user_id, is_active) WHERE is_active`. |

---

## Índices DB faltantes

```sql
-- Acelera buckets "Recuperados" y "Sin respuesta" + KPIs en
-- /api/clinical-followups/dashboard (route.ts:294-300, 310-317, 401-418).
CREATE INDEX IF NOT EXISTS idx_clinical_followups_org_status_closed
  ON clinical_followups(organization_id, status, closed_at DESC);

-- (opcional) Para el snooze check en pending bucket — la cláusula
-- `.or('snooze_until.is.null,snooze_until.lte.<now>')` en route.ts:282
-- no aprovecha el índice actual.
CREATE INDEX IF NOT EXISTS idx_clinical_followups_pending_snooze
  ON clinical_followups(organization_id, status, snooze_until)
  WHERE status IN ('pendiente','contactado','pospuesto');

-- Verificar existencia (sino agregar). Crítico para RLS de TODAS las
-- tablas que usan get_user_org_ids() o el subselect equivalente.
CREATE INDEX IF NOT EXISTS idx_organization_members_user_active
  ON organization_members(user_id) WHERE is_active = true;

-- Búsqueda por nombre de paciente desde /api/budgets (B7), si se
-- migra el filtro a SQL.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_fullname_trgm
  ON patients USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
```

> Recomiendo correr `EXPLAIN (ANALYZE, BUFFERS)` en cada query antes de aplicar para confirmar el plan. Sin acceso a producción no puedo asegurar que estos índices se usen — Postgres puede preferir el seq-scan en tablas pequeñas.

---

## Plan de implementación recomendado

### Fase 1 — Quick wins (<1 día, sin cambios de schema)

1. **Eliminar el doble-fetch en `follow-ups/page.tsx`**: borrar el `useEffect` que llama `refreshCounts()` (líneas 136-138). Los counts ya vienen en la respuesta de cualquier `bucket=*` (route.ts:110-116). Solo guardarlos desde `fetchTab`. — F1.
2. **Paralelizar Presupuestos**: en `app/api/budgets/route.ts` GET, ejecutar `getMembership` + `isFertilityActive` en `Promise.all`, y luego un solo `Promise.all` para listing + 3 counts + KPI + senders lookup. — B1, B6.
3. **Quitar `count: "exact"` redundante** del listing principal en `/api/budgets` (línea 265). Detectar `hasMore` con `limit+1`. — B2.
4. **Whitelist columnas** en ambos endpoints (sustituir `*` por lista explícita en `SELECT_WITH_DETAILS` y en el listing de `budget_records`). — F4, B5.
5. **Cliente: `doctors.select("id, full_name")`** en lugar de `*` (`follow-ups/page.tsx:89`). — F5.

Impacto esperado: **-50 % a -70 % de TTFB** en `/scheduler/budgets`. **-30 % a -40 %** en `/scheduler/follow-ups`.

### Fase 2 — Estructural (1-2 días)

6. **Migración de índices** (la del bloque anterior). — F2, B10.
7. **Mover búsqueda y multi-treatment-type a SQL** en `/api/budgets` para que la paginación sea correcta. — B7, B8.
8. **Adoptar React Query** para los dos dashboards. `queryKey: ["followups-dashboard", bucket, filters]` con `staleTime: 60_000`. Eliminar los `cache: "no-store"`. — F6.
9. **Cachear counts** correctamente (respetar `COUNTS_TTL_MS` ya declarado pero ignorado).

### Fase 3 — Si crece volumen (futuro)

10. **Materializar KPIs** de presupuestos en una tabla/vista refrescada por trigger (en cada update de `acceptance_status`). — B3.
11. **Convertir el dashboard a Server Component** con streaming de counts/items. Hoy todo es client → bloqueo de paint hasta que la API responda.
12. **Virtualización** de listas (>100 cards). — F8.

---

## Notas de incertidumbre

- No corrí `EXPLAIN ANALYZE`. Las recomendaciones de índices asumen que Postgres elige el plan esperado; en tablas pequeñas el optimizer puede preferir seq-scan y los índices no ayudan hasta cierto umbral.
- El "varios segundos" del usuario podría también deberse a cold-starts del runtime (Vercel edge/serverless), no medido aquí. Verificar con DevTools ▶ Network ▶ ver `Waiting (TTFB)` de cada request.
- RLS con `IN (SELECT … FROM organization_members)` se inlinea normalmente, pero si el plan no lo hace, cada query paga un sub-scan. Confirmar con `EXPLAIN` real antes de cambios mayores.
