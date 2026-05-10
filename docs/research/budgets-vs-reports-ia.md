# IA / UX evaluation — `/scheduler/budgets` vs `/reports/budgets`

**Branch:** `claude/add-terms-privacy-fH9H7`
**Fecha:** 2026-05-10
**Pregunta del founder:** ¿Migrar el kanban de presupuestos (Pendientes / Aceptados / Rechazados con KPIs arriba) a un tab dentro de `/reports`?
**Tono pedido:** *"no se que opinas con honestidad"*. Honesto, no condescendiente.

---

## TL;DR — recomendación

**Opción C (split). NO migrar todo a `/reports`. Tampoco dejarlo 100% como está.**

El kanban es operacional y debe quedarse en `/scheduler/budgets`. Los KPIs tal como están funcionan como contexto del flujo diario, así que también pueden quedarse — pero el día que aparezcan stats avanzadas (per-asesora, per-doctor, per-tier, cohortes), eso debe vivir en `/reports`, no aquí. Mover todo a `/reports` ahora es resolver un problema que aún no existe y a cambio se rompe el flujo diario de Vitra.

---

## 1. Naturaleza del contenido — operacional vs analítico

`app/(dashboard)/scheduler/budgets/page.tsx` es claramente un **híbrido**, pero no a partes iguales:

- **El 80% es operacional.** Tabs de estado (`Pendientes / Aceptados / Rechazados`, líneas 244-255), botón `Registrar presupuesto` (línea 197-202), filtros (línea 188), cards con acciones (`<BudgetCard>`, líneas 282-289), y especialmente el split *"Sin procesar / Enviado, esperando respuesta"* (líneas 359-437) que existe explícitamente para que la obstetra **haga clic en "Enviar al paciente" hoy mismo** (comentario de código en líneas 343-358). Eso es un to-do list médico-comercial, no un dashboard.
- **El 20% son KPIs** (líneas 207-235): `Enviados (30d)`, `% conversión`, `% rechazo`, `tiempo prom. aceptación`. Son retrospectivos.

La distinción operacional/analítico que propones es correcta y este caso cae claramente del lado operacional. Los KPIs aquí funcionan más como **status awareness mientras trabajas** ("¿cómo vamos este mes mientras gestiono pendientes?") que como reporte para análisis. Es el mismo patrón que un CRM de ventas: el rep ve "% close rate" arriba de su pipeline, no se va a un módulo de "Reports" para verlo.

## 2. Patrón de uso real (Vitra)

Inferencia desde el código y `docs/vitra-pilot-checklist.md` / `vitra-feedback-log.md`:

- **Quién entra:** obstetras (asignan/envían presupuestos) y admin/owner (supervisan). Doctor no — el item `requiresAnyAddon: ["fertility_basic", "fertility_premium"]` (sidebar.tsx línea 98) lo gatea por addon, no por rol, pero el flujo natural es de obstetra. `/reports` en cambio es `adminOnly: true` (sidebar.tsx línea 111). **Esto es decisivo:** si migras los presupuestos a `/reports`, las obstetras de Vitra dejan de verlos.
- **Frecuencia:** varias veces al día. La columna "Sin procesar" existe porque la obstetra revisa pendientes recurrentemente para enviar. Es operativa pura.
- **Qué responden:** "¿qué presupuesto tengo que enviar/recordar hoy?" — pregunta operacional. Los KPIs son secundarios.

Esto es incompatible con `/reports`, que hoy es un módulo de **lectura retrospectiva por rango de fechas** para admin.

## 3. Convenciones del codebase — `/reports` ya tiene una identidad clara

Mirando `app/(dashboard)/reports/page.tsx`:

- Tabs existentes: `financial | marketing | operational | retention` (línea 27, 99-104).
- Toda la página gira alrededor de un **date range picker global** (líneas 119-147) con presets 7d/30d/90d/this_month.
- Cada tab es un componente puramente de visualización (`FinancialReport`, `OperationalReport`, etc.) que recibe `appointments`, `payments`, `patients` y devuelve charts (recharts en `operational-report.tsx`).
- Tiene un `AiReportProvider` (línea 107) que genera resúmenes ejecutivos por reporte. Eso refuerza el frame: `/reports` = "análisis para el dueño/admin que mira el pasado".
- **Cero acciones operacionales.** No hay un solo botón "registrar X" o "enviar Y" en `/reports`.

Meter el kanban de budgets ahí sería el primer ítem operacional del módulo y rompe el patrón. Peor: el kanban depende de `bucket=pending|accepted|rejected` mientras `/reports` depende de un rango de fechas — los modelos mentales chocan.

## 4. Tres opciones

### Opción A — Status quo (kanban + KPIs en `/scheduler/budgets`)

**Pros**
- Cero trabajo. Cero riesgo de regresión.
- Las obstetras siguen viéndolo (gating por addon, no por rol admin).
- Los KPIs actúan como heads-up display del trabajo diario.
- Flujo "Sin procesar → Enviado → Aceptado" sigue intacto.

**Cons**
- Cuando lleguen stats per-asesora / per-doctor / per-tier (Phase 5 mencionada en `docs/budgets/` y `coming-updates-fertility-addon.md`), no caben en este header sin saturarlo.
- Owner/admin que solo quiere ver tendencias tiene que entrar a una página operacional para sacarlas.

### Opción B — Migración total a `/reports/budgets`

**Pros**
- Coherencia conceptual con el resto de tabs de `/reports`.
- Liberas el header de `/scheduler/budgets`.

**Cons (mayoría descalificadores para Vitra hoy)**
- **Rompes el acceso de las obstetras**, que es exactamente quien usa el kanban diariamente. `/reports` es `adminOnly`. Tendrías que duplicar gating, lo cual es deuda de IA.
- El kanban no encaja con el modelo de `/reports` (date-range picker + charts retrospectivos). Mezclas un kanban accionable con tabs que solo leen el pasado. La página deja de tener una identidad clara.
- El AI summary (`AiReportProvider`) tendría que aprender un quinto reportType híbrido. Más complejidad por poco beneficio.
- Vitra ya está entrenada (`vitra-training-script.md`) con la nav actual. Cambios de IA generan tickets de soporte por meses.

### Opción C — Split (recomendada)

**Pros**
- El kanban (operacional, alta-frecuencia, multi-rol) se queda donde está. No se rompe nada.
- Los KPIs **simples actuales** se quedan también — funcionan como contexto del flujo y son baratos de mostrar (la API ya los devuelve, ver siguiente sección).
- Cuando llegue Phase 5 (KPIs avanzados, breakdowns por asesora/doctor/tier, cohortes, embudos temporales), eso vive en `/reports/budgets` o como tab dentro de `/reports` con el reportType label correspondiente. Ahí el date-range picker y el AiReportProvider sí aportan.
- Sigue la convención: `/scheduler/follow-ups` ya hace exactamente esto — tiene KPIs operacionales ligeros (`RecoveredKpiHeader`, `app/(dashboard)/scheduler/follow-ups/page.tsx` líneas 701-734) y ya hay un placeholder explícito *"Ver reporte completo (próximamente)"* (línea 653). El founder ya ratificó este patrón a nivel de código en otro addon. Si funciona ahí, funciona acá.

**Cons**
- Hay duplicación temporal de KPIs simples cuando exista `/reports/budgets`. Mitigable: el reporte muestra los mismos KPIs pero con date-range, segmentaciones y AI summary; el kanban solo muestra el snapshot.

## 5. Implicaciones técnicas

- `app/api/budgets/route.ts` línea 502 ya devuelve `kpis` separados de `items` y `counts`. **No requiere cambios de backend** para ninguna opción.
- Opción A: 0 horas.
- Opción B: medio día. Mover JSX, agregar tab a `app/(dashboard)/reports/page.tsx` (línea 99), refactor del data-fetching para respetar el date-range global (hoy `/scheduler/budgets` no usa fechas globales sino filtros internos), agregar gating por addon dentro de `/reports`, actualizar i18n (`nav.scheduler_budgets`, `reports.tab_*`), entrenar a Vitra de nuevo.
- Opción C (cuando llegue Phase 5): 1-2 días. Crear `/reports/budgets` o nuevo tab con stats avanzadas. El kanban no se toca.

## 6. Recomendación final (honesta)

**Quedarse en Opción A hoy y planificar Opción C para Phase 5.** Migrar todo a `/reports` ahora (Opción B) es prematuro: rompe el acceso de las obstetras (que son quienes lo usan), choca con la identidad analítica de `/reports`, y el founder estaría resolviendo un problema de "saturación de KPIs" que aún no existe — solo hay 4 KPIs y el header respira. El día que aparezcan los breakdowns per-asesora / per-tier / cohortes (que sí saturan), ese contenido nace directamente en `/reports/budgets`, sin tocar el kanban. Hasta entonces, no muevas algo que está funcionando para Vitra.

Si el founder presiente que algo está mal con `/scheduler/budgets`, mi apuesta es que el problema real no es "esto debería ser un reporte" sino "los KPIs actuales son demasiado genéricos para tomar decisiones" — y la respuesta a eso es construir el reporte avanzado en `/reports`, no mover el kanban.

---

## Referencias

- `app/(dashboard)/scheduler/budgets/page.tsx:73-316` — kanban + KPIs híbrido
- `app/(dashboard)/scheduler/budgets/page.tsx:343-437` — split "Sin procesar / Enviado", evidencia de uso operacional
- `app/(dashboard)/reports/page.tsx:27,99-104` — tabs actuales (financial/marketing/operational/retention)
- `app/(dashboard)/reports/page.tsx:107-211` — frame analítico (date-range global + AiReportProvider)
- `components/layout/sidebar.tsx:88-101` — `/scheduler/*` agrupado bajo "Trabajo", gated por addon
- `components/layout/sidebar.tsx:108-114` — `/reports` bajo "Insights", `adminOnly: true`
- `app/(dashboard)/scheduler/follow-ups/page.tsx:629,648-655` — patrón ya establecido: KPIs en operacional + placeholder "Ver reporte completo (próximamente)"
- `app/api/budgets/route.ts:502-507` — backend ya separa `kpis`, `counts`, `items` (cambio de UI no requiere migration)
- `docs/coming-updates-fertility-addon.md` — Phase 5 con stats avanzadas
