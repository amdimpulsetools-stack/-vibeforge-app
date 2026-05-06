# Yenda BASE — MVP Readiness Audit (Vitra pilot, 2026-05-06)

**Scope:** Yenda base SaaS — *sin* addons verticales (`fertility_basic`, `fertility_premium`, `oms_pediatric` quedan fuera).
**Branch auditada:** `claude/add-terms-privacy-fH9H7` · **PRD:** v0.15.3.
**Reviewer:** auditoría read-only, conservadora (redondeo hacia abajo).

---

## 1. TL;DR — Rating MVP y veredicto

**Rating BASE: 7.0 / 10.** El producto cubre el 90 % del flujo operativo de una clínica peruana mediana — auth multi-tenant sólido, scheduler usable, historia clínica completa, facturación electrónica vía Nubefact, pagos, reportes con IA. Pierde puntos por (a) gaps de seguridad reales en portal del paciente y founder (P0/P1 abiertos en `docs/security-review-2026-04-22.md`), (b) UX modal sin a11y en dashboard (`docs/ux-review-2026-04-22.md` P0-1..P0-4), y (c) operatividad pre-pilot incompleta: rate-limit en memoria, logs con PHI, sin proceso de soporte/SLA escrito, bulk-import sin probar a escala.

**Veredicto Vitra trial mañana: GO con caveats** — pero el trial real depende del addon `fertility_basic`. Yenda base por sí solo cubre agendamiento + HC + pagos + Nubefact + portal, lo cual **es suficiente para arrancar el lunes** si el equipo de Vitra sigue el flujo training (ver `docs/vitra-training-script.md`). Sin embargo, lo que Vitra firmó incluye seguimientos automatizados de fertilidad, KPIs de presupuestos y cards de budgets — **eso vive en `fertility_basic`**. Sin el addon activo, el pilot pierde su diferenciador comercial.

**Top 3 riesgos si Vitra empieza mañana:**

1. **Sin pipeline de soporte definido.** No hay SLA por escrito, ni canal único (¿WhatsApp? ¿Slack? ¿correo?). Si el viernes se cae el scheduler a las 2 PM, ¿quién contesta? El `vitra-pilot-checklist.md` lo lista como TODO sin owner.
2. **Bugs de seguridad portal/founder con PHI expuesta.** F-01/F-02 en `docs/security-review-2026-04-22.md` — portal del paciente puede filtrar pagos cross-tenant si hay colisión de plan_id; cancel UPDATE no re-valida org. No es teórico: si Vitra activa portal del paciente, esto está vivo. Mitigación rápida: dejar `booking_settings.portal_enabled = false` la primera semana.
3. **Performance Phase 2/3 no aplicada.** Phase 1 (commit `7d96cec`) bajó TTFB 50-70 % en /budgets y /follow-ups, pero no se agregaron índices DB (`docs/research/perf-followups-budgets.md` Fase 2). Con Vitra en producción y volumen real, las páginas de seguimientos van a degradarse a las 4-6 semanas.

---

## 2. Por dimensión — rating /10 con razones

| Dimensión | Rating | Justificación |
|---|---|---|
| **Auth & multi-tenant** (RLS, roles, invitaciones) | **8.5** | Multi-tenant pattern correcto: `get_user_org_ids()` + `is_org_admin()` `SECURITY DEFINER STABLE` (mig 013). Mig 134 endurece flujo invitaciones; mig 122 cierra `is_founder` self-escalation. Roles owner/admin/receptionist/doctor con redirects funcionando (`lib/supabase/middleware.ts:118-185`). Pierde 1.5 pts por: founder 2FA in-memory (F-04, F-10), `clinical_attachments` sin policy UPDATE (F-08), middleware trata `/api` como público (F-26). |
| **Scheduler** (citas, calendario, conflictos, break-time) | **7.5** | Día/semana funcionales, drag&drop, break time default OFF (v0.15.1), filtro consultorio, conflictos detectados. Pierde puntos por O(slots × offices × appts) en `scheduler/day-view.tsx:216-459` (perf F-2, F-3) — perceptible en clínicas con 4+ doctores; modal sin `role="dialog"` (UX P0-1, `appointment-form-modal.tsx:668`); `confirm()` nativo para delete (UX P0-4); drag móvil no funciona (touch handlers ausentes). |
| **Pacientes** (CRUD, búsqueda, drawer, historia clínica) | **7.5** | CRM robusto: 25+ columnas, tags, filtros avanzados, debt indicator, badge "Recurrente", DNI/CE/Pasaporte, ubigeo. Bulk import existe (`bulk-import-modal.tsx`, 858 líneas) pero no probado a escala. Búsqueda `ilike %q%` sobre 4 columnas sin trigram (perf F-11) — degrada >5k pacientes. Drawer hover-only para tag-remove (UX P1-11), fetches sin pagination (perf F-13). |
| **Historia clínica / SOAP** (notas, dx CIE-10, timeline, consentimientos) | **8.5** | Lo más fuerte del producto. SOAP vertical, motivo de consulta como subjective, múltiples Dx CIE-10 por nota (mig 124), timeline cards colapsables, recetas + exámenes + adjuntos por consulta, firma digital, consentimiento informado digital MVP (mig 120-121, 123). Pierde 1.5 pts por: signing irreversible vía `confirm()` nativo (UX P0-3), auto-save sin `aria-live`. |
| **Doctores / consultorios** (CRUD, asignación, permisos) | **8.0** | Doctor schedules con office restriction, doctor_services N:N, UNIQUE INDEX doctor (mig 135). Empty states guiados (v0.15.1). Doctor dashboard moderno con clinical modules. Detalle admin tiene `select("*")` innecesario (perf F-26), pero no rompe. |
| **Pagos** (registro, métodos, descuentos) | **7.5** | `appointment_payments` + `patient_payments`, descuentos inline con razón, códigos de descuento (admin/discount-codes), métodos configurables vía lookup_values. KPI revenue solo cuenta `withContact` para módulo seguimientos — honestidad metrica (v0.15.2). Falta caja diaria / cierre por turno: `grep -i "caja|cash-close"` → 0 hits. Recibos imprimibles solo vía PDF receta/exámenes; F3 (recibo SUNAT físico) sigue marcado como pendiente en `EVALUACION-SAAS-Y-ROADMAP.md`. |
| **Facturación electrónica (Nubefact)** | **6.5** | Wizard pre-llena RUC desde org (v0.13.4), mapper completo (`lib/einvoice/`), endpoints connect/disconnect/test/emit/status, dashboard `/facturacion` read-only con KPIs y NC. Pero **es un MVP**: emisión solo desde sidebar de cita; sin retry queue automático visible; CDR/XML links dependen 100% del provider; tests de connection son sintéticos. Para Vitra (que va a emitir 30-150 boletas/mes) el flujo manual probablemente aguanta, pero el primer rechazo por SUNAT requiere intervención manual del founder. |
| **WhatsApp clipboard** (multi-kind, setting tabs) | **8.0** | Bien resuelto en v0.15.3: 3 kinds (post_appointment, second_consultation_followup, budget_followup), seed automático por org, addon-gated, toolbar B/I/S con marcadores WA, picker emojis, dual buttons device-aware (móvil → wa.me, desktop → copy). Cache de promesas a nivel módulo. Limitación honesta: **no es envío automático**, es copy-paste. Para Vitra esto cubre el 80% del caso de uso. |
| **Google Calendar sync** (one-way) | **7.0** | Org-level OAuth, sync one-way al crear cita (`app/api/integrations/google/sync-appointment`), config en /integraciones. Nota en `lib/google-calendar.ts:14`: si la integración falla persistentemente se desactiva. No reviewed code ahí — riesgo medio: si el token expira en mid-pilot, las citas dejan de syncearse silenciosamente. |
| **Reportes** (financiero, operacional, dashboards) | **8.0** | 4 reportes (financial/marketing/operational/retention) + AI summary panel + export CSV/PDF/Excel. RPC `get_admin_dashboard_stats` consolida ~15 queries en una. Retention con LTV + at-risk patients. Pierde por: re-fetch shotgun en page.tsx (perf F-10), recharts importado eagerly en 5 componentes (perf F-21). |
| **Settings / configuración** | **8.5** | UX redesign Settings/Módulos al estilo /integraciones (v0.15.0), agrupación por status, empty states (v0.15.1). Tabs cubren: org, módulos, integraciones, email, scheduler, booking, WhatsApp clipboard, WhatsApp config, plantillas WA, permissions, clinical templates. Bien organizado. |
| **Tour interactivo / onboarding** | **6.5** | Tour driver.js implementado (v0.15.1) — bien. Pero post-registro no hay wizard guiado ("agrega tu primer doctor → consultorio → servicio") — lo señaló `EVALUACION-SAAS-Y-ROADMAP.md` y sigue abierto. Empty states sí están en /admin/services, /admin/doctors, /admin/offices, /patients, /scheduler. |
| **Empty states** (todas las páginas) | **8.0** | Cubiertos en superficies clave (v0.15.1). Doctor dashboard sin empty state hero claro (UX P1-14). |
| **Mobile responsive** | **5.5** | Honesto: scheduler `min-w-[600px]` requiere scroll horizontal en mobile (UX); drag desktop-only; modales usan overlay manual sin focus trap; portal sí está optimizado mobile pero el dashboard NO. Para Vitra esto importa: las recepcionistas peruanas usan celular/tablet con frecuencia. |
| **Errores / robustez** | **6.0** | Sentry conectado, toasts vía Sonner, error.tsx por route group. Pero: 5 lugares con `alert()`/`confirm()` nativo (UX P0-2..P0-4), `/book` errores aparecen al top de página fuera del viewport (UX P0-5), notifications fire-and-forget sin await (perf F-38). Booking público sin sessionStorage — refresh borra el formulario (UX P0-7). |
| **Performance** (TTFB, build size, queries) | **6.5** | Phase 1 perf aplicada (commit `7d96cec`): -50-70 % en /budgets, -30-40 % en /follow-ups. RPC consolidation ya hecha en dashboard. Pero Phase 2 abierta: índices DB faltantes (`perf-followups-budgets.md`), framer-motion + motion ambos instalados (8.5MB doble bundle, perf F-24), recharts/jspdf/xlsx no dynamic-imported, `lookup_values` sin compound index. Middleware RPC corre en cada request (perf F-28). |
| **Seguridad** (RLS, leaks, input validation, secrets) | **5.5** | RLS pattern correcto en tablas críticas. Pero `docs/security-review-2026-04-22.md` lista **2 P0 + 9 P1 abiertos**: portal cross-tenant (F-01/F-02), magic-link plaintext en URL+DB (F-03), founder 2FA in-memory + cookie no validada (F-04/F-10), rate-limiter in-memory inútil en Vercel (F-05), clinical-attachments GET sin org check (F-06), AI assistant sin column allowlist (F-11), MP webhook test-mode acepta `APP_USR-` como test (F-19 — riesgo si secret falta en prod). Para Vitra: SI activan portal del paciente con datos PHI reales, F-01 es exposable. |
| **i18n** (es/en) | **6.5** | `language-provider.tsx` 1282 líneas, ES + EN. Pero `docs/ux-review-2026-04-22.md` lista anglicismos vivos ("Break Time" en UI hispanohablante, "Programada" → debería ser "Agendada" en LATAM). Cobertura razonable pero con tono inconsistente. |

---

## 3. Lista concreta de bugs / features incompletas

`grep -rn "TODO\|FIXME\|XXX\|HACK"` en app/components/lib → **solo 4 hits** (limpieza buena):
- `app/api/notifications/send/route.ts:168` — `TODO: generate public links` para `{{link_cancelar}}`. 🟡 Vitra lo va a notar en el primer email.
- `lib/pdf/informed-consent-html.ts:3,9` — PDF de consentimiento es HTML imprimible (no PDF real, falta Puppeteer). 🟡 Vitra usa consentimientos físicos hoy; si cambian a digital, esto importa.
- `lib/sunat/ubigeo.ts:11` — catalogo INEI parcial. 🟢

**Bugs / gaps por severidad:**

🔴 **Blocker para trial start (resolver antes/durante Lunes):**
- F-01/F-02 portal cross-tenant: **mitigar dejando `portal_enabled=false` la primera semana** (no requiere code fix). De lo contrario es bloqueante.
- Soporte sin owner asignado (sección 6).
- Testing smoke-test del checklist Vitra fase 0 (`vitra-pilot-checklist.md` líneas 79-92): hay que correrlo manualmente HOY.

🟡 **Important — fix dentro de la primera semana:**
- F-04/F-10 founder 2FA broken en serverless. No bloquea Vitra (no son founders) pero rompe operación interna.
- F-05 rate-limit in-memory: AI assistant, magic-link, MP webhook expuestos a abuse.
- F-19 MP webhook prod-prefix tratado como test → si `MP_WEBHOOK_SECRET` está vacío en prod, webhooks se aceptan sin firma.
- UX P0-1..P0-4 modales sin a11y. Vitra no usa lectores de pantalla pero ESC-to-close es UX básica.
- Bulk import patients no probado >100 filas (Vitra trae ~150 pacientes existentes).
- Recordatorios automáticos solo email; F6 Fase 2 (envío automático WhatsApp) sigue pendiente.

🟢 **Nice-to-have — diferir post-trial:**
- Receipt printing (F3), confirm 1-click (F4), portal del paciente Phase 2.
- Performance Phase 2 (indexes + React Query), Phase 3 (KPIs materializados).
- i18n pulido de tono (Programada → Agendada, Break Time → Descanso).
- Mobile dashboard scheduler (min-w-600 hace scroll horizontal en celular).

---

## 4. Comparación honesta vs competidores

Para una clínica como Vitra (4-7 doctores, fertilidad, ~150 pacientes/mes):

| Competidor | Veredicto vs Yenda BASE |
|---|---|
| **Excel + WhatsApp manual** | **Yenda mejor.** Multi-tenant, RLS, HC SOAP firmable, Nubefact integrado, KPIs automáticos. Excel + WA escala mal pasado los 3 doctores. **Yenda gana claro.** |
| **Doctoralia** | **Diferentes mercados.** Doctoralia = SEO/leads + agenda básica. Yenda = back-office completo. Para Vitra (que ya tiene clientela), **Yenda gana.** |
| **IClinic / Clinic Cloud / SimplyBook** | **Yenda parejo o ligeramente atrás.** IClinic tiene 10 años de pulido UX, prescripción digital con CMP, integración SUNAT más madura, soporte 24/7. Yenda tiene mejor scheduler visual y AI assistant + reportes IA, pero pierde en madurez operativa. **Yenda igual a peor en producción real.** |
| **Sigesoft / Medisis (ERP médico Perú)** | **Yenda mejor en UX, peor en módulos.** Sigesoft tiene caja diaria, inventario, comisiones, multi-sede consolidada, contabilidad PLE. Yenda cubre nada de eso. Para una clínica con admin/contador, Sigesoft sigue siendo el default. Para una clínica que prioriza experiencia digital + portal del paciente + agenda visual, Yenda es mejor. **Mixed — depende de prioridades.** |

**Para Vitra específicamente**: Yenda BASE + addon fertility_basic es **mejor que Excel+WhatsApp** por margen amplio, **competitivo con IClinic**, e **inferior a Sigesoft** en módulos administrativos pesados. Vitra los seleccionó por la diferenciación del addon fertilidad — sin ese addon, la decisión sería más reñida.

---

## 5. Lo que NO está, y si Vitra lo necesita

| Feature | Estado | Vitra lo necesita |
|---|---|---|
| Caja diaria / cierre por turno | ❌ no existe | 🟡 1er mes (la recepcionista la pedirá la semana 2) |
| Inventario médico (insumos) | ❌ no existe | 🟢 3+ meses |
| Recordatorios WhatsApp automáticos | ❌ solo email + clipboard | 🟡 1er mes (clipboard funciona pero requiere acción manual) |
| Reportes contables exportables (PLE SUNAT) | ❌ solo CSV/Excel genéricos | 🟢 3+ meses (su contador externo lo hace por fuera) |
| Comisiones por doctor | ❌ no existe | 🟢 3+ meses |
| Múltiples sedes con vista consolidada | ❌ org única por clínica | 🟢 (Vitra es 1 sede) |
| Portal del paciente con auto-agendamiento | ✅ existe pero P1 abierto | 🟡 (riesgo seguridad — desactivar trial 1) |
| Reservas online sin login | ✅ `/book/[slug]` | 🟢 ya existe |
| Reseñas / NPS post-cita | ❌ no existe | 🟢 3+ meses |
| Multi-moneda | ❌ solo PEN | 🟢 (Vitra cobra en soles) |
| Cargo por anticipado / depósito | ⚠️ parcial (anticipo en form modal) | 🟡 fertilidad cobra anticipos por procedimiento |
| Lista de espera | ❌ no existe | 🟢 3+ meses |
| Bulk import pacientes | ✅ existe pero no probado >100 | 🔴 día 1 (van a importar ~150 pacientes — verificar) |

**Crítico día 1 que Vitra va a necesitar:** Bulk import pacientes funcional. Hay que probarlo HOY con un CSV de 150 filas representativo, no esperar al lunes.

---

## 6. Riesgos operativos durante el trial

- **Soporte técnico sin owner.** `vitra-pilot-checklist.md` lista "Canal de bugs creado (WhatsApp o Google Doc)" como TODO. **Acción requerida**: definir un único canal (recomiendo WhatsApp Business al founder) y un SLA mínimo (respuesta <2h en horario laboral, <8h fines de semana). Comunicarlo al owner de Vitra antes de la firma.
- **Backup / restore.** Supabase managed backups están activos por default, pero **no hay procedimiento documentado** de restore. Si Vitra pierde datos críticos el día 12, ¿el founder sabe ejecutar un PITR? `docs/security-review-2026-04-22.md` lo lista como out-of-scope. Riesgo bajo (Supabase es confiable) pero no nulo.
- **Cap de usuarios / límites del plan.** Verificar que el plan asignado a Vitra acomoda 4-7 doctores + 1-2 recepcionistas + 1 admin + 1 owner. El plan **Centro Médico** (S/349) cubre 6 miembros / 3 doctores — **insuficiente para Vitra**. Necesitan **Clínica** (S/649, 15 miembros / 10 doctores) O Centro Médico + addons (S/10 por miembro extra, S/15 por consultorio extra). **Acción**: confirmar el plan exacto antes de la reunión.
- **Migración de datos.** Bulk import existe pero no es battle-tested. Sugerencia: importar 10 pacientes de prueba en producción HOY, ver cómo se comporta el RLS, los duplicados por DNI, los teléfonos con/sin código país.
- **Caída de servicio.** Vercel + Supabase status pages no están monitoreadas vía hook (no hay statuspage.io ni Sentry uptime). Si Supabase tiene un incidente, el founder se entera por Sentry post-facto. **Acción**: agregar alerts de Sentry sobre 5xx rate y latency p95.

---

## 7. Recomendación final

**Si lanzas mañana:**

GO. Yenda BASE aguanta el trial — el equipo de Vitra puede agendar citas, registrar pacientes, escribir SOAP, firmar notas, cobrar, emitir Nubefact y ver reportes desde el día uno. Lo que **se va a romper**: el portal del paciente si lo activan (riesgo PHI cross-tenant — déjalo `portal_enabled=false` la primera semana); los recordatorios automáticos por email tendrán mock de `link_cancelar` vacío; el bulk import puede sorprender con 150 pacientes; y modales sin ESC van a frustrar al staff la primera tarde. Lo que **NO se va a romper**: el flujo core scheduler→cita→pago→nota→Nubefact, RLS multi-tenant, autenticación, login, navegación. **Ajustes AHORA antes del Lunes**: (1) correr el smoke test completo del `vitra-pilot-checklist.md` líneas 79-92 con un dataset real, (2) confirmar el plan asignado (Clínica, no Centro Médico), (3) definir y comunicar canal de soporte único + SLA, (4) verificar `MP_WEBHOOK_SECRET` está seteado en prod (F-19), (5) documentar al owner de Vitra que el portal del paciente queda desactivado la primera semana por motivos de seguridad (reactivar tras fix F-01/F-02).

**Si pospones 5 días (ROI máximo):**

Día 1-2: fix F-01/F-02 portal (3-4h cada uno) + F-19 MP webhook (30 min) + agregar `aria-label` y ESC handlers a los 4 modales del scheduler (UX P0-1..P0-4, ~4h total). Día 3: aplicar índices del `perf-followups-budgets.md` (1 migración, ~30 min) + dynamic-import de recharts/jspdf/xlsx (perf F-21, ~2h). Día 4: probar bulk import con 200 pacientes reales sintéticos + escribir un runbook de soporte de 2 páginas (qué hacer si X se rompe, contactos, queries SQL útiles). Día 5: smoke test full + re-deploy. Esto te lleva el rating de 7.0 a 7.8 sin tocar nada estructural — el upside real está en *operatividad*, no en features. Si tienes que escoger entre posponer o lanzar mañana, **lanza mañana** y haz estos fixes en paralelo durante la primera semana — Vitra te pagará en feedback más útil que cualquier audit interno.

---

*Auditoría generada read-only el 2026-05-06. No se modificó código ni se hicieron commits. Referencias cruzadas a `docs/EVALUACION-SAAS-Y-ROADMAP.md`, `docs/security-review-2026-04-22.md`, `docs/performance-review-2026-04-22.md`, `docs/ux-review-2026-04-22.md`, `docs/research/perf-followups-budgets.md`, `docs/vitra-pilot-checklist.md`, `PRD.md` v0.15.3.*
