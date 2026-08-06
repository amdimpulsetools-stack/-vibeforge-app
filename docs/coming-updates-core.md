# Coming Updates — Yenda Core (no addon)

> **Estado:** roadmap activo
> **Última actualización:** 2026-08-06
> **Doc fertilidad separado:** `docs/coming-updates-fertility-addon.md`
> **Owner:** Oscar (Founder, Yenda)

Este documento trackea **lo que queda pendiente en el core de Yenda** (lo que NO es addon de especialidad). Se actualiza cada vez que se shipea un feature o se identifica un nuevo gap.

---

## Bugs / gaps abiertos

### 🔴 P0 — Pre-launch público

#### Enforcement real de límites de plan — ✅ RESUELTO en lo esencial (nota corregida 2026-07-17)

**Esta entrada quedó obsoleta y confundió una decisión de gates pre-publicidad.** Estado real:

- ✅ **Los límites que diferencian los planes (asientos) SÍ se bloquean** desde el soft-wall v0.15.16: `lib/plan/check-limit.ts` (members, doctors, doctor_members, admins, receptionists, offices) aplicado server-side en `/api/members`, `/api/offices` y `/api/doctors/self`, con addons extra_members/extra_offices sumando al tope.
- ✅ **Pacientes y citas/mes son ILIMITADOS en los 3 planes por decisión canónica** (migs 162 y 163, 2026-06-02): el cap de pacientes era acumulado-total y penalizaba antigüedad sin reflejar costo real; las citas defienden cero revenue y un cap rompe la operación del cliente. No hay "paciente 1001 gratis" porque los pacientes dejaron de ser palanca de pricing — la palanca son los asientos, y esos sí se cobran.

**Lo que queda de la entrada original (opcional, no bloqueante de publicidad):**
1. Email automático al admin al superar el 80% de un límite de asientos
2. Cron que detecte orgs sobre-límite legacy y notifique al owner

**Estimado restante**: ~0.5 día. **Prioridad**: P2 (era P0 cuando los caps de pacientes/citas existían sin enforcement; ese mundo ya no existe).

**Modelo de datos verificado** (`mig 031:294-310`, RPC `get_org_usage`):
- **Pacientes**: `count(*) FROM patients` — lifetime, NO resetea
- **Consultorios**: `count(*) FROM offices WHERE is_active=true` — lifetime
- **Citas/mes**: `count(*) FROM appointments WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)` — resetea el 1ro de cada mes
- **Miembros / doctores**: similar lifetime check

**Lo que falta**:
1. Server-side validation antes de cada INSERT en `patients`, `offices`, `appointments` (vía RPC o endpoint guard)
2. UI feedback claro: "Llegaste al límite de tu plan. Hacé upgrade o pedí un add-on (+500 pacientes / S/30 mes)"
3. Email automático al admin cuando supera el 80% del límite
4. Cron diario que detecta orgs sobre el límite y notifica al owner

**Riesgo de no hacerlo**: clínica con plan Independiente carga 5000 pacientes, no paga por ello, te ata a soportar volumen sin ingresos correspondientes. Es bug silencioso de revenue leak.

**Estimado**: ~1-1.5 días dev (RPC validators + UI banners + email opcional).

**Prioridad**: P0 antes del soft launch público (Vitra como pilot se le pasa).

---

#### Supabase Auth emails → Resend con branding

**Estado**: Los emails de signup confirmation, magic link, reset password, change email **siguen saliendo de Supabase con su template default crudo** (texto plano, branding de Supabase en footer, parece phishing).

**Riesgo**: primera impresión pésima para cualquier cliente nuevo. El email de "confirma tu cuenta" es lo primero que recibe — si parece junk, no se registra.

**Plan**:
- **Opción A — Custom SMTP** (30 min de trabajo): configurar Resend como SMTP en Supabase Auth Settings + reescribir los 4 templates con HTML branded
- **Opción B — Auth hooks** (1 día): delegar a endpoint custom con React Email templates

Opción A para el launch; B después en Q2 si se quiere consistencia con el resto de emails transaccionales.

**Estimado**: 30 min - 1 día.

**Prioridad**: P0 antes del soft launch público.

---

### 🟡 P1 — Pre-launch (importante pero no fatal)

#### MP Wave 2 — Plan-change sync + reactivation + refunds

**Estado**: identificado en `docs/launch-prep/mp-cancellation-grace-audit.md`. Wave 1 (grace + cancellation + cron + emails) ya en producción tras mig 144. Wave 2 incluye:

1. **Plan-change sync**: hoy `/api/plans/route.ts:71-108` cambia plan en DB pero NO llama `preApproval.update` para sincronizar monto con MP → cliente paga monto antiguo silenciosamente
2. **Reactivación self-serve**: cliente que canceló dentro de los 90 días puede reactivar sin volver a registrarse desde cero
3. **Refunds**: política y endpoint cuando una clínica reclama devolución
4. **Account deletion** (distinto a cancellation): borrar org completa con período de cooldown

**Estimado**: 2-3 días.

---

#### Capa 1 PDF generator generic (no Vitra-specific)

**Estado**: el PDF de presupuesto que entrega Phase 4 (mig 141) tiene texto "Vitra-ish" (vigencia 90 días, retención 10%, etc.). Una clínica nueva que active fertility_basic vería ese mismo texto sin que sea suyo.

**Plan**:
1. Migración 146: tabla `org_budget_pdf_settings` (vigencia_days, terms_text, footer_text)
2. Editor TipTap WYSIWYG en `/settings` para personalizar por clínica
3. Auto-seed con defaults neutros al activar addon
4. Refactor del componente React-PDF para leer de la tabla

**Estimado**: 1 día.

---

#### Capa 2 PDF templates per-tier (Vitra-specific, opcional)

**Estado**: Vitra está preparando 18 PDFs con AcroForm fields para usar sus templates exactos. Cuando entregue:

1. Bucket `budget-templates` privado
2. Migración 147: columna `template_pdf_path` en `service_budget_tiers`
3. UI upload en `/admin/services` por tier
4. Refactor del API PDF: si existe template → overlay con `pdf-lib`, si no → React-PDF default

**Estimado**: 1.5 días.

**Bloqueador externo**: esperar a que Vitra entregue los 18 AcroForms.

---

### 🟢 P2 — Post-launch (futuro)

#### Phase 5 — Stats dashboard per-asesora

Para `/scheduler/budgets` y `/scheduler/follow-ups`, dashboard avanzado con:
- KPIs per-asesora (cuántos manejó, % aceptación, tiempo promedio)
- KPIs per-doctor (cuántos asignó, % conversión)
- KPIs per-tier (A vs B vs C aceptación)
- Cohortes mensuales
- Pipeline (aceptados sin iniciar)
- Comparativo period-over-period

**Ubicación recomendada**: `/reports/budgets` (admin-only). El kanban operacional sigue en `/scheduler/budgets`.

**Estimado**: 3-4 días.

---

#### Endpoint dev-only de preview de emails

**Estado**: para testear visualmente los 3 templates de billing (`payment_failed`, `grace_ending`, `access_suspended`) sin disparar un cobro real.

**Plan**: `GET /api/dev/preview-billing-email?kind=payment_failed&org=<id>` que renderiza el HTML completo en el browser con datos reales del org. Gateado por `NODE_ENV !== 'production' || authorized_dev_user`.

**Estimado**: 30 min.

---

#### Dos atenciones en el mismo bloque de horario (scheduler)

**Estado**: analizado 2026-07-09 con Claude. **Decisión pendiente — Oscar decide 2026-07-10.**

Caso raro pero real en la clínica: la ventana dice "1 bloque de 45 min = 1 paciente", pero a veces se necesitan 2 atenciones en el mismo bloque (control que termina rápido + otra paciente aprovecha el hueco, o la misma paciente agrega un servicio corto).

**Hallazgo clave del análisis**: el modelo de datos YA lo soporta — cada cita guarda `start_time`/`end_time` propios (la grilla de bloques es solo visual) y cada servicio tiene `duration_minutes`. Lo que lo impide hoy es (a) la validación de conflictos del form, que bloquea duro cualquier solape, y (b) que los cards se dibujan a ancho completo (dos solapados se taparían).

**Las 3 opciones sobre la mesa** (no excluyentes, ordenadas por esfuerzo):

1. **Citas secuenciales cortas dentro del bloque** (Caso B — misma paciente agrega servicio): dos citas que no se solapan (07:15–07:35 control + 07:35–08:00 eco) ya pasan la validación actual. Solo falta que el selector de hora del modal ofrezca inicios finos (cada 15 min) además de los bloques de la grilla. **Esfuerzo: chico (UI del picker).**
2. **"Finalizar temprano libera el bloque"** (Caso A — termina rápido, entra otra): al marcar "finalizar consulta" antes de hora (live status ya registra `consultation_ended_at`), recortar el `end_time` de la cita al momento real → el resto del bloque queda libre y agendable sin tocar la validación. **Esfuerzo: chico. Sinergia directa con el estado en vivo.**
3. **Sobreagenda controlada** (Caso C — 2 pacientes al mismo bloque a propósito): cambiar el bloqueo duro por advertencia + confirmación ("¿Sobreagendar de todas formas?") y renderizar cards solapados lado a lado (medio ancho, estilo Google Calendar). Es el estándar en software médico: el sistema advierte, la doctora decide. **Esfuerzo: medio (algoritmo de lanes en vista día). Esperar a que el piloto lo pida ≥2 veces.**

**Descartado**: consultorio "fantasma" para duplicar slots — la validación bloquea (con razón) a la misma doctora en 2 consultorios a la vez, corrompe reportes de ocupación por consultorio y confunde al estado en vivo.

**Relación**: la opción 1 conecta con "Atención combinada (multi-servicio por cita)" de abajo — si esa se hace, cubre el Caso B por otra vía (1 cita, N servicios).

---

#### Atención combinada (multi-servicio por cita)

Ver `docs/research/atencion-combinada-decision.md`. Decisión pendiente — requiere validación contra Nubefact + conversación con Vitra. Estimado 30h cuando se retome.

---

#### Foto antes/después en historia clínica (vertical dermatología)

Ver `docs/research/derma-photos-storage-strategy.md`. Diseñado pero no implementado. Estimado 9 días en 3 sprints.

---

#### Ítems trasladados desde el roadmap del PRD (2026-07-22, consolidación de fuente única)

Con el split PRD/CHANGELOG, el roadmap vive SOLO aquí. Estos cuatro estaban únicamente en el PRD:

- **Storage: límites y mensajes de espacio** — mostrar uso vs límite del plan (`max_storage_mb`) con CTA de upgrade al acercarse al tope. Hoy el límite existe en `plans` pero no se mide ni comunica.
- **Módulo de Laboratorio** (addon `lab_integration`) — órdenes de laboratorio, resultados adjuntos al historial, catálogo de exámenes.
- **Grabación de consulta + transcripción con IA** — audio de la consulta → Whisper/LLM → borrador SOAP. Alto valor para doctores, sensible en privacidad (consentimiento explícito requerido).
- **Bundle Consulta + Tratamiento** (cobro único) — solapa parcialmente con "Atención combinada (multi-servicio por cita)" de abajo; evaluar juntos cuando se retome esa decisión.

---

#### Multi-gateway de pagos (Culqi → Openpay → MercadoPago)

Ver `docs/research/openpay-pe-evaluation.md`. Recomendación: iniciar con Culqi como primer gateway adicional (Yape nativo). Estimado 3-4 días para abstracción + Culqi.

---

#### Notificaciones en vivo

**Estado**: en evaluación (registrado 2026-08-06).

Activar y asignar por rol qué notificaciones aparecen en tiempo real dentro de la app, configurable desde **Settings → Notificaciones**: la clínica elige qué eventos notifica y a quién (owner, admin, doctor, recepción), sin que cada rol reciba ruido que no le toca. El catálogo arranca chico y va creciendo con cada módulo nuevo — nueva cita agendada / cancelada, paciente que llegó, presupuesto aceptado, cobro registrado, seguimiento vencido.

**Plan**:
1. Catálogo de tipos de notificación en código (clave + descripción + roles elegibles), consumido por la UI de Settings.
2. Tabla de preferencias por org (evento × rol activado/desactivado) con RLS y defaults sensatos al crear la org.
3. Entrega in-app en vivo: reusar el lean poll ya existente de la agenda o migrar a Supabase realtime filtrado por org+rol si la latencia lo pide.

**Prioridad**: P2 — evaluar contra el feedback del piloto antes de comprometer alcance.

---

## Acciones manuales del founder (no requieren código)

- [ ] Llenar placeholders Ley 29733 en `/privacy` y `/terms` (razón social, RUC, domicilio fiscal)
- [ ] Tramitar inscripción de banco de datos en RNPDP (gob.pe/anpd, S/130, 30 días hábiles)
- [ ] Configurar DKIM/SPF/DMARC en el DNS de `yenda.app` para deliverability
- [ ] Sentry alerts a celular para errores P0
- [ ] Supabase Point-in-Time Recovery activado
- [ ] Statuspage público (statuspage.io o equivalente)
- [ ] Loom video de 5 min con el flow básico
- [ ] Configurar `SUPPORT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM` en Vercel
- [ ] Setup de inbox `@yenda.app` (Cloudflare Email Routing gratis o Google Workspace)
