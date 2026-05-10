# Budget Tiers (A/B/C) — Read-only UI/UX Isolation Audit

Branch: `claude/add-terms-privacy-fH9H7` · Date: 2026-05-09 · Scope: `fertility_basic` addon — tier-based budget feature.

---

## 1. TL;DR — verdicto de aislamiento UI

**GO with concerns.** El addon `fertility_basic` ya está parcialmente blindado: el sidebar gatea las páginas con `requiresAnyAddon`, los cards/secciones de `FertilityBudgetRecordsSection` y `BudgetsPage` hacen short-circuit con `if (!fertilityActive) return null`, y la API de `/api/budgets` valida el addon defense-in-depth. Sin embargo (a) **no existe un componente `<FertilityAddonGate>` reutilizable**: cada call-site repite `hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])`, lo cual abre la puerta a leaks por copia incompleta; (b) **`/scheduler/follow-ups/page.tsx` NO tiene gate de UI** (solo el sidebar lo oculta y la API lo valida) — si alguien navega directo por URL ve la página entera intentando renderizar; (c) **el tab "Presupuestos" del `PatientDrawer`** se muestra a TODAS las orgs, gateando solo el contenido fertility por dentro — el tab vacío puede ser confuso pero NO leakea fertility data porque `FertilityBudgetRecordsSection` retorna `null`. Antes de empezar a codear los tiers, hay que crear el helper compartido y endurecer follow-ups.

---

## 2. Patrón actual de addon gating

**Patrón canónico de hoy (3 capas):**

1. **Sidebar / navegación** — `NavItem.requiresAnyAddon: ["fertility_basic", "fertility_premium"]` filtrado en `components/layout/sidebar.tsx:200`. Es la capa de "no descubrir la feature".
2. **Page-level UI gate** — cada page lee `useOrgAddons().hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])` y o (a) muestra un empty-state "Pack Fertilidad requerido" (`scheduler/budgets/page.tsx:142-152`), o (b) retorna `null` (`fertility-budget-records-section.tsx:138`). Es la capa de "si llegan por URL no se rompe ni leakea".
3. **API gate** — `app/api/budgets/route.ts:54-102` y `app/api/clinical-followups/dashboard/route.ts:458-467` validan el addon antes de retornar payload. Defense-in-depth real.

**Inconsistencias:**
- No hay un componente envolvente (no existe `<FertilityAddonGate>` ni `<AddonGate>`).
- No hay un helper como `useFertilityAddon()` — la fórmula `hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])` se repite literalmente en 6+ archivos (`scheduler/budgets/page.tsx:67`, `patients/fertility-budget-records-section.tsx:59`, `settings/whatsapp-clipboard-tab.tsx:139`, `settings/email-settings-tab.tsx:141`, `admin/members/page.tsx:160`, etc.). Hoy es coherente pero frágil ante futuros refactors o nuevos tiers.
- `/scheduler/follow-ups/page.tsx` (`page.tsx:63-509`) no tiene la capa 2: si bien la regla de seguimientos solo crea trabajo cuando el addon existe (la API filtra), el componente no muestra empty-state si la org perdió el addon. Existe un edge case: usuario tenía addon, lo desactiva, sigue con la URL en historial → ve un kanban vacío sin explicación.

**Recomendación:** ver §6.

---

## 3. Auditoría por entry point

### 3.1 `/admin/services` form

- Archivo: `app/(dashboard)/admin/services/page.tsx` (927 líneas, single-file CRUD con `useForm` + `zodResolver`, sin uso actual de `useOrgAddons`).
- Hoy NO hay nada de fertilidad ni de tiers. La form de servicio se valida vía `serviceSchema` en `lib/validations/service.ts`. No existen aún las columnas `services.is_budget_eligible` ni la tabla `service_budget_tiers` (no aparecen en `/supabase/migrations`, último mig `139`).
- Plan correcto: el checkbox "Habilitar para presupuestos del addon Fertilidad" + sub-form A/B/C debe envolverse en un `<FertilityAddonGate>` o un guard `if (fertilityActive)` interno que oculte tanto el campo del form como su valor en `serviceSchema` (Zod debe permitir `is_budget_eligible: z.boolean().optional()` pero la UI no debe pintarlo).
- **Riesgo de stale data**: si una org tenía el addon, configuró tiers y luego desactivó el addon, las filas en `service_budget_tiers` quedan en DB. Eso está OK como soft-archive (re-activar restaura la config), pero la UI debe **NO mostrar el flag/sub-form** cuando addon=off. Recomendación: feature, no bug — pero documentar y considerar un script de cleanup si la baja es definitiva. La migración nueva debe contemplar `ON DELETE CASCADE` desde `services` y un comentario explicando la política.
- **Importante**: cuando el dropdown de tratamientos del modal de presupuesto consulta `services WHERE is_budget_eligible = true`, esa query debe ir por una API route addon-gated (`/api/services/budget-eligible` p.ej.), NO directo desde Supabase JS al client — sino orgs sin addon podrían leer el flag con `select *`. RLS debe denegar lectura del flag a orgs sin addon (o más simple: la API route es la única vía, y RLS bloquea).

### 3.2 Card de la cita en `/scheduler`

- `app/(dashboard)/scheduler/page.tsx` orquesta. La grid en sí está en `day-view.tsx`/`week-view.tsx` (no inspeccionado a fondo, pero se invocan en `page.tsx:475-499`).
- El "card de cita" como concepto de UI con acciones es realmente el `AppointmentSidebar` (`app/(dashboard)/scheduler/appointment-sidebar.tsx`, ~1600 líneas) que se abre al hacer click en una cita (`page.tsx:298-305`).
- **Estados de la cita**: enum string en `appointment.status` con valores `scheduled` | `confirmed` | `completed` | `cancelled` | `no_show` (`appointment-sidebar.tsx:1041-1071`). El equivalente del PRD a "atendida" es **`completed`**, no "atendida". El botón "Asignar presupuesto" solo debe aparecer cuando `appointment.status === "completed"` (descartar `scheduled`/`confirmed`/`no_show`/`cancelled`).
- **Role gating actual**: usa `useOrgRole()` con `isDoctorRole = isDoctor` (`appointment-sidebar.tsx:92`) y `isAdmin`. El patrón vigente para "hide for receptionist" es comparar negativo (`!isDoctorRole && !isReceptionist`). Para el botón nuevo: `(isAdmin || isDoctor || (isObstetra via membership.is_fertility_advisor))` y no recepción.
- **Detección de `is_fertility_advisor`**: la columna existe (mig 137 — `organization_members.is_fertility_advisor BOOLEAN`). NO está expuesta en el contexto de `useOrganization` ni en `useOrgRole`. Habría que extender el hook o crear `useFertilityAdvisor()`. Hoy es server-side only (la API de budgets la consulta).
- **Loading flicker**: `useOrgAddons` arranca con `loading: true` y dispara `fetch('/api/addons')` (`use-org-addons.ts:25-37`). Mientras `loading=true`, `hasAddon`/`hasAnyAddon` retornan `false` (porque `addons=[]`). Eso significa **el botón NO va a parpadear visible antes del check** — el comportamiento default es ocultar. Bien.
- **Inserción del botón**: en `appointment-sidebar.tsx:1037-1129` (sección de action buttons), justo después de la fila de invoicing/completar/no-show. Debe ir gateado por: (1) `fertilityActive`, (2) `appointment.status === "completed"`, (3) rol `(isAdmin || isOwner || isDoctor || isFertilityAdvisor)` → no recepcionista. Gemma: el `appointment-sidebar.tsx` ya importa `useOrgRole` y tiene `isDoctorRole` — sumar `useOrgAddons` y `useFertilityAdvisor` y un único guard.

### 3.3 Drawer del paciente

- Archivo: `app/(dashboard)/patients/patient-drawer.tsx`. **Solo se monta desde `/patients/page.tsx:830`** (NO desde el scheduler). El scheduler tiene su propio `AppointmentSidebar` que no es el drawer del paciente. Eso simplifica el análisis: hay un solo punto de inserción.
- Tabs: en `patient-drawer.tsx:340-355`. El tab `budgets` se agrega **incondicionalmente** (línea 346: `{ key: "budgets", label: "Presupuestos", icon: Wallet }`). Comparar con `growth` (línea 345) que sí está gateado por `hasAddon("growth_curves")`.
- **Concern 🟡**: el tab "Presupuestos" siempre se muestra. Para una org sin fertility, el tab solo contiene el legacy `BudgetsPanel` (treatment_plans budget — feature base) más `FertilityBudgetRecordsSection` que retorna `null` (no leakea). Comportamiento OK, pero un nombre más neutro o gating del fertility-section no rompe a nadie. Cuando se agregue "Asignar presupuesto" como CTA encima del tab, debe gateado por addon.
- El botón "Asignar presupuesto" aquí ya existe en forma "Registrar presupuesto enviado" (`fertility-budget-records-section.tsx:147-156`), gateado por `!isReceptionist` y por `fertilityActive`. Para el nuevo flow tier-based hay que reusar el mismo componente y pasarle un nuevo `mode="assign"` (vs. el actual `mode="register"`).

### 3.4 Followup card (`scheduler/follow-ups`)

- `app/(dashboard)/scheduler/follow-ups/page.tsx` — **🔴 Concern: no tiene gate de UI**. La página renderiza el dashboard sin ningún `if (!fertilityActive) return null`. Si alguien navega directo por URL sin tener el addon, ve el chrome (header, tabs vacíos) y la API responde 0 items (no 403, porque la API filtra por org sin addon retornando colección vacía silenciosamente — ver `clinical-followups/dashboard/route.ts`). Mitigación: agregar el mismo bloque que `budgets/page.tsx:142-152`.
- `followup-card.tsx:165` ya lee `linkedBudget = followup.budget_records?.[0] ?? null`. La condición que pide el PRD ("solo mostrar el botón si NO existe budget linkeado") se traduce a `!linkedBudget` en el card. Confirmar: si el cron crea un followup `fertility.budget_pending_acceptance` automáticamente al asignar un presupuesto, la `budget_records` join debería poblarse y el botón ocultarse. La API de dashboard retorna ese join (ver imports `linkedBudget = followup.budget_records?.[0]`).
- El card hoy NO tiene checks de `fertilityActive`/`hasAddon` — confía en que la página le pase solo followups que existen porque hay addon. Aceptable mientras la página esté bien gateada.

### 3.5 Modal "Asignar presupuesto"

- `components/clinical/budget-record-modal.tsx` (338 líneas) ya existe y se usa desde 2 sitios: `scheduler/budgets/page.tsx:285` y `fertility-budget-records-section.tsx:193`. El modal **NO** verifica `useOrgAddons` por dentro — confía en que el call-site lo gatea. OK porque ambos call-sites ya validan addon arriba; pero al añadir el 3er entry-point (appointment sidebar), hay que verificar que el sidebar tampoco lo monta sin gate.
- **Treatment dropdown**: hoy es un enum hard-coded `BUDGET_TREATMENT_TYPES` (`types/fertility.ts:107`). El nuevo flow lo reemplaza por un dropdown contra `services WHERE is_budget_eligible = true`. Esa query **debe** ir por API route addon-gated, no contra Supabase con RLS (riesgo de leak). Crear `GET /api/budgets/eligible-services` con check de addon + RLS bloqueando lectura del flag para orgs sin addon.
- **Asesora dropdown**: query `organization_members WHERE is_fertility_advisor = true` (mig 137 ya creó la columna). También pasar por API route `GET /api/budgets/advisors` para no exponer la columna a clientes sin addon.
- **"Sin procesar" sub-bucket en kanban** (`/scheduler/budgets`): es una división visual de la columna "Pendiente" (sent_at IS NULL vs NOT NULL). No agrega nuevos requirements de gating — la página ya está addon-gated.

### 3.6 PDF download button

- No existe hoy. El plan: aparece en cada budget card cuando `assigned_at IS NOT NULL` y la obstetra ha clickeado "Generar". El permiso debe ser **addon-active** únicamente — cualquier miembro del staff puede compartir el PDF (no es info clínica sensitiva, es un cotizador). NO hace falta gating por rol; los recepcionistas SÍ deben poder descargar para mandar a la paciente por WhatsApp. Confirmar este punto con producto antes de implementar.
- El PDF debe generarse on-demand (no persistido) o cacheado por hash del budget_record para no costar S3. Recomendación: generar en API route `GET /api/budgets/:id/pdf` con check de addon + RLS sobre el budget_record. Storage bucket sólo si necesario.

---

## 4. Sidebar / navegación

- `components/layout/sidebar.tsx:88-95`: `/scheduler/follow-ups` **NO** tiene `requiresAnyAddon` (🔴 concern → si bien el seguimiento como concepto existe en base, hoy todas las reglas son del addon fertility, y la página queda visible para orgs sin addon mostrando un kanban vacío). `/scheduler/budgets` SÍ está gateado (línea 93).
- **Mobile nav**: `components/layout/mobile-nav-context.tsx` solo provee el state `isOpen`. El sidebar real es el mismo `Sidebar` component, renderizado con `fixed translate-x` para mobile (sidebar.tsx:310-312). El gate `requiresAnyAddon` aplica idéntico — bien.

---

## 5. Riesgos UI/UX detectados

- 🔴 `app/(dashboard)/scheduler/follow-ups/page.tsx:63-509` — falta UI gate por addon. **Mitigación**: agregar al inicio del componente:
  ```ts
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const fertilityActive = hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY]);
  if (addonsLoading) return <Loader2/>;
  if (!fertilityActive) return <EmptyAddonState/>;
  ```
- 🔴 `components/layout/sidebar.tsx:88` — `/scheduler/follow-ups` no tiene `requiresAnyAddon`. **Mitigación**: agregar `requiresAnyAddon: ["fertility_basic", "fertility_premium"]` igual que el sibling `/scheduler/budgets`.
- 🟡 `app/(dashboard)/patients/patient-drawer.tsx:346` — tab "Presupuestos" se muestra a todas las orgs. Hoy no leakea info fertility (la sección retorna `null`), pero al añadir el botón "Asignar presupuesto" arriba del tab debe gateado. **Mitigación**: poner el CTA dentro de `FertilityBudgetRecordsSection` o usar `<FertilityAddonGate>` al wrappear.
- 🟡 6 archivos repiten `hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])`. Riesgo de drift cuando se agregue una 3ra tier (`fertility_enterprise`?). **Mitigación**: ver §6.
- 🟡 `useOrgAddons` (`use-org-addons.ts:30`) hace fetch `/api/addons` cada montaje. Sin React Query/dedupe — si el sidebar y 3 panels piden addons en la misma página, son 4 fetches paralelos. No es leak, pero waste. **Mitigación**: cachear con React Query `useQuery(['org-addons', organizationId])`.
- 🟡 Posible flicker en la **transición** addon-on→off durante esa misma sesión: si la owner desactiva el addon en `/settings`, los componentes ya montados (un `BudgetsPage` abierto en otra tab) no escuchan el cambio. Es edge case raro; probablemente no vale el costo de un broadcast channel.
- 🟢 `app/api/budgets/route.ts:54-102, 200-225` — defense-in-depth backend está bien.
- 🟢 `useOrgAddons` arranca con `addons=[]` mientras `loading=true`, así que `hasAddon` retorna `false` durante el loading → no hay flicker visible del botón antes del check.

---

## 6. Patrón recomendado de implementación

Antes de empezar el feature, crear estas 2 piezas reusables (≤30 líneas de código combinado):

```ts
// hooks/use-fertility-addon.ts
import { useOrgAddons } from "./use-org-addons";
import { FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY } from "@/types/fertility";

export function useFertilityAddon() {
  const { hasAnyAddon, loading } = useOrgAddons();
  return {
    active: hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY]),
    loading,
  };
}
```

```tsx
// components/fertility-addon-gate.tsx
"use client";
import { useFertilityAddon } from "@/hooks/use-fertility-addon";

export function FertilityAddonGate({
  children,
  fallback = null,
  showLoader = false,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showLoader?: boolean;
}) {
  const { active, loading } = useFertilityAddon();
  if (loading) return showLoader ? <SkeletonLoader/> : null;
  if (!active) return <>{fallback}</>;
  return <>{children}</>;
}
```

Refactor incremental: empezar usándolo en los 3 entry-points NUEVOS (admin/services tier sub-form, appointment sidebar button, follow-up card button) — no tocar los 6 sitios actuales en este PR. Eso minimiza superficie del diff.

**Para el botón "Asignar presupuesto"** — extraer un componente reusable `<AssignBudgetButton appointment={...} patient={...} followup={...}/>` que internamente:
1. Decide a partir de los props qué entry-point es.
2. Hace todos los checks (`<FertilityAddonGate>`, role check, status check).
3. Renderiza el modal `BudgetRecordModal` extendido con el flow de tiers.

Así los 3 entry-points solo importan 1 línea cada uno.

---

## 7. Pre-flight checklist para el implementador

- [ ] Org sin addon → no ve el checkbox `is_budget_eligible` en `/admin/services` (test: usuario con addon disabled, recargar page, inspect form).
- [ ] Org sin addon → no ve el botón "Asignar presupuesto" en NINGÚN entry point: appointment-sidebar, patient-drawer, follow-up card.
- [ ] Org sin addon → `GET /api/services/budget-eligible` retorna 403 (no leakea servicios con flag aunque el caller mande `select *`).
- [ ] Org sin addon → `GET /api/budgets/advisors` retorna 403 (no leakea `is_fertility_advisor`).
- [ ] RLS sobre `service_budget_tiers` deniega `SELECT` cuando el caller pertenece a una org sin addon activo. Probar con `set role authenticated; select * from service_budget_tiers` desde un user de org sin addon → 0 rows.
- [ ] Cancelar suscripción al addon → la query de la API de tiers retorna vacío (no 500). Las queries del cliente usan `react-query` y no rompen al recibir `[]`.
- [ ] Recepcionistas en org con addon → no ven el botón "Asignar presupuesto" en ninguno de los 3 entry-points (sí pueden descargar el PDF, según producto).
- [ ] Citas con `status !== "completed"` → no ven el botón en el appointment sidebar.
- [ ] Followup que ya tiene un `budget_records[0]` → no muestra el botón "Asignar presupuesto" (`followup.budget_records?.length === 0`).
- [ ] Org desactiva el addon, una owner queda con un budget abierto en otra tab → al refrescar, ve la pantalla "Pack Fertilidad requerido" (no un 500).
- [ ] El sidebar gateá `/scheduler/follow-ups` con `requiresAnyAddon` (FIX requerido) y `/scheduler/budgets` ya lo hace.
- [ ] Mobile nav (mismo `Sidebar` component) hereda el gate — verificar visualmente con DevTools en viewport mobile.
- [ ] El `<FertilityAddonGate>` en loading retorna `null` (no `<Skeleton>`) por default, evitando flicker.

---

**Archivos clave referenciados:**
- `/home/user/-vibeforge-app/hooks/use-org-addons.ts` (canónico, 163 líneas)
- `/home/user/-vibeforge-app/hooks/use-org-role.ts`
- `/home/user/-vibeforge-app/components/layout/sidebar.tsx:88-200`
- `/home/user/-vibeforge-app/components/role-gate.tsx` (modelo a imitar para `FertilityAddonGate`)
- `/home/user/-vibeforge-app/app/(dashboard)/scheduler/page.tsx:97-540`
- `/home/user/-vibeforge-app/app/(dashboard)/scheduler/appointment-sidebar.tsx:92, 996-1129`
- `/home/user/-vibeforge-app/app/(dashboard)/scheduler/follow-ups/page.tsx:63-509` (🔴 falta gate)
- `/home/user/-vibeforge-app/app/(dashboard)/scheduler/follow-ups/followup-card.tsx:165`
- `/home/user/-vibeforge-app/app/(dashboard)/scheduler/budgets/page.tsx:66-152` (modelo de gate)
- `/home/user/-vibeforge-app/app/(dashboard)/patients/patient-drawer.tsx:340-355, 1015, 1447`
- `/home/user/-vibeforge-app/app/(dashboard)/patients/fertility-budget-records-section.tsx:57-156`
- `/home/user/-vibeforge-app/components/clinical/budget-record-modal.tsx`
- `/home/user/-vibeforge-app/app/api/budgets/route.ts:54-225`
- `/home/user/-vibeforge-app/app/api/clinical-followups/dashboard/route.ts:23-120, 458-467`
- `/home/user/-vibeforge-app/supabase/migrations/137_fertility_advisor_flag.sql`
- `/home/user/-vibeforge-app/types/fertility.ts:107-119`
