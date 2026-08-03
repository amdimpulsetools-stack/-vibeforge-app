# Coming Updates — Verticalidad Fertilidad

> **Estado:** roadmap activo
> **Última actualización:** 2026-08-03
> **Documento padre:** `docs/plan-vertical-fertility-gynecology.md`
> **Spec entregado en piloto:** `docs/spec-followup-module-fertility.md`
> **Owner:** Oscar (Founder, Yenda)

Este documento trackea **explícitamente qué queda pendiente** del addon de fertilidad y a qué tier pertenece cada cosa. Se actualiza cada vez que se shipea un feature o se mueve algo de bucket.

---

## Lo que YA está entregado en `fertility_basic` (v0.1 del addon)

Pilot ready. Commits sobre `claude/add-terms-privacy-fH9H7`:

- ✅ Migraciones 127-131 (DB foundation, trigger PL/pgSQL, seed de addons + reglas + plantillas).
- ✅ Endpoint de activación del addon con clonado per-org de reglas y plantillas WhatsApp Meta-ready.
- ✅ Cron horario `/api/cron/fertility-followup-contact` con gate por hora local de la org.
- ✅ Wizard de mapeo `/admin/addon-config/fertility/canonical-mapping` (14 categorías canónicas).
- ✅ Settings page `/admin/addon-config/fertility/settings` (9 ajustes del spec sec. 10).
- ✅ Panel `/scheduler/follow-ups` reorganizado en 3 tabs (Pendientes / Recuperados / Sin respuesta).
- ✅ Card de seguimiento con badge violeta "Automatizado" + mini-stepper SVG de 3 puntos.
- ✅ 4 KPIs en tab Recuperados (recuperaciones atribuibles, iniciativa propia, tasa, revenue atribuido).
- ✅ Filtros globales en Sheet (origen, regla, doctor, fecha).
- ✅ Cableado scheduler → trigger fire-and-forget cuando una cita pasa a `completed`.
- ✅ Trigger desde creación de `treatment_plan` para regla `fertility.budget_pending_acceptance`.
- ✅ 3 reglas Tier 2 pre-cargadas con plantillas en español peruano (email + WhatsApp Meta-ready).
- ✅ Tabla `organization_addons.tier_group` para mutua exclusión Basic/Premium.

---

## Pendiente en `fertility_basic` — iteración 2 (sin nuevo tier)

Cosas del MISMO tier que se postergaron deliberadamente para no overengineer antes de tener feedback real de Vitra. **No requieren upgrade del cliente — entran en el mismo precio cuando las construyamos.**

### Tests SQL del trigger de atribución
- Status: **escritos pero no ejecutados**.
- Archivo: `supabase/tests/fertility_followup_attribution_test.sql`.
- 8 casos cubriendo todos los escenarios del spec sec. 12.1.
- Acción: correr localmente con `psql` o Supabase CLI cuando haya entorno preparado. No bloquea piloto.

### Ajustes UX que probablemente surjan de Vitra
- Reservados a "feedback estructurado quincenal" según `plan-vertical-fertility-gynecology.md` sec. 9.1.
- Cualquier cambio menor (wording de plantillas, defaults de delays, orden de tabs, copy) entra acá.
- Prioridad: alta — son señales reales de uso.

### Pequeñas mejoras técnicas
- Atomicidad real en sync de `delay_days` de settings → reglas (hoy es best-effort sin rollback). Requiere RPC SQL.
- Endpoint `/api/clinical-followups/dashboard` sigue exponiendo modo legacy + buckets. Considerar deprecar legacy cuando ningún consumer la use.

---

## Presupuestos — backlog priorizado (análisis 2026-08-03)

Decisiones del análisis "builder de presupuestos + perfiles de org" (sesión que produjo migs 180-181). Lo ya entregado de ese análisis: modos por org `documents_enabled` + `pricing_mode='single'` (mig 181, PR #234).

### I4 — Inmutabilidad del PDF firmado + guard de conciliación · prioridad **M**
- **Problema**: un presupuesto ya **enviado/aceptado** puede divergir de su PDF si después cambian los tiers del servicio, el ajuste de honorarios o los settings del PDF de la org — el documento que la paciente tiene en la mano deja de coincidir con lo que Yenda cree que cotizó.
- **Alcance propuesto**:
  1. **Snapshot inmutable al enviar**: congelar en `budget_records` (o tabla satélite) los montos, líneas y settings usados al generar el PDF enviado; regeneraciones posteriores del PDF de un presupuesto enviado sirven el snapshot, no el estado vivo del catálogo.
  2. **Guard de conciliación**: chequeo (al aceptar y/o cron liviano) que compare snapshot vs estado vivo y marque discrepancias — la asesora ve un aviso "el catálogo cambió después de enviar este presupuesto" en vez de descubrirlo en el cobro.
- **No incluye**: versionado completo de documentos ni firma digital criptográfica — es integridad operativa/contable, no legal.
- Registrado desde el análisis 2026-08-03; construir cuando se toque de nuevo el flujo de aceptación o antes de escalar a >2 orgs con presupuestos activos, lo que llegue primero.

### Builder de presupuestos — Fase 0 antes que UI
- El builder visual arranca por una **Fase 0: motor de secciones sin UI** que reproduce el documento genérico actual como plantilla JSON (valida el modelo de datos con un consumidor real, sin editor).
- El builder visual completo recién **al umbral definido en PRD §17.5** (30-40 orgs pidiendo templates custom).
- Detalle del plan por fases: **PRD §17.5 — "Plan de construcción por fases (decisión 2026-08-03)"** (no duplicar acá).

---

## `fertility_premium` — features confirmadas (Capa 2 del modelo tier-replacement)

Cuando construyamos Premium, estos son los features que justifican la diferencia de precio. **Premium incluye TODO lo de Basic + estos extras.** Activar Premium en una org desactiva Basic automáticamente (mutua exclusión por `tier_group='fertility'`).

### Reportes y analytics avanzados
- 📊 **Página `/reports/fertility-followup-performance`** — dashboard completo con:
  - Curva temporal de recuperaciones por mes
  - Breakdown por canal de contacto (WhatsApp vs email vs manual)
  - Breakdown por regla disparadora
  - Breakdown por doctor (qué doctor genera más oportunidades de recuperación)
  - Tabla de pacientes individuales con drilldown
- En Basic queda como link gris "Próximamente" en el tab Recuperados → cuando hay Premium se vuelve clickeable + se quita el lock visual.

### Constructor de reglas custom
- Permite a la org crear sus propias reglas además de las 3 pre-cargadas (`first_consultation_lapse`, `second_consultation_lapse`, `budget_pending_acceptance`).
- UI: builder visual donde el admin elige trigger (categoría canónica + estado) + delay + target + plantillas.
- Spec sec. 14 lo marca explícitamente como Tier 3 / Premium.

### Plantillas editables por la organización
- Hoy las 6 plantillas (3 reglas × 2 tonos) vienen pre-cargadas en español peruano y son `is_system=true` (no editables).
- En Premium: la org puede clonar una plantilla pre-cargada + editar wording + ajustar variables Meta + resubmitir a Meta para aprobación.
- Útil para clínicas grandes con identidad de marca propia.

### Inventario de criopreservación
- Spec `plan-vertical-fertility-gynecology.md` sec. 4.1 Tier 2.
- Tabla nueva: `fertility_cryo_inventory` con `paciente_id`, `tipo` (óvulos/embriones/semen), `tanque`, `canister`, `posición`, `fecha_vigencia`, `consentimiento_id`, `descarte_autorizado`.
- Visualización tipo grid de tanques + filtros + alertas de vencimiento legal.
- **Cumplimiento:** descarte solo permitido si hay consentimiento firmado y vigente — bloqueo a nivel DB.

### Calendario de protocolo automatizado
- Dado un protocolo elegido (antagonista, agonista corto, IIU estimulada, etc.), el sistema autogenera las citas del ciclo + recordatorios + seguimientos en una sola acción.
- Plantillas de protocolo configurables.

### Reportes de tasas de éxito
- Dashboard de tasas por:
  - Doctor
  - Tipo de protocolo (IIU vs FIV vs ICSI)
  - Grupo etario de paciente
  - Periodo
- KPI principal: live birth rate por ciclo iniciado.

### Portal del paciente con vista de ciclo
- Acceso del paciente al app web mostrando:
  - Día actual del ciclo
  - Próxima ecografía/control
  - Medicamento del día con dosis y horario
  - Resultados de exámenes del ciclo
- Pricing variable: por paciente activo (sec. 5.3 del plan-vertical).

---

## `fertility_premium` — features evaluables (no comprometidas todavía)

Vienen del spec original pero requieren validación con Vitra antes de comprometerlas:

- **Cascada de canales** (WhatsApp primero, email solo si no responde) — spec sec. 14.
- **Reportes de conversión por médico individual** — spec sec. 14, fase 2.
- **Bulk actions** sobre múltiples seguimientos (ej. "marcar 12 seguimientos como sin respuesta") — spec sec. 14, fase 2.
- **Multi-canal SMS** — explícito como **NO roadmap** en spec sec. 14. Reabrible solo si Vitra lo pide explícito.
- **Pre-consulta digital por WhatsApp** (paciente recibe formulario antes de primera cita) — del plan-vertical sec. 3.3 dermatología, aplicable también a fertilidad.

---

## NO se construye — políticas firmes (no roadmap)

Estas exclusiones son **deliberadas**, documentadas en `plan-vertical-fertility-gynecology.md` sec. 7. **No se reconsideran sin evento explícito** (regulación, dataset auditado, etc.).

- ❌ **IA predictiva de éxito reproductivo** — implicancias médico-legales serias, dataset insuficiente.
- ❌ **PACS de embriología propio** — es un producto entero, dilata roadmap. Solo integración bidireccional con sistemas externos vía API.
- ❌ **Score automatizado de riesgo obstétrico** — solo aceptable como "sugerencia explícita con disclaimer fuerte y opt-in del médico".
- ❌ **Envío automático sin botón humano** para canales manuales — siempre humano en el loop.
- ❌ **IA que sugiera el mejor momento de contacto** — no aporta sobre el cron horario actual.

---

## Cómo trackear progreso de aquí en adelante

1. **Cada vez que se construye algo de este doc** → mover el item de "Pendiente / Premium" a "Entregado" + agregar hash del commit + actualizar la fecha del header.
2. **Cuando Vitra dé feedback estructurado quincenal** → agregar cada hallazgo a una sección "Aprendizajes del piloto" (la creamos cuando llegue el primer feedback).
3. **Antes de empezar a construir Premium** → revisar este doc + spec original + ajustar prioridades según señal real, no por hipótesis.
4. **Cualquier feature pedido por un cliente que no esté acá** → primero registrarlo en este doc con `[propuesto por: cliente X, fecha: ...]`. NO construir directo sin pasar por el filtro estratégico (evita scope creep).

---

## Vinculación con `gynecology` (futuro)

El addon `gynecology` está **pendiente de definición**. Cuando se construya:

- Reusará el mismo módulo de seguimientos automatizados (mismas tablas, trigger PL/pgSQL).
- Tendrá sus propias categorías canónicas (`gynecology.first_consultation`, `gynecology.pap_smear`, `gynecology.prenatal_control`, etc.).
- Sus propias reglas Tier 2 (recordatorio papanicolau cada 3 años, recordatorio mamografía anual desde 40, etc.).
- Co-activable en paralelo con `fertility_basic`/`fertility_premium` (distintos `tier_group`).

Documento espejo: cuando se arranque `gynecology`, crear `docs/coming-updates-gynecology-addon.md` con el mismo formato.

---

*Documento vivo. Edita acá cualquier decisión sobre el roadmap del addon de fertilidad. No dupliques contenido en otros docs — referencia desde este.*
