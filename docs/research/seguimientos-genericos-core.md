# Seguimientos como capacidad core de Yenda — análisis y propuesta

> **Fecha:** 2026-08-03
> **Estado:** análisis aprobado para discusión — SIN implementación aún (decisión pendiente de Oscar)
> **Método:** mapeo técnico del sistema actual (agente Fable 5, referencias file:line verificadas) + propuesta de diseño (agente Opus 5)
> **Pregunta del founder:** ¿cómo se organizan los seguimientos para especialidades distintas de fertilidad o para una org general sin especialización? ¿Dónde se asignan? ¿Cómo se modela una 1ª cita que deriva a una 2ª?

---

## Resumen en una frase

Los seguimientos ya son genéricos por dentro — el modelo de datos, la bandeja, las transiciones y el trigger de atribución no mencionan fertilidad ni una vez. Lo que falta no es construir: es **quitar un gate, añadir una categoría centinela que cierre seguimientos sin mapeo, y darle al doctor un checkbox al completar la cita**. Con eso una org general tiene seguimientos de primera clase sin configurar nada, Vitra y Dra. Patricia no notan absolutamente ningún cambio, y el Pack Fertilidad sigue vendiendo lo único que no se puede regalar: el embudo multi-etapa, las plantillas por etapa y los soles recuperados.

---

# Parte I — Propuesta de diseño (agente Opus 5)

## 0. Hallazgos que cambian el planteamiento (verificados)

1. **La bandeja central ya es genérica por dentro.** `buildPendingQuery` en `app/api/clinical-followups/dashboard/route.ts:280-297` filtra por `organization_id` + `status IN ('pendiente','contactado','pospuesto')` y nada más. No filtra por `source`, ni por `rule_key`, ni por addon. Los seguimientos manuales del semáforo de historia clínica ya caen en el bucket "Pendientes". Lo único que impide que una org general los vea es un `if (!fertilityActive)` en el cliente (`app/(dashboard)/scheduler/follow-ups/page.tsx:388`) y un `requiresAnyAddon` en el sidebar (`components/layout/sidebar.tsx:94`). **La bandeja no hay que construirla; hay que destaparla.**

2. **Inconsistencia de estado que se vuelve bug al destapar.** `PATCH /api/clinical-followups/[id]` (`route.ts:49-53`) escribe `is_resolved`/`resolved_at`/`resolved_by` — y no toca `status`. Un seguimiento resuelto desde historia clínica queda `status='pendiente'` para siempre y seguiría apareciendo en Pendientes de la bandeja. Hoy no se nota porque las dos superficies nunca coexisten. Al unificar superficies, es **prerrequisito duro**.

3. **El trigger de atribución no puede cerrar nada en una org general.** `compute_appointment_attribution` (mig 129:44-56) hace early return con `'organica'` cuando el servicio agendado no tiene mapeo canónico. Sin mapeo → todo orgánico → los seguimientos genéricos nunca se cierran solos y la bandeja se convierte en un cementerio. Único punto donde hay que tocar lógica de DB.

## 1. Tesis arquitectónica

### Recomendación: **Core Followups sin addon** — desgatear la bandeja + una única categoría centinela + creación de origen clínico. Sin fila en `organization_addons`, sin wizard, sin seeds por vertical.

| Pieza | Qué es | Coste |
|---|---|---|
| **Desgate de superficie** | Quitar `requiresAnyAddon` del item de sidebar de follow-ups y el `if (!fertilityActive)` de la página; el gate se mueve a **features dentro de la página**, no a la página. | ~0 migraciones |
| **Categoría centinela `core.next_visit`** | Una sola fila en `addon_canonical_categories` con `addon_key='core'`. Significa "cualquier próxima cita cuenta como cierre". No requiere mapeo de servicios. | 1 seed idempotente |
| **Vías de creación sin configuración** | Marca del doctor al completar la cita + default opcional por servicio (§2). | 1 columna en `services` |

### Alternativas descartadas y por qué

- **(a) Addon `core_followups` gratuito/base**: requiere backfill en `organization_addons` de todas las orgs (toca datos de los pilotos), mete un producto de S/0 en el marketplace que diluye el relato comercial, y perpetúa el gate (`hasAnyAddon` con una key más). El objetivo es eliminar la pregunta "¿esta org puede ver seguimientos?", no responderla mejor.
- **(b) Desbloquear bandeja + reglas genéricas seed**: desbloquear es correcto (mitad de la recomendación), pero una regla `followup_rules` solo dispara si el servicio tiene mapeo canónico, que es 100% manual. Una regla seed sin mapeo es una regla muerta; destapar una bandeja que nunca se llena es peor que dejarla oculta.
- **(c) Namespace `general.*` sin addon**: categorías sin motor de creación no crean nada. La idea de namespace sí es necesaria (`category_key` es UNIQUE global) — se recomienda `core.*` en vez de `general.*` para dejar claro que es plataforma, no "la especialidad genérica".
- **(d) La recomendada** gana porque produce seguimientos reales el día 1 sin configuración, no toca ni una fila de datos de las orgs piloto, y deja el motor de reglas como lo que debe ser: el mecanismo del vertical de pago.

### Línea de monetización (qué queda gratis vs qué sigue siendo del addon)

**Core (gratis, todas las orgs):** bandeja Pendientes/Recuperados/Sin respuesta; creación por marca del doctor + default por servicio (1 salto: cita → control); panel en historia clínica (ya existe); widget del doctor (ya existe); cierre automático por atribución binaria (agendó / no agendó) vía centinela; snooze/intentos/cierre manual; plantilla WhatsApp genérica de clipboard con envío manual.

**Addon vertical (de pago):** journey multi-etapa (cadenas de reglas 1ª → 2ª → decisión → inicio — el core hace *un salto*, el addon modela *un embudo*); plantillas por etapa y tono aprobadas Meta; KPIs de recuperación con ingreso atribuido (LTV) y desglose Cat A/B; módulo de presupuestos completo; reportes de conversión por médico; envío automático cuando se encienda.

**Regla mnemotécnica: el core te dice a quién llamar; el addon te dice cuánto vale la llamada y en qué etapa del embudo estás.** Nadie compra Pack Fertilidad por la bandeja — la compra por el embudo, las plantillas y los soles recuperados. Regalar la bandeja aumenta el valor percibido del addon.

## 2. El caso 1ª cita → 2ª cita en una org general

**No hace falta inventar "tipos de cita", ni que la 2ª cita sea "de un tipo".** El sistema actual pregunta "¿la cita agendada es de la categoría destino?". Para una org general la pregunta correcta es más simple: **"¿este paciente volvió a agendar algo?"**. La distinción fina (volvió *a lo correcto*) es el refinamiento que justifica el addon.

Implementación: el seguimiento core se crea con `target_category_canonical = 'core.next_visit'`, y se extiende `compute_appointment_attribution` con una **segunda pasada centinela**:

```
1. (existente) service_id → mapping → category_key → followup abierto con
   target = category_key            ← fertilidad, sin cambios
2. (nuevo) si no hubo match (incluido category_key IS NULL) →
   followup abierto del paciente con target = 'core.next_visit'
3. match → misma clasificación Cat A/Cat B según first_contact_at
4. sin match → 'organica'          ← comportamiento actual
```

`CREATE OR REPLACE` aditivo. Cero regresión para Vitra (sus seguimientos nunca llevan `core.next_visit`). Mantiene la atribución honesta: un cierre centinela sin contacto previo se registra como Cat B, no infla nada.

### Automatismo vs marca del doctor vs híbrido → **híbrido**

- **Automatismo puro por reglas — descartado**: requiere el wizard de mapeo canónico; una clínica general con 8 servicios no va a mapear 14 categorías. La fricción de configuración es el enemigo.
- **Marca explícita del doctor sola — insuficiente**: si el doctor olvida marcar, el paciente desaparece en silencio — y capturar la deserción silenciosa es *toda* la propuesta de valor.
- **Híbrido recomendado — default a nivel de servicio, última palabra del doctor:**
  - Nueva columna `services.followup_after_days INTEGER NULL` (NULL = comportamiento actual exacto). Se configura donde el admin ya está: el editor de servicios ("Sugerir control a los ___ días"). No es un wizard.
  - Al marcar la cita `completed`, control en el sidebar: `☐ Requiere control · [7d] [15d] [30d] [otro] · motivo (opcional)` — pre-marcado con el default del servicio si existe. El doctor confirma, ajusta o desmarca. (Precedente exacto: el semáforo manual de historia clínica ya crea `clinical_followups` sin gate.)
  - Si el doctor no interactúa, **se crea igual** con el default del servicio → eso captura la deserción silenciosa.
  - `source='manual'` si el doctor tocó el control, `'rule'` si salió del default; `rule_key='core.service_followup'`. Sin migración de CHECKs.
- **La 2ª cita no necesita nada**: cuando recepción agenda cualquier cita futura del paciente, el trigger centinela cierra el seguimiento y lo mueve a Recuperados. Sin mapeos, sin tipos de cita, sin `parent_appointment_id`, sin tocar el scheduler.

## 3. Dónde viven los seguimientos (UX)

**Principio: una sola página, revelación progresiva.** La misma `/scheduler/follow-ups` para todos; el addon añade columnas, pestañas y filtros — no reemplaza la vista. El upgrade se siente como "se llenó de cosas", no "cambió de página".

| Superficie | Rol | Estado hoy | Cambio propuesto |
|---|---|---|---|
| `/scheduler/follow-ups` (bandeja central) | Lista de trabajo de recepción/asesora: "a quién llamo hoy" | Gateada, copy de fertilidad | Desgatear, renombrar, empty state educativo |
| Panel en historia clínica | Contexto clínico: "¿qué le debo a este paciente?" | Ya genérico, sin gate | Mostrar también `source='rule'` con badge; corregir write de estado (§5) |
| Widget del doctor dashboard | "Mis pendientes de hoy" | Ya genérico, sin gate | Deep-link a la bandeja pre-filtrada por doctor |
| Sidebar de la cita | Punto de **creación** | No existe | Control "requiere control" (§2) + chip si el paciente ya tiene seguimiento abierto |

**Org general ve**: Seguimientos en el sidebar (Presupuestos sigue gateado); las 3 pestañas actuales; Recuperados sin la tarjeta de ingreso atribuido (conteo, no soles); filtros doctor/fechas/origen (sin filtro por regla si no hay reglas); card con motivo, fecha esperada, WhatsApp manual, snooze, cerrar; empty state educativo (no paywall): "Se crean solos cuando marcas *requiere control* al completar una cita, o desde la historia clínica" + link al editor de servicios.

**Org con addon ve además**: KPIs de ingreso y Cat A/B, filtro por regla, stepper de etapa en la card, plantillas por etapa/tono, bandeja de Presupuestos, config de reglas y mapeo canónico. Chip "Pack Fertilidad activo".

**Naming**: página "Seguimientos" para todos. Subtítulo core: *"Pacientes que esperan tu contacto para volver"*. Eliminar el empty state "Pack Fertilidad requerido". En Fase 2, renombrar en código `lib/fertility/followup-triggers.ts` → `lib/followups/`, `types/fertility.ts` → `types/followups.ts` (ya es genérico), `/api/admin/fertility/rules` → `/api/followup-rules` con alias. No llamarlo "seguimientos automatizados" en el core — "automatizados" es lo que vende el addon.

## 4. Plan de tratamiento → seguimientos

**Diagnóstico**: `app/api/treatment-plans/route.ts:192` llama al helper de presupuestos al crear cualquier plan, pero gateado por addon — el diseño está invertido: el plan es entidad genérica (mig 053) y su seguimiento está gateado por un vertical. Cuando corre, el followup no guarda referencia al plan (huérfano; no se cierra si el plan se cancela).

**El vínculo correcto — origen polimórfico, no una FK más:**

```
clinical_followups.source_type TEXT  -- 'appointment' | 'clinical_note' | 'treatment_plan'
                                     -- | 'treatment_session' | 'budget_record' | 'manual'
clinical_followups.source_id   UUID  -- sin FK (polimórfico)
```
+ índice parcial `(organization_id, source_type, source_id) WHERE source_id IS NOT NULL`. Las columnas `appointment_id`/`clinical_note_id` existentes NO se tocan; `source_*` se puebla en paralelo con backfill idempotente. Habilita: plan `cancelled`/`completed` → cerrar sus seguimientos con `closure_reason='plan_cerrado'` (lo que `plan_status_changed` prometía y nunca se implementó).

**Sesiones perdidas (`treatment_sessions.status='missed'`) — la mejor señal genérica desaprovechada:**
- Ya se escribe en producción (`appointment-sidebar.tsx:645-650` al pasar la cita a `no_show`); cero ambigüedad (sesión pagada perdida = paciente que hay que llamar); cero configuración; genérico de verdad (fisioterapia, odontología, dermatología, nutrición).
- La escritura ocurre desde 2 rutas → la creación del seguimiento debe vivir en un **trigger de DB** (`AFTER UPDATE`, `SECURITY INVOKER`, `EXCEPTION WHEN OTHERS` que nunca bloquea — patrón mig 129), con guarda de idempotencia.
- Para cero regresión: tabla `organization_followup_settings` (missed_session_followup, missed_session_delay_days, close_on_any_appointment, default_followup_days) **sin backfill** — el trigger lee con `COALESCE(..., false)`. Vitra y Dra. Patricia no tienen fila → todo apagado. Orgs nuevas obtienen fila en onboarding con defaults `true`. Toggle en Settings para sumarse.

**NO hacer con el plan**: no desgatear el helper de presupuestos (su semántica es del addon); no implementar `plan_status_changed` como *generador* (solo como *cerrador*).

## 5. Deudas técnicas: prerrequisitos vs diferibles

**Prerrequisitos duros (Fase 1):**
1. **Doble estado `is_resolved`/`status`**: el PATCH de historia clínica no toca `status` → lo resuelto seguiría en Pendientes de la bandeja. Arreglo mínimo: escribir también `status='cerrado_manual'`+`closed_at` en ese PATCH + trigger `BEFORE UPDATE` que sincronice ambos pares en ambas direcciones. El refactor grande espera.
2. **Trigger de atribución con early return** (mig 129): sin la pasada centinela, ningún seguimiento core se cierra jamás. `CREATE OR REPLACE` aditivo.
3. **Scoping `.limit(1).single()`** en APIs de followups: org arbitraria para usuarios multi-org; al abrir la bandeja a todas las orgs el radio de impacto se multiplica. Patrón ya corregido en `use-org-addons.ts` — copiar.
4. **`doctor_id NOT NULL`**: bloquea seguimientos sin médico (sesión perdida, administrativos). `DROP NOT NULL` — barato, hacerlo ya.

**Diferibles**: FK polimórfica (Fase 2, prerrequisito de §4 no de §2); CHECK de `trigger_event` (Fase 2, solo al añadir eventos; corregir de paso el abuso de mig 142); **`vencido` → nunca escribirlo** (estado derivado en lectura: `expected_by < now() AND status='pendiente'` → badge rojo; escribirlo requeriría un job y no hay cron activo); **cron de contacto → mantener pausado explícitamente** (humano en el loop; antes de reactivar hace falta modo drenaje de backlog); `message_templates` → ignorar (tabla muerta); stepper hardcodeado de followup-card (Fase 2, core renderiza sin stepper); `reactivate` que preserva `first_contact_at` (Fase 2 pero vigilarlo — puede inflar Cat A; arreglo: mover `first_contact_at` al histórico de `contact_events` al reactivar).

## 6. Fases propuestas (sin fechas)

### Fase 1 — "Seguimientos para todos", sin configuración
Objetivo: una org general pasa de no ver nada a tener una bandeja que se llena sola y se vacía sola. Sin abrir un panel de configuración.

Migraciones (aditivas, idempotentes, RLS, defaults = comportamiento actual):
- `18X_core_followups_foundation.sql`: `doctor_id DROP NOT NULL`; `services.followup_after_days INTEGER NULL`; seed `('core','core.next_visit','Próxima cita')` en `addon_canonical_categories`; trigger de sincronización `is_resolved` ↔ `status`.
- `18X_attribution_sentinel.sql`: `CREATE OR REPLACE compute_appointment_attribution` con segunda pasada centinela.

App: quitar `requiresAnyAddon` de follow-ups en sidebar (mantener en budgets); página con revelación progresiva (KPIs de ingreso/filtro por regla/stepper condicionados a `fertilityActive`, resto siempre visible); control "requiere control · Nd" en el sidebar de cita pre-llenado desde el servicio; `followup-triggers` crea seguimiento core cuando no hay addon pero el servicio tiene `followup_after_days`; PATCH de historia clínica escribe también `status`; APIs con `org_id` explícito; badge "vencido" derivado; campo en editor de servicios.

Verificación de no-regresión: con addon activo y mapeo existente, las 3 reglas de Vitra crean exactamente los mismos seguimientos, la atribución clasifica igual, los KPIs dan los mismos números. Ningún INSERT/UPDATE de Fase 1 toca filas existentes.

### Fase 2 — Orígenes ricos y el segundo vertical
- `source_type`/`source_id` polimórfico + backfill; `organization_followup_settings` sin backfill; abrir CHECK de `trigger_event` (`appointment_no_show`, `treatment_session_missed`, `budget_accepted`) y corregir mig 142; trigger de sesión perdida; cierre por estado de plan.
- Renombrado `lib/fertility/*` → `lib/followups/*` con alias; `useFertilityAddon()` → `useFollowupCapabilities()` (`{hasTray, hasJourney, hasRevenueKpis, hasTemplates}`); toggle de settings; plantilla clipboard genérica de control; chip en sidebar de cita; deep-link del widget del doctor.

### Explícitamente NO hacer todavía
| No hacer | Por qué |
|---|---|
| Reactivar el cron de contacto automático | Pausado por decisión deliberada; con 10× más orgs y backlog acumulado sería el peor momento; rompe humano en el loop |
| Catálogo `general.*` de N categorías o wizard para orgs generales | Es exactamente la fricción que evitamos; si una org general pide granularidad, es señal de que quiere el addon |
| Constructor de reglas custom en UI | Promesa declarada de `fertility_premium`; regalarlo canibaliza el tier |
| Seeds de ginecología/dermatología | Sin señal de uso real es overengineering; Fase 2 deja la arquitectura lista, el seed se hace con cliente firmado |
| KPIs de ingreso atribuido en el core | De lo poco que hace defendible el precio del addon; LTV sin embudo es un número inventado |
| Refactor completo `is_resolved` → `status` | El trigger de sincronización elimina la urgencia |
| Vínculo cita→cita (`parent_appointment_id`, "recita") | **El seguimiento ES el vínculo.** Una relación cita→cita duplica semántica y obliga al scheduler a saber cosas que no necesita |

---

# Parte II — Mapa técnico del sistema actual (agente Fable 5)

*(Resumen de los hechos clave; el detalle completo con file:line está en el historial de la sesión 2026-08-03.)*

1. **Una sola tabla** `clinical_followups` para todo (fertilidad, presupuestos, semáforo manual). Nació genérica (mig 053), extendida por fertilidad (mig 128: `source`, `rule_key`, `target_category_canonical`, `expected_by`, `first_contact_at`, `contact_events`, `attempt_count`, `status` de 8 valores). Dos generaciones de estado superpuestas (`is_resolved` vs `status`).
2. **Motor genérico multi-addon en el esquema**: `followup_rules` (con `addon_key`, templates globales `organization_id IS NULL`), `addon_canonical_categories` (`category_key` UNIQUE global → namespace `<addon>.<stage>` obligatorio de facto), `organization_service_canonical_mapping`. Seed solo para fertilidad (3 reglas + 1 per-org de mig 142 con categoría fantasma).
3. **No existe "tipo de cita"**: ni `appointment_type` ni `is_first_visit`. El único discriminador es `service_id` → mapeo canónico (manual, el seed NO lo siembra). Tampoco existe vínculo cita→cita.
4. **Trigger de atribución (mig 129) 100% genérico**: Cat A (`recovered_with_contact`, requiere `first_contact_at`) / Cat B (agendó sin contacto) / Cat C (orgánica). Early return sin mapeo. `SECURITY INVOKER`, degrada a orgánica en excepción.
5. **4 rutas de creación**: cita completada (fire-and-forget → gate addon → mapeo → regla), plan de tratamiento creado (gate addon, followup huérfano), presupuesto creado (con back-link `budget_records.followup_id`), manual desde historia clínica (**sin gate** — funciona en cualquier org).
6. **Org sin addon hoy**: semáforo manual en historia clínica + widget del doctor dashboard (RPC sin filtro de addon) — pero sin bandeja central (página gateada + oculta del sidebar; la API dashboard SÍ responde sin addon).
7. **Cron de contacto automático PAUSADO** deliberadamente (auditoría 2026-07-21; no está en vercel.json, comentado en cron-bridge.yml). Todo contacto es manual desde la card (wa.me/copiar + plantillas clipboard). El cron de reminders solo tiene ventanas PRE-cita.
8. **Deudas**: `doctor_id NOT NULL`; sin FK polimórfica de origen (4 mecanismos heterogéneos); CHECK de `trigger_event` cerrado a 3 valores (el 3º sin implementar); `vencido` declarado nunca escrito; `message_templates` muerta; scoping `.limit(1).single()` multi-org; `reactivate` preserva `first_contact_at`.
9. **Multi-tenancy sólido** (RLS + defense-in-depth en todos los endpoints) — patrón reutilizable tal cual.
10. **Dirección ya acordada en roadmap**: el addon gynecology "reusará el mismo módulo de seguimientos (mismas tablas, trigger PL/pgSQL)" — `docs/coming-updates-fertility-addon.md`.

---

*Documento de investigación. La decisión de implementar (y en qué fase) es de Oscar. Al implementarse, mover las decisiones al PRD y trackear en `docs/coming-updates-core.md`.*
