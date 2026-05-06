# Vitra — Brief táctico pre-meeting (2026-05-07)

> **Cliente:** Vitra (Centro de Fertilidad, Lima) — primer pilot pagante
> **Asistente clave del meeting:** la **administradora** (NO doctor)
> **Setup:** addon `fertility_basic` activo, Omnia para HC clínica detallada, Nubefact recién desbloqueado hoy
> **Objetivo del día:** demo a admin → coordinar capacitaciones → activar trial 1 mes
> **Branch productivo:** `claude/add-terms-privacy-fH9H7`

---

## 1. Resumen ejecutivo

Esta reunión NO es una demo médica — es una conversación con la persona que mide el ROI del software. Éxito = la admin termina diciendo "sí, empezamos lunes" + queda calendarizada la primera capacitación. NO hagas: evangelizar features, prometer fechas de roadmap, ni pretender que Yenda reemplaza Omnia para HC profunda (no es la pelea de hoy).

---

## 2. Quién es la administradora — qué le importa

Gestiona equipo, dinero y tiempo. Lenguaje para ella:

- **Reportes financieros/operativos** → abre `/reports` tab Financiero (ingresos por servicio, top 5 tratamientos). No expliques SOAP.
- **Gestión de equipo** → `/admin/members` con doctores, recepcionistas, advisors; rol con permisos distintos.
- **Cobros + facturación electrónica** → el cierre del ciclo. "Atendiste → cobraste → boleta a SUNAT en 30s."
- **Reducción de tiempo admin** → traduce features a minutos ahorrados, no a botones.
- **Visibilidad diaria** → `/dashboard` con ingresos del mes, cobranza pendiente, % ocupación, rendimiento por recepcionista.

NO le importan: detalle SOAP, plantillas clínicas, UX bonita. Le importa que **funcione, sea rápido y le dé números**.

---

## 3. Demo flow recomendado (~25 min)

Una secuencia ordenada — cada paso suma valor sobre el anterior. NO saltes; no improvises.

1. **Login + `/dashboard`** (2 min) — primer impacto. Señala las cards: ingresos del mes, cobranza pendiente, citas, % ocupación, meta del mes. *"Esto es lo primero que ves cada mañana."*
2. **`/scheduler` — crear cita** (3 min) — el flow más usado. Click slot vacío → tipea DNI de paciente existente → autocompleta → elige servicio + doctor → guardar. Punto crítico a mencionar: si cambias el nombre, el sistema desvincula automáticamente (previene errores históricos).
3. **Sidebar de la cita** (2 min) — click sobre la cita creada. Muestra secciones: datos básicos, cobros, descuento inline, consentimiento (si requiere). NO abras el modal de HC SOAP completo — Vitra usa Omnia para eso.
4. **Cita atendida → emisión Nubefact** (4 min) — **EL CIERRE DEL CICLO**. Marca cita como completada → "Registrar pago" → "Emitir boleta". Llega a SUNAT en segundos. Esto es lo que hace que valga el precio.
5. **`/reports` — Operacional + Financiero** (3 min) — donde la admin pasa el día. Top 5 tratamientos, ingresos por servicio, no-show por doctor. Botón "Exportar CSV" — menciona que se puede llevar a Excel.
6. **`/settings` → tab Módulos: addon `fertility_basic` activo** (3 min) — el upsell que ya pagaron. Muestra que está encendido y la fecha de fin de trial. Mensaje: *"Esto desbloquea seguimientos automatizados, presupuestos y rol advisor — los doctores y la obstetra ya lo tienen."*
7. **`/scheduler/follow-ups` — Seguimientos del addon** (3 min) — el valor diferencial. Tres tabs (Pendientes / Recuperados / Sin respuesta). Las cards con badge violeta "Automatizado" se generaron solas cuando una cita pasó a `completed`. *"Antes: la obstetra rastreaba en Excel. Ahora: la app le dice a quién contactar hoy."*
8. **`/admin/members` — equipo** (3 min) — doctores, advisors, recepcionistas. Muestra el flag `is_fertility_advisor` en la obstetra. Demuestra invitar un usuario nuevo (no envíes el email real — usa uno de prueba).
9. **WhatsApp clipboard configurado** (2 min) — `/settings` tab WhatsApp Templates. Plantillas listas para copiar al portapapeles desde el sidebar de la cita. *"No es API de Meta, es asistencia al humano que ya escribe por WhatsApp — pero deja de tipear de cero."*

**Backup pockets** (si sobra tiempo o preguntan): `/admin/services` con campo `requires_consent`, `/scheduler/budgets` con presupuestos del addon, portal del paciente `/portal/<slug>` desde tu celular.

---

## 4. Cosas a NO mostrar

- **`/scheduler/follow-ups` link "Próximamente"** (`page.tsx:560` EmptyState) → si pregunta, *"es del tier Premium, fase siguiente."*
- **`/settings` tab Integraciones** — placeholders "Próximamente/Coming soon" en `integraciones-tab.tsx:335, 575`. No abrir; si pregunta, salta directo a Nubefact.
- **Subir adjunto clínico (foto, doc).** 🟡 **inconsistencia**: bucket `clinical-files` usado en `app/api/clinical-attachments/route.ts:80` pero NO existe migración. Vive a mano en dashboard Supabase. **Antes del meeting confirma que existe en producción**; si no, créalo privado con RLS path-based por `org_id`. Sin esto = crash en vivo.
- **Plan de tratamiento desde la nota clínica** — funciona pero entra al modal SOAP. *"Eso es flujo del doctor, lo verán en la capacitación de doctores."*
- **`/scheduler/budgets` con data vacía** — empty state pelado. Carga 1-2 presupuestos demo antes, o no la abras.
- **Cold start de follow-ups/budgets** — 6+ round-trips secuenciales (ver `docs/research/perf-followups-budgets.md`). Pre-cárgalas en otra pestaña 30 s antes.
- **`/founder/*`** — panel interno, no se demuestra.

---

## 5. Fail-safe durante la demo

- **Nubefact da error** → era config de serie (B001/F001) desbloqueada hoy. Ten una org de demo lista en otra pestaña con boleta exitosa: *"Lo resolvimos esta mañana, te muestro en otra cuenta."*
- **Página lenta (follow-ups/budgets)** → *"Ya identificamos round-trips secuenciales, los fixes están priorizados."* Doc `perf-followups-budgets.md` como respaldo mental, no se muestra.
- **Feature no existe** (import Excel, integración lab, multi-sede) → *"Hoy no. Lo anotamos en review quincenal. Esta semana podemos hacer [alternativa]."* NO prometas fechas.
- **Error 500 / pantalla blanca** → F5, sigue. *"Cambios de anoche, lo reviso después; no afecta tu flujo del lunes."*
- **"¿Reemplazas a Omnia?"** → *"Conviven. Yenda = agenda, cobros, facturación, presupuestos, seguimientos. Omnia sigue con la HC clínica."*

---

## 6. Coordinación de capacitaciones

Basado en `docs/vitra-training-script.md` (script de 45 min para todo el equipo). Para Vitra, dado el tamaño (3 doctores + 1 obstetra + recepcionista + admin), conviene **distribuir en 4 sesiones** durante semana 1 del trial. Plantilla sugerida:

| Día | Sesión | Asistentes | Duración | Foco |
|---|---|---|---|---|
| Lun AM | **Recepcionistas** | 1-2 personas | 45 min | Scheduler, crear cita con DNI, sidebar, cobros, subir consentimiento desde celular, emisión Nubefact |
| Lun PM | **Administradora 1-on-1** | admin | 30 min | Dashboard, reportes (operacional + financiero), settings, gestión de equipo, addon config |
| Mar AM | **Obstetra / advisor fertilidad** | 1 persona | 45 min | Doble rol (atiende citas + gestiona seguimientos), `/scheduler/follow-ups`, `/scheduler/budgets`, plantillas WhatsApp |
| Mar/Mié | **Doctores (grupal)** | 3 doctores | 30 min | Nota clínica ligera (lo mínimo que firmen), recetas, órdenes de exámenes, plan de tratamiento. Reconoce que la HC pesada queda en Omnia. |

**Reglas operativas:**
- Graba cada sesión por Loom — queda para onboarding de staff nuevo y para próximas clínicas.
- No dejes que nadie se vaya sin haber creado al menos 1 cita real (o de prueba) durante su sesión.
- Pre-crea un paciente "Test Vitra" para que no improvisen datos en vivo.
- Acuerda en el meeting **dónde van a reportar bugs** (WhatsApp tuyo o el doc `docs/vitra-feedback-log.md`) y el formato (ver el script).

---

## 7. Activación del trial — checklist

A revisar durante el meeting o inmediatamente después.

- [ ] **Admin con rol `admin` (no `owner`)** — owner debe ser el dueño médico. Acción: `/admin/members` invitar como `admin`.
- [ ] **`fertility_basic` activo + `expires_at` = +30d** — `SELECT * FROM organization_addons WHERE organization_id='<vitra>' AND addon_key='fertility_basic';`
- [ ] **Nubefact emite** — re-emite boleta de prueba mañana temprano para validar.
- [ ] **Series Nubefact (B001/F001)** — `/facturacion`: ambas series con correlativo > 0.
- [ ] **WhatsApp clipboard templates** — mig 139 hizo backfill ✅. Confirma en `/settings` tab WhatsApp Templates.
- [ ] **Email templates fertility** — mig 138 ✅.
- [ ] **Bulk import de pacientes** — NO hay UI. Si traen Excel, plan B = SQL `INSERT` el martes. NO prometas import en vivo.
- [ ] **Perfil de organización (membrete, dirección, RUC)** — `vitra-seed-data.sql` PASO 1-2.
- [ ] **`doctor_schedules` cargados** — PASO 7-8 del seed; pídele horarios reales en el meeting.
- [ ] **Consultorios creados** — PASO 4 (202, 203, Procedimientos, Lab Embriología — confirmar nombres).
- [ ] **Servicios + precios + `requires_consent`** — PASO 6. Crítico: HSG, IIU, punción, transferencia, FIV, ICSI = `requires_consent=true` (Ley 29414).
- [ ] **Invitaciones a recepcionistas** — toma emails en el meeting.
- [ ] **`booking_settings`** — slug `vitra`, accent_color, portal_enabled, allow_online_booking. PASO 3.
- [ ] **Bucket `clinical-files`** 🟡 — confirmar en Supabase dashboard. Si no existe, crear privado con RLS path-based por `org_id` (replicar mig 120).
- [ ] **Sentry alerts activas** — confirma email de prueba.

---

## 8. Métricas de éxito del trial

- **Citas creadas** — `/dashboard` o `count(*) FROM appointments WHERE org=... AND created_at >= inicio`.
- **% cobros con boleta emitida** — ratio `payments` con `einvoice_id` vs total. Target: > 80% al cierre.
- **Seguimientos accionados vs ignorados** (valor del addon) — `clinical_followups` por `status`. Si > 50% en "sin respuesta" = no se está usando.
- **Adopción por rol (logins diarios)** — `auth.users.last_sign_in_at` × `organization_members.role`. Target: ≥ 4 días/sem por rol.
- **Tiempo `appointment.completed_at → einvoice.emitted_at`** — target < 5 min. Si crece a horas = workflow roto.
- **Tickets soporte** — fuente `docs/vitra-feedback-log.md`. Target < 5 P0/P1 al mes.

Programa cada viernes 30 min para extraer métricas vía SQL y meter en `vitra-feedback-log.md`.

---

## 9. Riesgos del trial

1. **No usan addon fertility (siguen WhatsApp manual)** — síntoma: 0 seguimientos accionados sem 1. Prevención: la sesión con la obstetra termina con 1 seguimiento real cerrado en vivo. Detecta vía métrica de seguimientos cada viernes.
2. **Recepcionistas no cargan presupuestos (siguen Excel)** — `/scheduler/budgets` empty sem 1. Prevención: en la capacitación crea 1 presupuesto real. Detecta con `count(*) FROM budget_records` cada viernes.
3. **Admin pide reporte que no existe** (comisiones por doctor, edad promedio) — pregunta proactiva mañana: *"¿qué reporte revisas hoy en Excel que te gustaría acá?"* Anota literal y métele en `COMING-UPDATES.md`.
4. **Caída sin SLA documentado** — acuerda explícito en cierre: *"Trial es best-effort, respuesta < 4h laboral. Caída > 1h te aviso por WhatsApp con causa."*

---

## 10. Cierre — qué dejar acordado

- **Canal soporte:** WhatsApp founder (P0/P1) + email (resto). Documéntalo en `vitra-feedback-log.md`.
- **Check-ins:** viernes 4pm semanal (30 min); sem 1 también martes (ver pilot-checklist Fase 2).
- **Champion interno:** la admin — punto único para decisiones, feedback, escalación a owner médico.
- **Mid-trial:** día 15 (≈ 21-may), 30 min. Revisar uso por rol, bugs, expectativas restantes.
- **Final review:** día 30 (≈ 5-jun), 1h. Formato pilot-checklist Fase 4 (evaluación por módulo 1-10 + decisión comercial).
- **Precio post-trial:** plan Pro con **20-30% descuento primer año** por ser pilot de fertilidad, a cambio de testimonial + derecho a citarlos como caso.
- **Términos de salida:** sin penalidad si cancelan al final. CSV exportable de pacientes/citas/pagos. Ponlo por escrito en email post-meeting.

---

## Anexos rápidos (referencias internas)

- Checklist completo de implementación: `docs/vitra-pilot-checklist.md`
- Script de capacitación detallado: `docs/vitra-training-script.md`
- Log para registrar bugs/feedback durante el trial: `docs/vitra-feedback-log.md`
- Seed SQL para catálogos iniciales: `docs/vitra-seed-data.sql`
- Roadmap del addon fertility (qué está, qué falta, qué es Premium): `docs/coming-updates-fertility-addon.md`
- Performance issues conocidos en follow-ups/budgets: `docs/research/perf-followups-budgets.md`
- Deuda del bucket `clinical-files` (resolver antes del lunes): `docs/research/derma-photos-storage-strategy.md` §3

🟡 **Inconsistencias detectadas (resolver hoy o mañana temprano):**
1. Bucket `clinical-files` usado en código sin migración (`app/api/clinical-attachments/route.ts:80`) — vive solo en dashboard. Confirmar que existe en producción y crear migración 1XX para fijarlo en repo.
2. Páginas `/scheduler/follow-ups` y `/scheduler/budgets` tienen 6+ round-trips secuenciales — pre-cárgalas antes del meeting para evitar TTFB visible en cold start.
3. EmptyState "Próximamente" en `follow-ups/page.tsx:560` y placeholders en `settings/integraciones-tab.tsx:335,575` — evitar abrir esas tabs en la demo.
