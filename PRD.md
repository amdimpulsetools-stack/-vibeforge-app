# VibeForge — Product Requirements Document (PRD)

> **Última actualización:** 2026-08-07
> **Versión:** 0.15.27
> **Estado (resumen ejecutivo):**
> - **MVP en producción** multi-tenant (RLS), 4 roles + Founder, agenda día/semana con precisión al minuto, pacientes, historia clínica/SOAP completa, reportes, planes 3-tiers (S/129 / S/349 / S/649).
> - **Plan de performance completo (v0.15.27, migs 196-203 — en producción)**: auditoría de 11 especialistas ejecutada en 3 lotes el mismo día, cero cambio visual. Bundle: Sentry Replay/tracing y framer-motion fuera del baseline (219 → 165 kB gz), recharts y modales lazy — /patients 548→260, /dashboard 485→294, /reports 457→279 kB. Datos: usePlan/useOrgAddons/auth deduplicados, TODAS las páginas de lista sobre React Query (volver a una página ya vista = 0 queries, 0 spinner), agregaciones pesadas movidas a RPCs (`get_reports_overview`, `get_einvoices_kpis`, `get_admin_dashboard_stats_v3`, trío de budgets con scope de doctor vía EXISTS, `get_patient_summary`), Seguimientos aplica acciones localmente (~0 ms percibidos), /patients con SSR de página 0. Bonus: 3 bugs de datos corregidos (reports truncaba a 1000 filas, KPI de facturación sobre 50 filas, paginación de presupuestos con filtros). Detalle: Changelog v0.15.27.
> - **Notificaciones en vivo por rol (v0.15.26, mig 192 — activo en producción)**: la campanita del panel deja de ser un broadcast a toda la org. La RPC `notify_org_members()` (SECURITY DEFINER, único camino de escritura) hace fan-out **una fila por usuario destinatario** con routing por rol, y en los eventos de agenda el doctor recibe únicamente los de SUS citas. Matriz de preferencias evento × rol en Settings → Notificaciones (persistida en `organizations.settings.live_notifications`), catálogo en `lib/live-notifications/catalog.ts` y RLS de `notifications` endurecido: cada quien ve y marca solo lo suyo (las filas previas a la migración quedan como LEGACY con `user_id` NULL, visibles para toda la org).
> - **Plugin de presupuestos de la Dra. Patricia (v0.15.26, mig 191)**: 12 plantillas de precio único (`budget_pdf_patricia`) sobre la Capa 2 de plugins per-org, con `service_budget_tiers` sincronizado a los totales que imprime el PDF — la asesora ve al asignar el mismo monto que firma la paciente. Fuente canónica: los `.docx` de la doctora (decisión del founder 2026-08-06: el xlsx de octubre 2025 se ignora). **Pendiente de la doctora**: precios definitivos, datos de Banking y número de colegiatura.
> - **Barrido responsive completo (v0.15.25-26)**: rediseño móvil de Seguimientos + branding WhatsApp (el verde oficial solo en acciones que abren WhatsApp, nunca como acento genérico), full-bleed móvil en las 5 páginas tipo app, fix estructural del overflow horizontal del layout (el gutter de página vive en un div interno, no en el scroller), tabs de la ficha de paciente en pills scrolleables y ~25 fixes de touch targets y wraps. **Escritorio (v0.15.26)**: a pedido explícito del founder, esas 5 páginas pierden también el margen exterior en ≥md y quedan borde-a-borde, como Presupuestos.
> - **Cierre de la superficie RPC (v0.15.26, mig 193 — aplicada en producción)**: 47 funciones `SECURITY DEFINER` de `public` eran ejecutables por `anon` (varias con fugas cross-tenant). Se revoca `EXECUTE` a `PUBLIC`/`anon` salvo una allowlist mínima (el flujo pre-login por token y los helpers de policies RLS keyed en `auth.uid()`), se fija `search_path` en todas y se revocan los default privileges para que ninguna función futura nazca abierta.
> - **Addon vertical Fertilidad end-to-end** (`fertility_basic`): seguimientos automatizados con atribución honesta (categorías A/B/C), embudo de presupuestos con tiers A/B/C, generador de PDF per-org, lifecycle de tratamiento (por iniciar → en curso → completado) y crons de recordatorio.
> - **Seguimientos core para todas las orgs (v0.15.24-25, migs 182-188)**: la bandeja `/scheduler/follow-ups` deja de estar gateada por el addon — cualquier org tiene seguimientos de primera clase sin configuración: default "control a los N días" por servicio + checkbox del doctor al completar la cita + cierre automático vía categoría centinela `core.next_visit` cuando el paciente agenda cualquier cita futura (atribución honesta Cat A/B intacta). Fase 2 (v0.15.25): origen polimórfico `source_type`/`source_id` (cada seguimiento sabe de qué nació), sesión de plan perdida → seguimiento automático (trigger DB, apagado por defecto para orgs existentes vía `organization_followup_settings` sin backfill, toggle en Settings → Agenda), plan cancelado/completado cierra sus seguimientos (`plan_cancelled`/`plan_completed`), chip de seguimientos abiertos en la ficha de la cita, deep-link del widget del doctor, y módulo genérico renombrado a `lib/followups/` + `useFollowupCapabilities()`. Revelación progresiva: KPIs de revenue, filtro por regla y journey multi-etapa siguen siendo del addon. Diseño completo: `docs/research/seguimientos-genericos-core.md`.
> - **Sistema de presupuestos multi-perfil (v0.15.23, migs 180-181)**: las 7 plantillas FIV del plugin Vitra completas (CRIO/IIU/TED/OVODON/DUO STIM/ROPA + FIV) con honorarios múltiples y reparto proporcional del ajuste; **modos de presupuesto por org** en `org_budget_pdf_settings` — `documents_enabled=false` (solo asignación y seguimiento, sin PDF, con guards server-side) y `pricing_mode='single'` (precio único por tratamiento, UI sin tiers, `tier='A'` interno sin cambios de contrato). Perfil clínica chica (Dra. Patricia) onboardeable sin imponerle el modelo Vitra.
> - **2 pilotos comerciales activos** desde 2026-07-03 (Vitra — fertilidad + Dra. Quispe); trials extendidos al 07-sep, mecanismo de cobro Wave 2 MP pendiente.
> - **Facturación electrónica SUNAT** vía Nubefact (boletas/facturas/notas de crédito desde la cita, pagos parciales, mapeo Catálogo 59, warning bancarización Ley 28194).
> - **Billing Mercado Pago con período de gracia** (mig 144) + cancelación self-serve (Wave 1); Wave 2 (cambio de plan sincronizado con MP + reactivación) pendiente.
> - **Seguridad y billing operativos endurecidos pre-piloto (v0.15.21)**: red anti-doble-cobro en el webhook MP (`cancelSupersededSubscriptions`), consolidación de asientos (mig 177) que desbloqueó a los 2 pilotos, hardening de seguridad con cierre de fuga cross-tenant crítica (mig 178), y crons revividos vía CRON_SECRET + Cron Bridge (GitHub Actions) con primera corrida real de billing-status.
> - **Mensajería WhatsApp Business API operativa end-to-end (v0.15.22)**: primer WhatsApp automático real de la historia de Yenda (confirmación de cita, 2026-07-22) con el pipeline endurecido tras la auditoría pre-test (normalización E.164 peruana, canal WA independiente del email, pre-validación de reglas ocultas de Meta, guard anti-duplicados), UX de conexión/desvinculación, pestaña **Notificaciones** con matriz evento×canal, espejo nocturno en Google Sheets (mig 179) y precio personalizado por cita.
> - **Hardening legal y de seguridad**: Ley 29733 / 29414, consentimiento informado digital (mig 120), 2FA opcional, límite de dispositivos anti-sharing (mig 156), audit log de acceso a HC (NTS 139).
> - **Sistema de módulos verticales** (addons) con Curvas de Crecimiento OMS (pediatría) como primer vertical + catálogo de especialidades editables (mig 119).
> - **Landing/pricing** saneados (S/ sin duplicar $, Excel como competidor real) + sección "Yenda no deja de crecer" con teasers de próximas features.
>
> _Historial detallado de cambios: ver **[CHANGELOG.md](CHANGELOG.md)** (orden cronológico ascendente)._

---

## Índice

- [1. Visión del Producto](#1-visión-del-producto)
- [2. Stack Técnico](#2-stack-técnico)
- [3. Arquitectura Multi-Tenant](#3-arquitectura-multi-tenant)
- [4. Roles y Permisos](#4-roles-y-permisos)
- [5. Planes y Suscripciones](#5-planes-y-suscripciones)
- [6. Modelo de Datos (Tablas Principales)](#6-modelo-de-datos-tablas-principales)
- [7. Flujos Principales](#7-flujos-principales)
- [8. Estructura de Rutas](#8-estructura-de-rutas)
- [9. Navegación del Sidebar](#9-navegación-del-sidebar)
- [10. Configuración por Organización](#10-configuración-por-organización)
- [11. Integraciones Externas](#11-integraciones-externas)
- [12. Features Implementadas (Estado Actual)](#12-features-implementadas-estado-actual)
- [13. Hooks y Componentes Clave](#13-hooks-y-componentes-clave)
- [14. Convenciones de Código](#14-convenciones-de-código)
- [15. Comandos de Desarrollo](#15-comandos-de-desarrollo)
- [16. Variables de Entorno Requeridas](#16-variables-de-entorno-requeridas)
- [17. Notas para Sesiones de Desarrollo](#17-notas-para-sesiones-de-desarrollo)
- [17.5. Roadmap — Visual Builder de Templates de Presupuesto](#175-roadmap-visual-builder-de-templates-de-presupuesto)
- [18. Sistema de Especialidades Médicas](#18-sistema-de-especialidades-médicas)
- [19. Historial de cambios](#19-historial-de-cambios)

---

## 1. Visión del Producto

**VibeForge** es un sistema SaaS de gestión de consultorios y clínicas médicas, diseñado para el mercado latinoamericano (Perú como mercado inicial). Permite a doctores independientes, centros médicos y clínicas grandes administrar citas, pacientes, pagos, reportes y equipo de trabajo desde una sola plataforma web.

### Propuesta de Valor
- **Multi-tenant:** Cada organización tiene datos completamente aislados vía RLS
- **Multi-rol:** Owner, Admin, Recepcionista, Doctor — cada uno ve solo lo que necesita
- **Planes escalables:** Desde doctor independiente (gratis) hasta clínica con 10+ doctores
- **Mercado LATAM:** Interfaz en español, pagos con Mercado Pago, moneda en soles (S/.)

---

## 2. Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Auth & DB | Supabase (Auth, Database, Storage) |
| Estilos | Tailwind CSS 4 + shadcn/ui |
| Formularios | React Hook Form + Zod |
| Data fetching | TanStack React Query |
| Tablas | TanStack React Table |
| Gráficas | Recharts |
| Íconos | Lucide React |
| Toasts | Sonner |
| Animaciones | Framer Motion |
| Pagos | Mercado Pago SDK |
| Monitoreo | Sentry (@sentry/nextjs) |
| Emails | Nodemailer (SMTP) |
| Fuentes | Plus Jakarta Sans, Outfit, JetBrains Mono |

---

## 3. Arquitectura Multi-Tenant

### Modelo de Aislamiento
- Cada usuario al registrarse crea automáticamente una **organización**
- Todas las tablas de negocio tienen columna `organization_id` (FK)
- RLS en cada tabla filtra por `organization_id IN (SELECT get_user_org_ids())`
- Funciones helper: `get_user_org_ids()`, `is_org_admin(org_id)`

### Tipos de Organización
| Tipo | Descripción |
|------|------------|
| `independiente` | Doctor solo, 1 consultorio |
| `centro_medico` | Equipo pequeño, 2+ consultorios |
| `clinica` | Equipo grande, alto volumen |

---

## 4. Roles y Permisos

| Rol | Nivel | Permisos |
|-----|-------|----------|
| **Owner** | Dueño de la organización | Todo. Gestión de plan, billing, eliminar org |
| **Admin** | Administrador | Todo excepto billing. Gestionar miembros, configuración, reportes |
| **Receptionist** | Recepcionista | Agendar citas, gestionar pacientes, ver scheduler como vista principal |
| **Doctor** | Especialista/Doctor | Ver solo sus propias citas, dashboard personal con métricas propias |
| **Founder** | Superusuario de plataforma | Dashboard cross-org con métricas globales (flag `is_founder` en `user_profiles`) |

### Restricciones por Rol en UI
- **Doctor:** No puede interactuar con citas de otros doctores en el scheduler. No puede reprogramar citas. Solo puede cancelar sus propias citas con motivo obligatorio. Restringido a consultorios asignados en su horario
- **Receptionist:** Redirigido a `/scheduler` como página principal
- **Admin/Owner:** Ve dashboard administrativo con KPIs globales de la org. Puede cancelar y reprogramar cualquier cita
- **Non-admin:** Ve mensaje "acceso denegado" en `/settings` y secciones admin
- **Owner+Doctor (Independiente):** Dashboard dual: AdminDashboard + sección colapsable "Mi Consulta" con DoctorDashboard

---

## 5. Planes y Suscripciones

> **Decisiones canónicas (sticky — leer antes de la tabla):**
> 1. **Citas: ilimitadas en los 3 planes.** Documentado en el soft-wall scope (v0.15.16, líneas ~4174-4184): el cap de citas defiende cero revenue y rompe operación al cliente; no se enforced. Cualquier número que aparezca en landing, `/select-plan` o DB (`plans.max_appointments_per_month`) debe alinearse a `NULL`/ilimitado. Si una versión histórica del PRD decía "100/mes" o "500/mes", queda obsoleta.
> 2. **Pacientes: ilimitados en los 3 planes** (2026-06-02). El cap `max_patients` era acumulado total (`count(*) FROM patients`, sin reset mensual), penalizaba a los clientes con más antigüedad sin defender ningún costo real (las filas de pacientes son baratísimas). Hoy solo emitía toasts molestos — `plan-limit-warner` ya no lo evalúa. Si una versión histórica del PRD decía "150 pacientes" o "1.000 pacientes", queda obsoleta.
> 3. **Diferenciadores reales entre planes:** seats (miembros/doctores/recepción), consultorios, storage, AI queries, módulo Seguros (solo Clínica), reportes/export, soporte. No appointments, no patients.
> 4. **Clínica = 15 miembros totales** (10 doctores + 3 recepción + 1 admin + 1 owner). **Centro Médico = 6 totales** (3 doctores + 2 recepción + 1 admin + 0/1 owner-as-doctor). **Independiente = 2 totales** (1 doctor + 1 recepcionista, el doctor es el owner). Si la DB difiere, la DB se alinea al PRD vía migración aparte — no al revés.
> 5. **Soft-wall actualmente enforced (v0.15.16+):** members (rol-aware: admins/doctor_members/receptionists), offices. NO enforced: patients (cap removido), appointments, AI queries (Phase 2), storage (Phase 2 con Dermatología).

### Plan Independiente (Starter) — S/129/mes (S/1,290/año con 2 meses gratis)
- 2 miembros totales: 1 doctor (owner) + 1 recepcionista
- 1 consultorio
- Pacientes y citas ilimitados, 100MB storage
- Sin admins adicionales
- Reportes básicos, AI Assistant (30 consultas/mes), sin exportación
- Owner actúa simultáneamente como doctor (rol dual)
- **Trial 14 días disponible**

### Plan Centro Médico (Professional) — S/349/mes (S/3,490/año con 2 meses gratis)
- 6 miembros totales, 3 doctores, 3 consultorios, 2 recepcionistas
- Pacientes y citas ilimitados, 2GB storage
- 1 admin
- Reportes + exportación + AI Assistant
- Add-ons: S/15/consultorio extra, S/10/miembro extra
- **Trial 14 días disponible**

### Plan Clínica (Enterprise) — S/649/mes (S/6,490/año con 2 meses gratis)
- 15 miembros totales: 10 especialistas + 3 recepcionistas + 1 admin + 1 owner
- 10 cupos para doctores/especialistas/licenciados (ej. psicólogos)
- 10 consultorios
- 3 recepcionistas
- 1 admin
- Pacientes y citas ilimitados, 10GB storage
- Todas las features (reportes, export, AI, API, soporte prioritario)
- Add-ons: S/12/consultorio extra, S/8/miembro extra
- **Trial desactivado** — contratación directa (decisión 2026-04-26 para reservar el plan a clientes calificados; reactivar cuando el feature de "Reporte IA avanzado" esté listo y justifique el upgrade)

### Política de pricing (v0.13.4 — 2026-04-26)
- Los precios anteriores (Gratis / S/49 / S/149) eran iniciales y no reflejaban realidad comercial. La landing mostraba paralelamente S/69.90 / S/169.90 / S/569.90; ambas fuentes quedaron alineadas en v0.13.3 a S/129 / S/349 / S/649.
- **Organizaciones existentes en el plan gratuito no se migran automáticamente.** El owner decide cuándo convertirlas. Las suscripciones activas conservan el precio del momento de la contratación hasta su renovación.

### Frecuencias de cobro (v0.13.4)

| Frecuencia | Descuento | Equivale a | Disponible en |
|---|---|---|---|
| **Mensual** | 0% | precio base | landing, /select-plan, /plans, MP checkout |
| **Semestral** | **8.3%** ("medio mes gratis") | pagar 5.5 meses por 6 | landing, /select-plan, /plans, MP checkout |
| **Anual** | **16.7%** ("2 meses gratis") | pagar 10 meses por 12 | landing, /select-plan, /plans, MP checkout |

Curva progresiva 0% → 8% → 17% — cada compromiso adicional gana ~8 puntos. El semestral nunca empata con anual, así que sigue siendo coherente promover el upgrade.

Cobros únicos por cadencia (con precios v0.13.4):
- Independiente: S/129/mes · S/709.50/semestre · S/1,290/año
- Centro Médico: S/349/mes · S/1,919.50/semestre · S/3,490/año
- Clínica: S/649/mes · S/3,569.50/semestre · S/6,490/año

Backend: `lib/validations/api.ts:mpCheckoutSchema.billing_cycle` acepta `"monthly" | "semiannual" | "yearly"`. `app/api/mercadopago/checkout/route.ts` mapea a frequency 1/6/12 meses (todos soportados por MP preapproval).

### Integración de Pagos
- **Mercado Pago** como gateway de pago
- Flujo: Selección de plan → Checkout MP → Webhook confirma → Suscripción activada
- Tabla `organization_subscriptions` trackea estado: `active`, `trialing`, `past_due`, `cancelled`, `expired`
- Tabla `plan_addons` para extras comprados (consultorios/miembros adicionales)

---

## 6. Modelo de Datos (Tablas Principales)

### Autenticación y Usuarios
| Tabla | Propósito |
|-------|----------|
| `auth.users` | Usuarios de Supabase Auth (email + Google OAuth) |
| `user_profiles` | Extensión: full_name, avatar_url, avatar_option, phone, whatsapp_phone, professional_title, is_founder |
| `organizations` | Tenant: name, slug, logo_url, organization_type, is_active, accent_theme (mig 190), settings (JSONB: restrict_doctor_patients, `live_notifications` — matriz evento × rol de la campanita, etc.) |
| `organization_members` | Relación user↔org con role (owner/admin/receptionist/doctor) |
| `organization_invitations` | Invitaciones pendientes con token, email, role |

### Gestión Clínica
| Tabla | Propósito |
|-------|----------|
| `offices` | Consultorios/salas: name, code, phone, address, display_order |
| `doctors` | Doctores: name, specialty, cmp, user_id (link a cuenta), default_meeting_url, is_active |
| `doctor_services` | Relación N:N doctor↔servicio |
| `doctor_schedules` | Horarios semanales por doctor (día, hora inicio/fin, office_id para restricción de consultorio) |
| `service_categories` | Categorías de servicios (General, Dental, etc.) |
| `services` | Servicios médicos: name, duration_minutes, base_price, category_id, modality (in_person/virtual/both) |

### Citas y Pacientes
| Tabla | Propósito |
|-------|----------|
| `appointments` | Citas: patient_name, doctor_id, office_id, service_id, date, start/end_time, status, origin, payment_method, responsible, notes, price_snapshot, meeting_url |
| `appointment_edit_history` | Historial de cambios en citas |
| `appointment_payments` | Pagos asociados a citas |
| `patients` | Directorio: dni, document_type (DNI/CE/Pasaporte), first_name, last_name, phone, email, birth_date, sex (male/female — requerido para percentiles OMS), departamento, distrito, is_foreigner, nationality, status, origin, referral_source, custom_field_1, custom_field_2, notes |
| `patient_anthropometry` | Mediciones antropométricas longitudinales: measurement_date, weight_kg, height_cm, head_circumference_cm, notes, recorded_by. Usado por el addon `growth_curves` para graficar percentiles OMS |
| `patient_tags` | Etiquetas/badges por paciente |
| `patient_payments` | Pagos por paciente (puede estar linkeado a appointment) |
| `schedule_blocks` | Bloques de tiempo no disponible en el scheduler |
| `clinical_notes` | Notas clínicas SOAP por cita: subjective, objective, assessment, plan, diagnosis_code/label, vitals (JSONB), is_signed, internal_notes |
| `clinical_templates` | Plantillas SOAP reutilizables: name, specialty (15 predefinidas), is_global, SOAP pre-llenado, diagnosis por defecto |
| `treatment_plans` | Planes de tratamiento: title, description, diagnosis_code/label, status (active/completed/cancelled/paused), total_sessions, start_date, estimated_end_date |
| `treatment_sessions` | Sesiones individuales de un plan: session_number, status (pending/completed/missed/cancelled), notes, completed_at, appointment_id opcional |
| `prescriptions` | Recetas médicas: medication, dosage, frequency (12 opciones), duration, route (12 vías: Oral, IM, IV, Tópica, etc.), instructions, quantity, is_active |
| `clinical_attachments` | Archivos adjuntos médicos: file_name, file_type, file_size, storage_path, category (general/lab_result/imaging/referral/consent/other) |
| `clinical_followups` | Seguimientos clínicos (semáforo): priority (red/yellow/green), reason, follow_up_date, is_resolved, resolved_at, resolved_by, notes |
| `clinical_note_versions` | Auditoría de notas: version_number, change_summary, snapshot de contenido SOAP + vitals + diagnóstico |

### Configuración
| Tabla | Propósito |
|-------|----------|
| `global_variables` | Variables de configuración por org (clinic_name, phone, currency, etc.) |
| `lookup_categories` | Categorías de catálogos (origin, payment_method, appointment_status, responsible) |
| `lookup_values` | Valores de cada catálogo con label, value, color, display_order |
| `email_settings` | Config SMTP por org: sender_name, sender_email, reply_to_email, brand_color, email_logo_url |
| `email_templates` | Templates de email: slug, category, subject, body, is_enabled, channel, timing_value/unit, min_plan_slug |
| `scheduler_settings` | Config de agenda por org: start_hour, end_hour, intervals, time_indicator, disabled_weekdays (persistido en DB) |
| `booking_settings` | Config de reservas públicas por org: is_enabled, max_advance_days, min_lead_hours, campos requeridos |

### Planes y Billing
| Tabla | Propósito |
|-------|----------|
| `plans` | Catálogo de planes con límites y feature flags |
| `organization_subscriptions` | Suscripción activa de cada org (plan_id, status, fechas, external_id) |
| `plan_addons` | Extras comprados (consultorios/miembros adicionales) |
| `payment_history` | Historial de transacciones de Mercado Pago (mp_payment_id, amount, status, payment_type) |

### AI
| Tabla | Propósito |
|-------|----------|
| `ai_conversations` | Conversaciones del asistente AI |
| `ai_messages` | Mensajes individuales de cada conversación |

### Módulos / Addons (Verticalización por especialidad)
| Tabla | Propósito |
|-------|----------|
| `addons` | Catálogo global de módulos: key, name, description, category (specialty/workflow/clinical), specialties[] (slugs a los que aplica), icon, is_premium, min_plan, sort_order |
| `organization_addons` | Activación por org: organization_id, addon_key, enabled, settings (JSONB), activated_at, activated_by |

### Founder (Superusuario de plataforma)
| Tabla | Propósito |
|-------|----------|
| `founder_notes` | Notas privadas del founder por organización (seguimiento comercial) |
| `owner_lifecycle_events` | Eventos de ciclo de vida de owners: signup, trial_start, plan_upgrade, churn, etc. Usado para el embudo del founder panel |

### RPCs (Funciones de Base de Datos)
| Función | Propósito |
|---------|----------|
| `get_user_org_ids()` | Retorna org IDs del usuario actual |
| `is_org_admin(org_id)` | Verifica si el usuario es admin/owner |
| `get_org_plan(org_id)` | Retorna plan actual con límites y suscripción |
| `get_org_usage(org_id)` | Retorna uso actual (miembros, doctores, pacientes, etc.) |
| `get_founder_stats()` | Métricas globales de plataforma (solo founder) |
| `get_doctor_personal_stats(user_id, org_id)` | Métricas personales del doctor |
| `ai_readonly_query(query)` | Ejecuta SELECT con RLS para el AI assistant |
| `handle_new_user()` | Trigger: crea perfil, org, seeds datos iniciales al registrarse |
| `ensure_user_has_org()` | Auto-healing: crea org si el usuario quedó huérfano |
| `accept_invitation(token)` | Procesa invitación: vincula usuario a org con rol asignado |
| `seed_email_templates(org_id)` | Crea 24 templates de email por defecto para org nueva (último: mig 173) |
| `find_user_by_email(email)` | Busca user_id por email (para invitaciones) |
| `is_doctor_patients_restricted(org_id)` | Verifica si la org restringe visibilidad doctor↔pacientes |
| `get_user_org_role(org_id)` | Retorna rol del usuario en una org específica |
| `get_admin_dashboard_stats(...)` | Dashboard admin consolidado: todas las métricas (pacientes, doctores, citas, ingresos, tratamientos, heatmap) en una sola llamada |
| `get_retention_overview(p_date_from, p_date_to)` | KPIs de retención: pacientes totales, nuevos, recurrentes, tasa de retención |
| `get_visit_frequency(p_date_from, p_date_to)` | Frecuencia de visita: promedio y mediana de días entre visitas |
| `get_at_risk_patients(p_months_threshold)` | Pacientes en riesgo de abandono según umbral de meses sin visita |
| `get_patient_ltv(p_limit)` | Top pacientes por Lifetime Value: revenue total, visitas, promedio por visita |
| `get_retention_trend(p_months)` | Tendencia mensual de retención: nuevos vs recurrentes por mes |
| `get_org_peer_user_ids()` | SECURITY DEFINER: retorna user_ids de la misma org (evita recursión RLS en user_profiles) |
| `get_own_is_founder()` | SECURITY DEFINER: retorna is_founder del usuario actual (evita recursión RLS en UPDATE de user_profiles) |
| `org_select_patients(org_id)` | Pacientes visibles para el doctor actual (todos o solo created_by según config org) |
| `get_user_session_check()` | Validación de sesión: retorna memberships ordenadas por org con suscripción activa |
| `notify_org_members(...)` | SECURITY DEFINER (mig 192): único camino de escritura en `notifications`. Fan-out de una fila por usuario destinatario según el routing por rol de la org; en eventos de agenda filtra al doctor dueño de la cita |

> **Superficie de ejecución (mig 193, 2026-08-07):** todas las funciones `SECURITY DEFINER` de `public` tienen `EXECUTE` revocado a `PUBLIC`/`anon` salvo la allowlist mínima (`get_invitation_by_token` para el flujo pre-login por token, y los helpers usados dentro de policies RLS que se resuelven contra `auth.uid()`). `search_path` fijado en todas y default privileges revocados: **cualquier función nueva nace cerrada** y debe otorgar `EXECUTE` explícitamente a `authenticated`.

---

### Operación interna (founder) y Captación — migs 204-207

| Tabla | Propósito |
|-------|----------|
| `cron_runs` (mig 204) | Instrumentación de crons: nombre, started/finished, ok, summary — alimenta Health con corridas reales |
| `founder_settings` (mig 205) | Singleton (id=true) de alertas del founder: alert_email + toggles por tipo. RLS sin policies: solo service role tras requireFounder+2FA |
| `wa_conversations` (mig 206) | Captación F1: una conversación WhatsApp entrante por teléfono×org; PRIMER referral de anuncio Meta congelado (ad_id, headline), lead_status, patient_id (se llena al cruzar) |
| `wa_inbound_messages` (mig 206) | Mensajes entrantes crudos del webhook; `UNIQUE(wamid)` = idempotencia ante reintentos de Meta. Escritura solo service role |
| RPC `captacion_summary` (mig 207) | Motor de atribución en SQL: cruce por últimos 9 dígitos del teléfono, cita ≤30 días del primer contacto, asistencia y facturado (patient_payments desde el primer contacto). SECURITY DEFINER, solo service_role |

> El addon `captacion` (mig 207) está registrado con `is_active=false` (beta oculta): no aparece en el marketplace; solo las orgs con grant explícito en `organization_addons` lo ven (hoy: las 2 del founder).

---

## 7. Flujos Principales

### 7.1 Registro e Onboarding
1. Usuario llega a landing (`/`) → click "Registrarse"
2. Formulario de registro: nombre, nombre de org, email, password
   - Soporta invitación: `?invite=<token>` pre-llena email y muestra org
3. Trigger `handle_new_user()` crea automáticamente:
   - `user_profiles` (perfil)
   - `organizations` (org con tipo independiente)
   - `organization_members` (como owner)
   - Seeds: 5 variables globales, 4 categorías lookup con valores, 1 consultorio
4. Redirige a `/select-plan` para elegir plan
5. Si elige plan pago → checkout Mercado Pago → webhook activa suscripción
6. Redirige a `/dashboard`

### 7.2 Invitación de Miembros
1. Owner/Admin va a `/admin/members` → "Invitar miembro"
2. Selecciona email, rol (admin / receptionist / doctor) y, para doctores, título profesional (Doctor / Especialista / Licenciada)
3. Si el email **no existe** en la plataforma: se crea fila `organization_invitations` con `token` UUID + status `pending`, se envía magic link Supabase vía SMTP. El invitado clickea → `/register?invite=TOKEN` → completa nombre + password + acepta T&P → `POST /api/auth/register-invited` lo da de alta y lo agrega a la org con el `professional_title` per-org (mig 146)
4. Si el email **ya existe**: se agrega directamente a `organization_members` desde el endpoint del admin (Case A en `app/api/members/route.ts`), y se le envía un email "establece tu contraseña" via Supabase recovery link
5. Si el email **ya existe en otra plataforma** y el admin lo invita: el callback de Supabase ya no auto-acepta (v0.15.12) — redirige a `/register?invite=TOKEN` con la pantalla de confirmación: **Aceptar invitación** (POST `/api/auth/accept-invite` → membresía nueva, conserva todas las anteriores) o **Rechazar invitación** (POST `/api/invitations/[token]/reject` → `status='rejected'`)
6. Si rol es doctor: se crea/vincula un registro en `doctors` (idempotente — chequea primero linkeo por nombre, sino auto-crea con `cmp` placeholder `PEND-xxxx`)
7. El `professional_title` se asigna en la fila `organization_members` correspondiente, no en el perfil global. La misma persona puede ser Dr. en clínica A y Lic. en clínica B
8. Los miembros pueden editar su propio título desde `/account` vía la RPC `update_my_professional_title` (solo para `role='doctor'`)

### 7.3 Gestión de Citas (Scheduler)
1. Vista principal en `/scheduler` con calendario día/semana
2. Grid visual por consultorio × franja horaria
3. Crear cita: click en slot → modal con formulario (paciente, doctor, servicio, hora)
4. Drag & drop para reagendar
5. Detección de conflictos: schedule blocks, horario de org, conflictos de consultorio y doctor
6. Bloques de tiempo y break times (almuerzos recurrentes)
7. Doctor solo ve sus propias citas, solo cancela (con motivo), no reprograma
8. Consultorios filtrados por horario del doctor (si tiene restricción)
9. Validación de horario del doctor: aviso si no trabaja ese día
10. Historial de citas pasadas en `/scheduler/history`
11. **Estado en vivo del card** (toggle en Settings→Agenda): además del pill (llegó / en consulta / finalizada), el fondo del card completo se tiñe — azul cuando la paciente llegó, verde durante la consulta, gris muted al finalizar o cuando la cita queda obsoleta (`app/(dashboard)/scheduler/appointment-card.tsx`, `deriveLiveState`)
12. **Ventana y grilla con precisión de 15 min** (mig 175): la agenda abre/cierra en :00/:15/:30/:45 y los modales de cita validan a nivel de minuto contra la ventana configurada

### 7.4 Gestión de Pacientes
1. Lista con búsqueda por nombre, DNI, teléfono
2. Filtros: estado, tags, servicio, origen, rango de fechas, deuda
3. Drawer lateral con perfil detallado
4. Historial de citas y pagos por paciente
5. Sistema de tags/etiquetas

### 7.5 Reportes
1. Cuatro tipos de reporte con selector de rango de fechas y presets (hoy, 7d, 30d, 90d, este mes):
   - **Financiero:** Ingresos, cobranza, balance pendiente
   - **Marketing:** Fuentes de adquisición, tendencias de nuevos pacientes, demografía (departamento/distrito con gráficos dona y barras horizontales)
   - **Operacional:** Estadísticas de citas, tasas de completado/cancelación, utilización
   - **Retención:** Pacientes recurrentes vs nuevos, tasa de retención, frecuencia de visita, pacientes en riesgo de abandono, LTV por paciente
2. Gráficas con Recharts (barras con estilo pill, áreas con gradiente)

### 7.5.1 Dashboard de Retención de Pacientes (F10)
El tab de retención incluye:
- **KPIs (5 tarjetas):** Pacientes recurrentes, pacientes nuevos, tasa de retención (%), frecuencia promedio de visita (días), LTV promedio (S/.)
- **Gráfica de tendencia mensual:** Barras apiladas nuevos vs recurrentes (últimos 6 meses)
- **Gráfica de tasa de retención:** Área con gradiente mostrando evolución del % de retención
- **Tabla de pacientes en riesgo:** Filtro configurable (2, 3, 6, 12 meses sin visita), con nombre, contacto, total visitas, última visita, días inactivo. Badge rojo para >180 días, ámbar para menos. Exportación CSV
- **Top pacientes por LTV:** Ranking de los 20 pacientes con mayor revenue lifetime, con visitas, ingresos totales, promedio por visita, primera y última visita. Exportación CSV
- **RPCs utilizadas:** `get_retention_overview`, `get_visit_frequency`, `get_at_risk_patients`, `get_patient_ltv`, `get_retention_trend`
- **Tipos:** `types/retention.ts` (RetentionOverview, VisitFrequency, AtRiskPatient, AtRiskData, TopPatient, PatientLTV, RetentionTrendMonth)

### 7.5.2 Historia Clínica Completa (F9 + F9-EXT)

El módulo de historia clínica es el sistema integral de documentación médica de VibeForge. Se compone de 8 submódulos interconectados:

#### Flujo Principal
1. Doctor abre cita en scheduler → sidebar muestra panel de nota clínica
2. Doctor redacta nota SOAP (puede aplicar plantilla predefinida)
3. Registra signos vitales (8 campos con validación de rangos)
4. Selecciona diagnóstico CIE-10 con autocompletado
5. Auto-save cada 30s + indicador visual de guardado
6. Al finalizar: firma digital → nota queda bloqueada (inmutable)
7. Versiones anteriores quedan en `clinical_note_versions` (auditoría)

#### Módulos del Drawer de Paciente
Desde el drawer lateral de cada paciente, el doctor/admin accede a:

| Panel | Funcionalidad |
|-------|--------------|
| **Seguimientos** | Crear seguimientos con prioridad semáforo (rojo/amarillo/verde). Marcar como resuelto con timestamp |
| **Adjuntos** | Upload drag-drop de archivos médicos (labs, imágenes, referidos, consentimientos). Máx 10MB. Descarga directa |
| **Recetas** | Crear prescripciones con medicamento, dosis, frecuencia, vía, duración. Toggle activa/suspendida. Botón imprimir receta médica |
| **Tratamientos** | Planes con sesiones numeradas, barra de progreso, estados de sesión |
| **Diagnósticos** | Timeline visual de todos los diagnósticos, agrupados por CIE-10 con conteo de frecuencia |

#### Modal Expandido de Historia Clínica
El drawer lateral (420-480px) resulta estrecho para trabajo clínico. Botón **"Ver en grande"** abre modal amplio (max-w-5xl) con:
- Header con nombre, DNI y edad del paciente
- Notas clínicas SOAP con layout 2 columnas y texto legible (text-sm)
- Signos vitales en grid de hasta 8 columnas
- Paneles clínicos completos (tratamientos, prescripciones, seguimientos, adjuntos) con `canEdit=true` para doctores y admins
- Usa hook `useCurrentDoctor` para resolver `doctorId` del usuario actual
- Componente: `patients/clinical-history-modal.tsx`

#### Impresión de Receta Médica
Botón "Imprimir Receta" en el panel de prescripciones (visible cuando hay prescripciones activas y contexto de impresión disponible). Genera documento HTML en ventana nueva con:
- Encabezado con nombre de clínica y título "RECETA MÉDICA"
- Datos del paciente (nombre, DNI) y doctor
- Lista numerada de medicamentos con dosis, vía, frecuencia, duración, cantidad e indicaciones
- Bloque de firma del médico tratante
- Nota legal: "Válida por 30 días desde su emisión"
- Formato A5 landscape para impresión
- Componente: `scheduler/prescription-print.tsx`

#### Panel Centralizado de Seguimientos (`/scheduler/follow-ups`)
Vista dedicada de seguimientos accesible desde el sidebar (bajo Agenda), **para todas las orgs desde v0.15.24** (antes gateada por el addon de fertilidad). Una sola página con revelación progresiva:
- 3 tabs: Pendientes / Recuperados / Sin respuesta, con paginación (20 por página)
- Cards con **badge de origen**: azul "Control" (`core.service_followup`), violeta "Automatizado" (reglas del addon), gris "Manual"
- Acciones por card: contactar (WhatsApp manual), posponer, cerrar, reactivar
- Solo con addon de fertilidad: KPIs de ingreso atribuido (LTV), filtro por regla, stepper de etapa del journey
- Creación core sin configuración: `services.followup_after_days` (default por servicio) + control "Requiere control" del doctor al completar la cita; cierre automático vía categoría centinela `core.next_visit` (mig 183) cuando el paciente agenda cualquier cita futura
- Ruta: `/scheduler/follow-ups`

#### Administración de Plantillas
- Ruta: `/admin/clinical-templates`
- Plantillas globales (visibles a todos) vs personales (solo del doctor)
- 15 especialidades: Medicina General, Ginecología, Pediatría, Dermatología, Cardiología, Oftalmología, Otorrinolaringología, Traumatología, Neurología, Psicología, Nutrición, Urología, Endocrinología, Gastroenterología, Neumología
- Pre-llenado de SOAP + diagnóstico por defecto
- Vista previa expandible

#### Seguridad Clínica
- **RLS multi-tenant** en todas las tablas clínicas
- **Firma digital:** Una vez firmada, la nota es inmutable (solo lectura)
- **Auditoría:** Cada edición genera una versión con snapshot completo
- **Acceso:** Doctor solo edita sus propias notas no firmadas; admin puede editar cualquier nota no firmada
- **Validación:** Zod schemas con rangos médicos (temp 30-45°C, SpO₂ 50-100%, etc.)
- **Rate limiting:** 30 req/min en todos los endpoints clínicos

#### Base de Datos (8 tablas)
`clinical_notes`, `clinical_templates`, `treatment_plans`, `treatment_sessions`, `prescriptions`, `clinical_attachments`, `clinical_followups`, `clinical_note_versions`

#### API Endpoints (13 rutas)
- `/api/clinical-notes` — CRUD notas SOAP
- `/api/clinical-notes/[id]/versions` — Historial de versiones
- `/api/clinical-templates` — CRUD plantillas
- `/api/treatment-plans` — CRUD planes + sesiones
- `/api/prescriptions` — CRUD recetas
- `/api/clinical-attachments` — Upload/descarga/eliminación
- `/api/clinical-followups` — CRUD seguimientos

#### Tipos TypeScript
- `types/clinical-notes.ts` — ClinicalNote, Vitals, SOAPSection, SOAP_LABELS, VITALS_FIELDS
- `types/clinical-history.ts` — TreatmentPlan, TreatmentSession, Prescription, ClinicalAttachment, ClinicalFollowup, ClinicalNoteVersion
- `types/clinical-templates.ts` — ClinicalTemplate, SPECIALTIES

### 7.6 Integración WhatsApp (F6)

#### Fase 1: Click-to-Clipboard (Implementado)
Sistema de copia rápida de mensajes para WhatsApp al crear una cita:
- **Modal post-creación:** Después de agendar una cita, se muestra modal con mensaje pre-formateado y botón "Copiar mensaje de WhatsApp"
- **Plantilla configurable:** Template personalizable en Settings → WhatsApp con variables dinámicas:
  - `{{NOMBRE}}` — Nombre del paciente
  - `{{FECHA}}` — Fecha de la cita
  - `{{HORA}}` — Hora de la cita
  - `{{DOCTOR}}` — Nombre del doctor
  - `{{SERVICIO}}` — Servicio agendado
  - `{{CLINICA}}` — Nombre de la clínica
  - `{{DIRECCION}}` — Dirección de la clínica
- **Settings tab:** Toggle para activar/desactivar, editor de plantilla con chips de variables, vista previa en vivo con datos de ejemplo, botón de restaurar plantilla por defecto
- **Persistencia:** localStorage por navegador (`vibeforge_wa_clipboard_enabled`, `vibeforge_wa_clipboard_template`)
- **Archivos:** `lib/whatsapp-clipboard-config.ts`, `scheduler/whatsapp-clipboard-modal.tsx`, `settings/whatsapp-clipboard-tab.tsx`

#### Fase 2: WhatsApp Business API (Implementado — operativo end-to-end)
- Integración directa con WhatsApp Business API de Meta (credenciales cifradas, webhook verificado)
- Envío automático de confirmaciones y recordatorios (cron + notificaciones por evento) con normalización E.164 peruana, dedupe por canal y guard anti-duplicados
- Templates aprobados por Meta con submit/sync, mapeo de variables con ejemplos inteligentes y pre-validación de reglas ocultas de Meta
- Endpoint `app/api/whatsapp/send/route.ts` + selector "Usar para (automático)" que vincula plantillas a eventos
- **Primer envío automático real: 2026-07-22.** Detalle del pipeline endurecido: [CHANGELOG.md](CHANGELOG.md) (v0.15.22)

### 7.7 Dashboard por Rol
- **Admin/Owner:** KPIs globales (pacientes, doctores, citas, ingresos), top servicios, heatmap de citas, stats operacionales
- **Doctor:** Dashboard personal con sus citas del día/mes, ingresos propios, próximas citas
- **Receptionist:** Redirige directo a scheduler

---

## 8. Estructura de Rutas

```
/ ............................ Landing page (pública)
/book/[slug] ................. Página pública de reserva de citas
/privacy · /terms ............ Páginas legales (públicas — publicPaths del middleware)
/data-deletion ............... Instrucciones públicas de eliminación de datos (App Review Meta)

(auth) — Páginas públicas de autenticación
├── /login ................... Login (email + Google OAuth)
├── /register ................ Registro (soporta invitaciones)
├── /forgot-password ......... Solicitud de reset de password
├── /reset-password .......... Formulario de nuevo password
├── /select-plan ............. Selección de plan post-registro
└── /waiting-for-plan ........ Espera para miembros sin plan activo

(dashboard) — Páginas protegidas con sidebar
├── /dashboard ............... Dashboard (varía por rol)
├── /scheduler ............... Calendario de citas (día/semana)
│   ├── /follow-ups .......... Panel de seguimientos clínicos (vista centralizada)
├── /captacion ............... Módulo Captación (beta oculta — addon `captacion` con grant)
│   ├── /budgets ............. Embudo de presupuestos (gateado por el addon Fertilidad)
│   └── /history ............. Historial de citas pasadas
├── /patients ................ Gestión de pacientes
├── /reports ................. Reportes (financiero, marketing, operacional)
├── /facturacion ............. Comprobantes electrónicos SUNAT (gateado por Nubefact conectado)
├── /settings ................ Configuración de org (admin only)
├── /account ................. Perfil de usuario + plan actual
├── /plans ................... Ver/cambiar plan de suscripción
├── /admin ................... Panel de administración
│   ├── /offices ............. CRUD consultorios
│   ├── /doctors ............. Gestión de doctores
│   ├── /services ............ Servicios y categorías
│   ├── /lookups ............. Catálogos (orígenes, métodos de pago)
│   ├── /global-variables .... Variables de configuración
│   ├── /clinical-templates .. Plantillas clínicas SOAP (global/personal)
│   └── /members ............. Gestión de equipo + invitaciones
├── /founder ................. Dashboard de plataforma (solo founder)
│   ├── /integrations ........ Testing de integraciones MP
│   └── /integrations/result . Resultado de pago de prueba

/api — Endpoints backend
├── /auth/callback ........... OAuth callback de Supabase
├── /auth/register-invited ... POST registro de usuario invitado
├── /plans ................... GET catálogo, POST asignar plan
├── /plans/start-trial ....... POST iniciar trial de 14 días
├── /members ................. GET listar, POST invitar
├── /members/[id] ............ DELETE/PATCH miembro
├── /invite/[token] .......... GET validar invitación
├── /mercadopago/checkout .... POST crear suscripción MP (preapproval)
├── /mercadopago/subscription  GET estado, PUT actualizar addons
├── /mercadopago/webhook ..... POST webhook IPN de MP
├── /payments/mercadopago/create-preference  POST crear preference (founder testing)
├── /notifications/send ...... POST enviar notificación email automática
├── /email/send-test ......... POST enviar email de prueba
├── /founder ................. GET stats de plataforma
├── /clinical-notes .......... GET/POST notas clínicas SOAP
├── /clinical-notes/[id] ..... PATCH actualizar/firmar nota
├── /clinical-notes/[id]/versions  GET historial de versiones
├── /clinical-templates ...... GET/POST plantillas clínicas
├── /clinical-templates/[id] . PATCH/DELETE plantilla
├── /treatment-plans ......... GET/POST planes de tratamiento
├── /treatment-plans/[id] .... PATCH actualizar plan/sesión
├── /prescriptions ........... GET/POST recetas médicas
├── /prescriptions/[id] ...... PATCH toggle activa/suspendida
├── /clinical-attachments .... GET/POST adjuntos clínicos
├── /clinical-attachments/[id] GET descarga / DELETE eliminar
├── /clinical-followups ...... GET/POST seguimientos clínicos
├── /clinical-followups/[id] . PATCH resolver seguimiento
├── /patients/[id]/anthropometry  GET/POST/DELETE mediciones antropométricas (addon growth_curves)
├── /patients/[id]/antecedents    GET/POST/PATCH/DELETE alergias, condiciones, medicamentos
├── /addons .................. GET catálogo enriquecido con activación/recomendación por org, POST toggle (admin)
├── /onboarding/complete ..... POST marca onboarding como completo + auto-activa addons según especialidad
├── /founder ................. GET stats globales de plataforma
├── /founder/stats/owners .... GET métricas del embudo de owners (signups, trials, conversiones)
├── /founder/notes ........... GET/POST/DELETE notas privadas por organización
├── /scheduler-settings ...... GET/PUT config de agenda por org (DB-backed)
├── /ai-assistant ............ POST chat con AI
├── /book/[slug] ............. GET datos públicos de reserva (doctores, servicios, horarios)
└── /book/[slug]/create ...... POST crear cita desde página pública
```

---

## 9. Navegación del Sidebar

| Sección | Ítems | Visible para |
|---------|-------|-------------|
| Dashboard | Dashboard | Todos |
| Agenda | Calendario, Seguimientos, Presupuestos (addon Fertilidad), Historial | Todos |
| Agenda | Captación (beta) | Orgs con grant del addon `captacion` (hoy: founder) |
| Pacientes | Pacientes | Todos |
| Reportes | Reportes | Admin/Owner |
| Reportes | Facturación | Admin/Owner + recepción (oculto para doctores) |
| Administración | Consultorios, Doctores, Servicios, Catálogos, Variables, Miembros | Admin/Owner |
| — | Configuración | Admin/Owner |
| — | Mi Cuenta | Todos |
| — | Founder Dashboard | Solo founder |

> **Founder panel (nav propia, 2026-08-08)**: Hoy (CEO) · Soporte (badge de pendientes) · Clínicas (Owners+Organizaciones+Equipos) · Dinero (Revenue+Reembolsos) · Sistema (Salud+Plugins+Ajustes), con sub-pestañas en `subnav.tsx` y hamburguesa móvil. Overview eliminado; `/founder-dashboard` queda solo como puerta 2FA y redirige a `/ceo`.

---

## 10. Configuración por Organización

### Settings (General)
- Nombre y slug de la organización
- Logo (upload/remove via Supabase Storage)
- Idioma (español/inglés)

### Settings (Agenda)
- Hora de inicio/fin del scheduler con **precisión de 15 minutos** (selects de hora + minuto 0/15/30/45; p.ej. abre 07:15, cierra 20:45) — columnas `start_minute`/`end_minute` en `scheduler_settings` (mig 175). Resumen de duración de la jornada calculado en vivo. Invariante open<close a nivel de minutos-desde-medianoche
- Tamaño de slot / intervalo: 15, 20, 30, 45 o 60 minutos — la grilla es de **paso uniforme** desde `start_hour:start_minute` avanzando por el intervalo
- Indicador de hora actual (on/off)
- Estado de cita en vivo (on/off) — ver Sección 7.3

### Settings (WhatsApp)
- Toggle para activar/desactivar modal de copia rápida post-cita
- Editor de plantilla de mensaje con variables dinámicas
- Vista previa en vivo con datos de ejemplo
- Botón de restaurar plantilla por defecto

### Settings (Notificaciones) — ex-"Correos"
- Configuración de email (remitente, templates)
- Matriz evento × canal (📧 Email / 📱 WhatsApp): el toggle Email actúa como interruptor maestro del evento; WA se deshabilita si falta plantilla aprobada+vinculada. Detalle: [CHANGELOG.md](CHANGELOG.md) (v0.15.22)
- **Matriz evento × rol de notificaciones en vivo (v0.15.26)**: quién recibe cada aviso en la campanita del panel (owner / admin / recepción / doctor). No afecta a email ni WhatsApp. Apagar todas las columnas de un evento lo desactiva para toda la clínica; en los eventos de agenda el doctor solo recibe los de SUS citas. Se persiste en `organizations.settings.live_notifications` y el catálogo de eventos vive en `lib/live-notifications/catalog.ts`

### Settings (Integraciones)
- Marketplace visual de integraciones externas (WhatsApp Business API, Mercado Pago, Google Calendar, etc.)
- Tarjetas con estado (disponible / próximamente / conectado)
- Wizard guiado por integración (ej. WhatsApp: paso a paso para conectar Business API)

### Settings (Módulos)
- Gestión de addons activos por organización — ver Sección 18
- Sección "Recomendados para tu especialidad" basada en la especialidad elegida en onboarding
- Agrupación por categoría: Especialidad médica, Flujos de trabajo, Clínico
- Toggle on/off por módulo (owner/admin). Badge PRO para addons premium
- Auto-activación de addons gratuitos que coinciden con la especialidad al completar el onboarding

### Variables Globales (Seed automático)
- `clinic_name` — Nombre del consultorio
- `clinic_phone` — Teléfono de contacto
- `clinic_email` — Email de contacto
- `max_appts_per_slot` — Máximo de citas por slot (default: 1)
- `currency_symbol` — Símbolo de moneda (default: S/.)

### Catálogos (Seed automático)
- **Origen del Paciente:** TikTok, Instagram, Google, Recomendado
- **Método de Pago:** Efectivo, Yape, Visa
- **Estado de Cita:** Programada, Confirmada, Completada, Cancelada (con colores)
- **Responsable:** Admin (seed inicial, se sincroniza con miembros)

---

## 11. Integraciones Externas

| Servicio | Propósito | Estado |
|----------|----------|--------|
| **Supabase** | Auth (email + Google), PostgreSQL, Storage, RLS | Implementado |
| **Mercado Pago** | Gateway de pagos para suscripciones | Implementado |
| **SMTP (Nodemailer)** | Envío de emails transaccionales (invitaciones, notificaciones) | Implementado (Gmail SMTP, migración a servicio pago pendiente) |
| **AI Assistant** | Chat con AI para consultas sobre datos | Implementado (básico) |
| **Sentry** | Monitoreo de errores en cliente, servidor y edge | Implementado (se activa con `SENTRY_DSN`) |
| **WhatsApp Cloud API (Meta)** | Bidireccional: plantillas salientes (recordatorios/seguimientos) + **capturador de entrantes con referral de campaña** (Captación F1, mig 206). Config por org (`whatsapp_config`), webhook global con firma HMAC | Implementado (1 org conectada; captura activa para todas las conectadas) |
| **Resend** | Emails transaccionales vía `lib/resend.ts` (soporte, alertas founder, billing) | Implementado |
| **App de Meta (developers.facebook.com)** | Requisito de Embedded Signup v4 + Coexistence. App ID 1059167543290484 configurada (URLs legales, DPO, categoría); verificación del negocio (RUC AMD IMPULSE S.R.L.) en trámite; App Review de `whatsapp_business_management/messaging` pendiente | En trámite (2026-08-12) |

---

## 12. Features Implementadas (Estado Actual)

> Checklist de una línea por feature. El detalle histórico completo de cada una vive en [CHANGELOG.md](CHANGELOG.md) (ver el Apéndice "Detalle de Features Implementadas").

### Completado

**Agosto 2026 (v0.15.28 – v0.15.29):**
- [x] Panel CEO del founder: pulso del negocio (MRR/cobrado real), salud por clínica, alertas accionables + Health con `cron_runs` (mig 204)
- [x] Soporte end-to-end: bandeja del founder con respuesta inline + emails a ambos lados (antes: agujero negro, ticket 67 días sin respuesta)
- [x] Nav del founder panel 10→5 con badge de soporte, sub-pestañas y móvil; Ajustes de alertas con correo de prueba (mig 205)
- [x] Limpieza de 86 orgs bot + 86 cuentas en producción (whitelist founder/pilotos)
- [x] Módulo Captación F1: capturador silencioso de WhatsApp entrante con referral de campaña Meta (mig 206)
- [x] Módulo Captación F2: addon beta oculto + panel de campañas con atribución automática campaña→cita→soles (mig 207, RPC `captacion_summary`)
- [x] Páginas legales públicas (`/privacy`, `/terms`, `/data-deletion`) + datos fiscales AMD IMPULSE S.R.L. — preparación App Review de Meta

- [x] Autenticación (email + Google OAuth)
- [x] Registro con creación automática de org y datos seed
- [x] Sistema de invitaciones por email con roles
- [x] Multi-tenant con RLS completo
- [x] 4 roles (owner, admin, receptionist, doctor)
- [x] Scheduler con vista día/semana, drag & drop, conflictos
- [x] Bloques de tiempo y break times en scheduler
- [x] Gestión de pacientes con búsqueda, filtros y tags
- [x] CRUD de consultorios, doctores, servicios, categorías
- [x] Catálogos configurables (orígenes, métodos de pago)
- [x] Variables globales de configuración
- [x] Dashboard admin con KPIs, heatmap, top servicios
- [x] Dashboard personal para doctores
- [x] Reportes financieros, marketing y operacionales
- [x] Sistema de planes (3 tiers) con límites y feature flags
- [x] Integración Mercado Pago (checkout, webhook)
- [x] Página de selección de plan y gestión de suscripción
- [x] Gestión de miembros del equipo
- [x] Sincronización automática doctores ↔ miembros de org
- [x] Settings de org (nombre, logo, idioma, agenda, email)
- [x] Perfil de usuario (avatar, nombre, teléfono, título profesional)
- [x] Cambio de contraseña
- [x] Founder dashboard con métricas globales
- [x] AI Assistant (básico)
- [x] Tema oscuro por defecto con toggle
- [x] Soporte multi-idioma (ES/EN)
- [x] Pagos de pacientes vinculados a citas
- [x] Historial de edición de citas
- [x] Storage buckets para avatares y logos
- [x] Restricción de doctor: solo ve sus propias citas
- [x] Error boundaries (global, app, dashboard, 404)
- [x] Security headers en middleware (X-Frame-Options, HSTS, CSP parcial, Referrer-Policy, Permissions-Policy)
- [x] Validación Zod en todas las API routes (12 rutas con schemas)
- [x] Sentry integrado para monitoreo de errores (client + server + edge)
- [x] Sistema de notificaciones email automáticas (templates con variables, envío por SMTP)
- [x] 18+ email templates por org (citas, pagos, equipo, marketing) con seed automático
- [x] Teleconsulta: modalidad virtual en servicios, meeting URLs en doctores y citas
- [x] Trial de 14 días con creación automática de suscripción
- [x] Registro de usuarios invitados vía token (`/api/auth/register-invited`)
- [x] Founder: testing de integraciones MP (`/founder/integrations`)
- [x] Configuración de visibilidad doctor↔pacientes por org (RLS dinámico)
- [x] Rate limiting en todas las API routes (5 limiters configurados)
- [x] **Exportación CSV de datos** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Indicador de deuda visible en citas** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Fecha de nacimiento con edad automática** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Dashboard de retención de pacientes (F10)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **WhatsApp click-to-clipboard (F6 Fase 1)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Notas clínicas SOAP (F9)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Historia Clínica Completa (F9-EXT)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Booking online / agenda pública (F7)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Recordatorios automáticos por cron (F8)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Impresión de Receta Médica** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Modal expandido de Historia Clínica** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Panel centralizado de seguimientos (`/scheduler/follow-ups`)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Planes de tratamiento editables en modales clínicos** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Órdenes de exámenes médicos** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Bloqueo post-firma** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Email: bienvenida paciente nuevo** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Email: cumpleaños** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Email: seguimiento pacientes inactivos** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Email: factura (payment_invoice)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Resumen diario del equipo** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **4 nuevas variables de email** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Confirmación de contraseña en registro** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Paginación historial de citas** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Responsive mobile (Fase 1)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Responsive mobile (Fase 2+3)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Páginas de producto SEO** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Marketplace de integraciones (Settings → Integraciones)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Founder: tracking completo de owners** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Sistema de Addons / Módulos Verticales** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Addon de Curvas de Crecimiento OMS (primer vertical pediátrico)** · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Perfil de Organización + Membrete reutilizable** — v0.14.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Plantillas PDF reales usan el membrete de la org** — v0.14.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Wizard Nubefact pre-llena RUC y razón social desde organizations** — v0.14.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Hardening legal /terms y /privacy + rediseño visual** — v0.14.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Aceptación explícita de Términos y Privacidad en registro** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Ubigeo SUNAT en organizations** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Tipos regenerados + cleanup de casts** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Bloqueo de sesión para miembros desactivados** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Especialidades editables + tabla `doctor_specialties`** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Consentimiento informado digital MVP (F12)** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **UX unificada: consentimientos manuales (foto) + digitales conviven** — v0.14.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Hardening de seguridad post-review (terms + invite + consent)** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Hardening de consentimientos + middleware terms-gate** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Historia Clínica: DNI+edad en header, label SOAP, layout vertical** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Múltiples diagnósticos CIE-10 por nota clínica** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Código CIE-10 manual one-off en nota** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Toggle Nota | Timeline en modal de HC** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Medicamentos y exámenes en cards del Timeline HC** — v0.14.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Pack Vertical Fertilidad — Básico (`fertility_basic`) — addon end-to-end con seguimientos automatizados y atribución honesta** — v0.15.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Redesign Settings → Módulos al estilo Settings → Integraciones (Activar → modal → engranaje config)** — v0.15.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Empty states guiados en `/admin/services` para onboarding de owner nuevo** — v0.15.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Slug del plan base consolidado a `'independiente'` + helper para uso futuro** — v0.15.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Migración cron `fertility-followup-contact` daily 13 UTC + documentada deuda Vercel Pro** — v0.15.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Sección 🔐 Seguridad y Auth nueva en `COMING-UPDATES.md` + re-ranking de Prioridad sugerida** — v0.15.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Settings → Integraciones agrupado por status (Mis activas / Disponibles / Próximamente)** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Break time default OFF en scheduler** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Empty states guiados en `/admin/doctors`, `/admin/offices`, `/patients`, `/scheduler`** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Tour interactivo de bienvenida con driver.js (10 steps + persistencia + sección Ayuda en /account)** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Hardening completo del flujo de invitación de miembros** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Account header reactivo al form + sync auth.user_metadata.full_name al guardar** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Settings → tab "WhatsApp" desbloqueado (clipboard config no requiere Business API)** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Hero landing con gradient animado emerald→violet→cyan reactivo al cursor** — v0.15.1 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Card Centro Médico (Más popular) con borde gradient animado + glow pulsante + botón CTA tipo Brief IA con shimmer** — v0.15.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Sección "Otras especialidades disponibles" oculta si la org tiene specialty principal** — v0.15.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Fix: lectura de `patients.sex` en SELECT del drawer del paciente** — v0.15.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Fix: KPI "Revenue estimado atribuido" en panel de Recuperados solo cuenta categoría A (withContact)** — v0.15.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Embudo de presupuestos del Pack Fertilidad — tabla `budget_records` independiente de `treatment_plans`** — v0.15.2 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Topbar rediseñado con dropdown hover (avatar + nombre opcional)** — v0.15.3 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Animaciones de modales / popovers / sheets / dropdowns / alert-dialogs unificadas** — v0.15.3 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Plantillas WhatsApp clipboard multi-kind** — v0.15.3 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Followup card con teléfono visible + dual button device-aware** — v0.15.3 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Phase 1 perf: `/scheduler/follow-ups` y `/scheduler/budgets`** — v0.15.3 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Research: evaluación Openpay PE para integración multi-gateway de payment-link** — v0.15.3 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Notificaciones en vivo por rol (RPC `notify_org_members` + fan-out por usuario + matriz en Settings + RLS endurecido)** — v0.15.26 (mig 192, activo en producción) · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Plugin de presupuestos de la Dra. Patricia — 12 plantillas de precio único + sincronización de `service_budget_tiers`** — v0.15.26 (mig 191) · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Rediseño móvil de Seguimientos + branding WhatsApp acotado a las acciones que abren WhatsApp** — v0.15.25 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Barrido responsive: full-bleed móvil en las 5 páginas tipo app, fix estructural del overflow del layout, tabs de ficha de paciente en pills scrolleables, ~25 fixes de touch targets y wraps** — v0.15.25-26 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Escritorio sin margen exterior en las 5 páginas tipo app (borde-a-borde en ≥md, como Presupuestos)** — v0.15.26 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] **Seguridad BD: cierre de la superficie RPC — 47 funciones fuera del alcance de `anon`, `search_path` fijado, default privileges revocados** — v0.15.26 (mig 193, aplicada en producción) · detalle: [CHANGELOG.md](CHANGELOG.md)

### Pendiente / Por Mejorar
- [x] **Facturación electrónica SUNAT vía Nubefact (MVP completo)** — v0.13.0 → v0.13.1. Cierre del módulo de facturación electrónica multi-tenant para clínicas peruanas. Componentes:
  - **Wizard de conexión** (Settings → Integraciones): RUC, razón social, dirección, ubigeo, route + token Nubefact, series autorizadas. Soporta sandbox + producción con prueba live. Credenciales encriptadas AES-256-GCM en `lib/encryption.ts`.
  - **Emisión desde el sidebar de cita** (Boletas / Facturas / NC): datos cliente y servicio pre-llenados desde `patients` + `services`. IGV calculado a partir del precio del catálogo (convención clínica peruana: precio = con IGV incluido). Envío automático del PDF al email del paciente vía Nubefact. Card de comprobante emitido en sidebar con estado SUNAT, números, links a PDF / XML / CDR / Nubefact.
  - **Pago parcial / anticipos**: si `amount_paid < total_price`, el modal ofrece radio "Pagado / Total" con reescalado proporcional automático (`factor = amount_paid / sumBaseline`) y sufijo " (pago parcial)" en la descripción del item. La boleta refleja exactamente el cobro real — modelo contable correcto para clínicas con anticipos.
  - **Forma + medio de pago SUNAT (Catálogo 59)**: heurística pura en `lib/einvoice/payment-mapper.ts` que mapea cualquier label de `lookup_values` (Yape/Plin/Tunki/BIM/Visa/Mastercard/Efectivo/Transferencia/Cheque/etc.) al código SUNAT correcto. Multi-tenant: labels custom caen al fallback `099 Otros`, siempre válido. Pre-llenado desde el último `patient_payments.payment_method` de la cita, editable por el user.
  - **Warning Bancarización (Ley 28194)**: si `total ≥ S/2,000` (o USD 500) y el método mapea a Efectivo, el modal muestra warning ámbar antes de emitir — el cliente perdería derecho a deducir IGV/costo. No bloquea, advierte. Protección fiscal real para clínicas con tickets grandes (FIV, paquetes de fertilidad).
  - **Notas de crédito (doc_type 3)**: dialog dedicado con catálogo SUNAT 9 (anulación, devolución total, disminución valor, corrección, etc.) ordenado por frecuencia clínica. Hereda cliente + items + totales del original. Botón "Anular / Nota de crédito" en card del comprobante y en drawer del dashboard. Auto-marca el original como `cancelled` para motivos de anulación. Auto-crea fila `einvoice_series` tipo 3 si no existe.
  - **Dashboard `/facturacion`** (admin-only, gateado por `einvoice_configs.is_active`): KPIs (monto emitido en período, pendientes SUNAT, rechazados/anulados), filtros (período, tipo, estado, serie, búsqueda libre), tabla con drawer de detalle, links a PDF/XML/CDR. Empty-state con CTA al wizard cuando la org no ha conectado.
  - **Backend hardening**: validación Zod backend de `customer_address` para facturas y RUC (defense-in-depth), atomic UPDATE+RETURNING en correlativo vía RPC `reserve_einvoice_correlative` (migración 110, elimina race conditions en emisiones concurrentes), rollback del correlativo en cualquier error no-retryable (no solo error 23 duplicado).
  - **Tablas**: `einvoice_configs`, `einvoice_series`, `einvoices`, `einvoice_line_items`. Migraciones 108 + 109 + 110. Provider abstracto en `lib/einvoice/` (Nubefact implementado, abierto a Efact/Bizfor en el futuro).
  - **Deuda diferida** (post-v0.14): mapeo SUNAT explícito de métodos en `Settings → Catálogos` (`sunat_payment_code` per-org), tipo "Anticipo" SUNAT (catálogo 12), webhook/cron de polling SUNAT para refresco automático de estados PENDIENTE → ACEPTADO.
- [x] **Descuento al crear cita + bloqueo post-cobro** (v0.13.1) — El descuento se aplica ahora desde el modal de cita (toggle con modos % o monto fijo + razón), antes de cualquier cobro. El sidebar permite editar descuento solo cuando `totalPaid === 0`; si hay pagos registrados, el control se reemplaza por un mensaje informativo orientando a emitir nota de crédito (motivo SUNAT 09 — disminución de valor). Soluciona el bug conceptual donde aplicar descuento después de un anticipo desincronizaba el comprobante ya emitido del precio real. El máximo del anticipo y la sugerencia 50% se reescalan a `totalAfterDiscount` para coherencia.
- [x] **Drawer del paciente: ancho aumentado** (v0.13.1) — `md:w-[420px] → 480px` y `lg:w-[480px] → 580px`. Los 7 tabs (Datos / Historial / Clínico / Presupuestos / Finanzas / Marketing / Fiscal) en 480px quedaban apretadísimos. Tradeoff: el drawer ocupa más espacio sobre la lista de pacientes detrás. Si se necesita más, próximo paso es consolidar tabs (Fiscal → sección dentro de Finanzas, Marketing → sección dentro de Datos).
- [x] Impresión de comprobante (F3) — cubierto por el módulo de facturación electrónica Nubefact (boleta/factura con PDF legal enviado al paciente, v0.13.0). Un recibo interno no-fiscal simple queda como opcional
- [ ] Confirmación de cita desde email 1-click (F4) — Token seguro temporal
- [x] WhatsApp Business API (F6 Fase 2) — ✅ implementado (verificado en código 2026-07-22): `lib/whatsapp/client.ts` + `lib/whatsapp/send.ts`, endpoint `POST /api/whatsapp/send`, plantillas Meta con submit/sync (`/api/whatsapp/templates/[id]/submit|sync`), `POST /api/whatsapp/webhook`, credenciales cifradas (`lib/encryption.ts`)
- [x] Consentimiento informado digital (F12) — Requisito legal Perú — ✅ implementado en v0.14.1 (mig 120), UX unificada manual+digital (mig 121). Ver "Consentimiento informado digital MVP" más arriba en "Completado"
- [ ] Módulo de inventario básico (F13)
- [x] Portal del paciente (F14) — ✅ Phase 1 implementada (v0.10.1, portal rediseñado). Ver [CHANGELOG.md](CHANGELOG.md) (v0.10.1)
- [~] Reportes con IA generativa (F15) — **parcial**: "Reporte IA Avanzado" Capa 1 (`POST /api/ai-briefs/generate`, brief ejecutivo narrativo generado manualmente desde el dashboard admin, tabla `ai_executive_briefs`). Pendiente Capa 2/3 (cron programado + envío por email)
- [ ] App móvil o PWA
- [x] Facturación electrónica SUNAT — entregado MVP en v0.13.0 con Nubefact (boleta/factura desde la cita, pagos parciales con reescalado proporcional). Ver detalle más arriba en "Completado".
- [x] Add-ons de plan (UI para comprar extras) — ✅ implementado en `/account` (`addAddon` vía `useBilling`, diálogo "Comprar cupo extra" para miembros/consultorios adicionales)
- [x] Bloqueo de usuario desactivado (modal "Su usuario ha sido desactivado") — ✅ implementado en v0.14.1 (mig 118): página `/account-suspended` + gate en middleware cuando todas las membresías están inactivas
- [ ] Tests automatizados (unit, integration, e2e)
- [ ] Optimización de performance y caching
- [ ] Custom SMTP en Supabase Auth (para envío de invitaciones sin rate limit)
- [x] Especialidades: primer módulo vertical entregado — Curvas de crecimiento OMS (Endocrinología Pediátrica / Pediatría)
- [x] Especialidades: select editable en Settings (solo Owner) — ✅ implementado en v0.14.1 (mig 119, `org-specialty-section.tsx`)
- [x] Especialidades: tabla `doctor_specialties` + asignación en admin de doctores — ✅ implementado en v0.14.1 (mig 119, tab "Especialidades" en editor de doctor)
- [ ] Especialidades: tabs condicionales en historia clínica según especialidad del doctor
- [x] Especialidades: segundo módulo vertical — Odontograma (Odontología) o Tracking de fertilidad (Medicina Reproductiva) — ✅ entregado Tracking de Fertilidad end-to-end (`fertility_basic`, v0.15.0, migs 127-131). Ver "Pack Vertical Fertilidad" más arriba
- [ ] Growth curves: expansión de tablas LMS OMS a granularidad mensual completa (actualmente trimestral para 0–5a, anual para 5–19a)
- [ ] Growth curves: integración con signos vitales de notas clínicas SOAP (auto-registrar antropometría al firmar)
- [ ] Emails: post-consulta, pedir reseña, campaña marketing (plantillas ocultas, sin lógica de envío)
- [ ] Emails: pago pendiente (plantilla oculta, sin trigger)
- [ ] Screenshots reales para placeholders en /producto/* y /blog/*
- [ ] SEO: páginas por especialidad (/especialidades/[slug])
- [ ] SEO: páginas comparativas (vs Doctoralia, vs Dentalink, etc.)
- [x] SEO: blog con 3 artículos completos + 9 placeholders
- [x] SEO: lead magnets (checklist, calculadora ausentismo, plantilla SOAP)
- [x] SEO: calculadora de precios WhatsApp (/calculadora-whatsapp)
- [ ] SEO: página pilar "Software de gestión para clínicas en Perú"
- [x] Página /base-conocimientos (hub de ayuda) — ✅ implementada (`app/base-conocimientos/`: 8 categorías + rutas dinámicas `[slug]` + 6 artículos)
- [ ] Página /contacto (formulario)
- [ ] Página /socios (programa de socios)
- [ ] Conectar lead magnets con captura de email real (Resend/Mailchimp)
- [ ] Imágenes reales para blogs (fotos/ilustraciones)
- [x] Nombre final del software — ✅ marca **Yenda** (`APP_NAME` en `lib/constants.ts`); ya no quedan placeholders "REPLACE" ni "PacientesPro" en el código

### Roadmap (Coming Updates)

> El roadmap detallado vive en `docs/coming-updates-core.md` (core) y `docs/coming-updates-fertility-addon.md` (addon fertilidad). Esta sección solo conserva lo ya entregado y los ítems que aún **no** están reflejados en esos docs.

**Bloqueantes del piloto (semana del 2026-08-10):**
- [ ] **Upgrade a Supabase Pro antes de arrancar el piloto** — habilita backups diarios y leaked password protection. Es requisito de arranque, no un nice-to-have: hoy el proyecto corre sin backups automáticos
- [ ] **Datos pendientes de la Dra. Patricia** — precios definitivos, datos de Banking y número de colegiatura. El plugin `budget_pdf_patricia` y la mig 191 ya están, pero los documentos no se pueden emitir en firme hasta tenerlos

**Entregado:**
- [x] Etiqueta "Paciente Recurrente" automática — v0.11.0 · detalle: [CHANGELOG.md](CHANGELOG.md)
- [x] Límites de plan: soft-wall (members + offices, rol-aware) — v0.15.16 · detalle: [CHANGELOG.md](CHANGELOG.md). Decisión canónica (§5): pacientes y citas quedan ilimitados. Pendiente Phase 2: AI queries + storage

**Pendiente aún no reflejado en `docs/coming-updates-core.md`** (candidatos a incorporar por el advisor):
- [ ] Storage: límites y mensajes de espacio (uso vs límite del plan + CTA upgrade al agotar)
- [ ] Módulo de Laboratorio (addon `lab_integration`) — seed ya existe, falta UI y flujos
- [ ] Grabación de consulta + transcripción con IA (Whisper/LLM → SOAP pre-llenada)
- [ ] Bundle Consulta + Tratamiento (paquete con cobro único y creación automática de sesiones)

**Ya trackeado en `docs/coming-updates-core.md`** (no se duplica aquí): Módulo Dermatología antes/después, Dos atenciones en el mismo bloque de horario, Multi-gateway de pagos (Culqi/Openpay).

> Roadmap interno detallado (no público): `docs/coming-updates-core.md`. La sección de "Roadmap público" de la landing fue eliminada (decisión de negocio); en su lugar la home muestra la sección "Yenda no deja de crecer" con teasers de Próximamente.

---

## 13. Hooks y Componentes Clave

### Custom Hooks
| Hook | Propósito |
|------|----------|
| `useUser` | Usuario autenticado de Supabase (subscribe a cambios de auth) |
| `useUserProfile` | Perfil extendido (full_name, role, avatar) |
| `useUserAvatar` | Avatar del usuario: avatar_url + avatar_option (silueta SVG) desde user_profiles |
| `useOrgRole` | Rol actual en la org + helpers: `isAdmin`, `isOwner`, `isDoctor`, `hasMinRole()` |
| `usePlan` | Plan + suscripción + uso actual. Helpers: `isNearLimit()`, `isAtLimit()`, `getLimit()` |
| `useBilling` | Info de billing de Mercado Pago + `addAddon()` para comprar extras |
| `useCurrentDoctor` | Registro de doctor vinculado al usuario actual (solo para rol doctor) |
| `useAiQuota` | Cuota de consultas IA: `{ used, limit, remaining, percentage }` |
| `useOrgAddons` | Catálogo de módulos + activación por org. Helpers: `hasAddon(key)`, `toggleAddon(key, enabled)`, `refetch()`. Usado para gating condicional de features (ej. tab de Crecimiento en el drawer de paciente) |

### Jerarquía de Roles (para `hasMinRole`)
`doctor(0) < receptionist(1) < admin(2) < owner(3)`

### Componentes de Historia Clínica
| Componente | Propósito |
|-----------|----------|
| `clinical-note-panel.tsx` | Editor SOAP completo: secciones color-coded, CIE-10 autocomplete, vitales colapsables, aplicar plantilla, firma digital, auto-save 30s, impresión |
| `clinical-note-print.tsx` | Vista de impresión de nota clínica firmada |
| `prescription-print.tsx` | Vista de impresión de receta médica con lista de medicamentos y firma |
| `clinical-history-modal.tsx` | Modal expandido (max-w-5xl) de historia clínica para vista legible desde drawer de pacientes |
| `clinical-followups-panel.tsx` | Panel de seguimientos con semáforo (rojo/amarillo/verde), crear y resolver |
| `clinical-attachments-panel.tsx` | Upload drag-drop de archivos médicos, descarga, eliminación |
| `prescriptions-panel.tsx` | Gestión de recetas con UI expandible, toggle activa/suspendida |
| `treatment-plans-panel.tsx` | Planes de tratamiento con barra de progreso y sesiones |
| `diagnosis-history-panel.tsx` | Timeline de diagnósticos con frecuencia y códigos CIE-10 |
| `admin/clinical-templates/page.tsx` | CRUD de plantillas clínicas (global/personal, 15 especialidades) |
| `exam-orders-panel.tsx` | Panel de órdenes de exámenes: búsqueda en catálogo, selección múltiple, indicaciones, tracking de estado |
| `exam-order-print.tsx` | Vista de impresión de orden de exámenes A5 con diagnóstico y firma |
| `admin/exam-catalog/page.tsx` | CRUD de catálogo de exámenes por categoría (Laboratorio, Imagenología, etc.) |

### Componentes de Arquitectura
| Componente | Propósito |
|-----------|----------|
| `OrganizationProvider` | Context: org actual, rol, isOrgAdmin. Auto-healing si membership falta |
| `LanguageProvider` | Context: idioma (es/en), función `t()` con 100+ keys de traducción |
| `ThemeProvider` | Context: tema dark/light con persistencia en localStorage |
| `RoleGate` | Renderizado condicional por rol: `<RoleGate minRole="admin">...</RoleGate>` |
| `PlanLimitWarner` | Toast automático al 80% y 100% de uso de recursos del plan |
| `AiAssistantPanel` | Panel flotante de chat AI con queries SELECT sobre la DB |
| `Sidebar` | Navegación lateral: drawer en mobile (hamburger), colapsable en desktop |
| `Topbar` | Header con hamburger (mobile only), email, avatar, notificaciones |
| `MobileNavProvider` | Context compartido para estado del drawer mobile sidebar |
| `BorderAvatar` | Avatar con anillo emerald, badge verificado, soporte para foto + silueta SVG |
| `AvatarSilhouette` | 4 siluetas SVG: Doctor, Doctora, Admin, Recepcionista |
| `ShimmerText` | Texto con efecto shimmer animado (gradiente sweep) |
| `StarButton` | Botón con animación de luz orbital en borde |

### Rate Limiting (API)
| Limiter | Límite |
|---------|--------|
| `aiLimiter` | 10 req/min |
| `paymentLimiter` | 5 req/min |
| `emailLimiter` | 3 req/min |
| `generalLimiter` | 30 req/min |
| `webhookLimiter` | 60 req/min |

### Utilidades (`lib/`)
| Módulo | Propósito |
|--------|----------|
| `lib/supabase/client.ts` | Cliente Supabase para browser (SSR package) |
| `lib/supabase/server.ts` | Cliente Supabase async para Server Components/API |
| `lib/supabase/middleware.ts` | Auth middleware con rutas públicas/protegidas, plan enforcement y security headers |
| `lib/supabase/admin.ts` | `createAdminClient()` — cliente con service role key (bypassa RLS) |
| `lib/utils.ts` | `cn()`, `formatDate()`, `formatCurrency()`, `getInitials()`, `truncate()` |
| `lib/constants.ts` | APP_NAME ("Yenda"), roles, tipos de org |
| `lib/rate-limit.ts` | Rate limiter in-memory con sliding window |
| `lib/email-template.ts` | Builder de HTML para emails transaccionales |
| `lib/scheduler-config.ts` | Config del scheduler (DB + localStorage cache): horarios, intervalos, días deshabilitados. Funciones: `fetchSchedulerConfig()`, `saveSchedulerConfigToDb()` |
| `lib/encryption.ts` | AES-256-GCM encrypt/decrypt con `ENCRYPTION_KEY` env var. Formato iv:authTag:ciphertext. Fallback a plaintext en dev |
| `lib/peru-locations.ts` | Mapa de departamentos → distritos de Perú |
| `lib/mercadopago/client.ts` | Clientes singleton de Mercado Pago SDK |
| `lib/validations/*.ts` | Schemas Zod para cada entidad (account, patient, doctor, appointment, clinical-note, clinical-template, etc.) |
| `lib/validations/api.ts` | Schemas Zod específicos para validación de body en API routes |
| `lib/api-utils.ts` | `parseBody()` — helper para parsear y validar JSON con Zod en API routes |
| `lib/send-notification.ts` | Fire-and-forget helper para llamar `/api/notifications/send` |
| `lib/payment-icons.ts` | `getPaymentIcon()` — mapea métodos de pago a íconos Lucide |
| `lib/export.ts` | `exportToCSV()` — exportación CSV con BOM para Excel. `calculateAge()` — cálculo de edad desde fecha de nacimiento |
| `lib/whatsapp-clipboard-config.ts` | Config WhatsApp clipboard: `loadWaClipboardConfig()`, `saveWaClipboardConfig()`, `buildWhatsAppMessage()`. Variables de plantilla, persistencia en localStorage |

---

## 14. Convenciones de Código

| Área | Convención |
|------|-----------|
| Archivos | kebab-case (`patient-form-modal.tsx`) |
| Componentes | PascalCase (`PatientFormModal`) |
| Base de datos | snake_case (`appointment_date`) |
| Server vs Client | Server Components por defecto, `"use client"` solo cuando se necesita |
| Supabase clients | Siempre desde `lib/supabase/` — NUNCA crear inline |
| RLS | Todas las tablas DEBEN tener RLS habilitado |
| Formularios | React Hook Form + Zod validation |
| Mutations | Server Actions para simple, API routes para complejo |
| Color primario | Emerald green |
| Tema | Dark por defecto |

---

## 15. Comandos de Desarrollo

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run lint         # Linter
npm run types        # Regenerar tipos de Supabase
npm run db:push      # Push migraciones a Supabase
npm run db:reset     # Reset completo de DB
```

---

## 16. Variables de Entorno Requeridas

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_ID=
MP_ACCESS_TOKEN=
NEXT_PUBLIC_APP_URL=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
ANTHROPIC_API_KEY=
MP_WEBHOOK_SECRET=
ENCRYPTION_KEY=           # Opcional: AES-256 para encriptar TOTP secrets (32+ chars)
CRON_SECRET=              # Bearer token para cron jobs (32+ chars)
MP_TEST_PAYER_EMAIL=      # Email del comprador de prueba MP (solo test mode)
```

---

## 17. Notas para Sesiones de Desarrollo

### Al iniciar una nueva sesión:
1. Leer este PRD para contexto completo
2. Revisar `git log --oneline -20` para ver cambios recientes
3. La rama principal de desarrollo actual es `main`
4. Verificar con `npm run build` antes de pushear cambios importantes

### Decisiones de Arquitectura Tomadas:
- **Multi-tenant desde migración 013** — No se puede revertir, todo el modelo depende de `organization_id`
- **Doctores sincronizados con miembros** — No se crean doctores manualmente, se vinculan desde `organization_members` con rol `doctor`
- **Planes con soft limits** — Los límites se verifican en frontend/API, no con constraints de DB
- **Mercado Pago como gateway único** — Sin soporte para Stripe por ahora
- **Español como idioma principal** — Interfaz y seeds en español, con soporte i18n para inglés
- **Plugins per-org (mig 169)** — Capa 2 de features ultra-específicos (templates de PDF custom, etc.) se activa por org desde el Founder Panel. No expuesto al admin de la clínica. Cada plugin declara sus `requires_addons` y se valida en runtime contra `organization_addons`.
- **El gutter de página vive en un div interno del `main`, no en el scroller** — un scroll container suma su padding del lado final al área desplazable, así que con el padding en el propio `main` las páginas full-bleed (que lo cancelan con `-mx-4`) generaban scroll horizontal de toda la página. `overflow-x-hidden` en el `main` queda solo como red de seguridad: los scrolls laterales legítimos (tab-lists, tablas anchas, matrices de settings) viven en sus propios contenedores internos.
- **Responsive: desktop ≥md idéntico, con una excepción acotada** — los fixes móviles se hacen con clases base + variantes `sm:`/`md:` que restauran exactamente el layout de escritorio. La única excepción autorizada (founder, 2026-08-07) es el **marco exterior** de las 5 páginas tipo app (Seguimientos, Histórico, Pacientes, Reportes, Facturación), que en ≥md cancelan el gutter del layout y quedan borde-a-borde. El gutter visible pasa a ser el `px-4 md:px-6` de sus headers internos.
- **Escritura de `notifications` solo vía `notify_org_members()`** (mig 192) — no se insertan filas a mano desde el cliente ni desde API routes. El routing por rol y el filtrado del doctor por sus propias citas viven dentro de la RPC; saltárselo rompe el aislamiento que la RLS de la tabla asume.

## 17.5. Roadmap — Visual Builder de Templates de Presupuesto

**Estado**: planificado, sin fecha. Foundation lista (sistema de plugins per-org + Capa 2 con HTML+Handlebars+Puppeteer ya en producción para Vitra).

### Problema que resuelve

Hoy cada org que necesita un PDF de presupuesto custom (estilo Vitra) requiere:
1. Diseñador externo (Claude Design / nosotros) que arma el `.hbs`
2. Push de código + redeploy
3. Vitra/Patricia no puede ajustar nada visualmente — solo strings en el JSONB de `org_plugins.config`

Eso no escala más allá de ~10 clínicas premium.

### Visión

Un constructor visual **simple** — explícitamente **no estilo Elementor**. Un entorno básico donde la org pueda:

- **Agregar secciones** de texto, tablas, separadores, imágenes
- **Editar estilos** desde un panel lateral con valores CSS predefinidos (color, padding, font-size, alignment) sin tocar código
- **Insertar variables** del sistema desde un dropdown (`{{paciente.nombre}}`, `{{tier.fase2.subtotal}}`, etc.) — autocomplete con las columnas disponibles según el contexto del PDF
- **Fórmulas simples** para totales (suma/resta de campos) sin expresiones arbitrarias
- **Preview en vivo** mientras edita
- **Persistencia** de la plantilla como JSON estructurado en `org_plugins.config` (o tabla propia si crece)

### Decisión deliberada de NO incluir (para que esto sea construible)

- Drag-and-drop de bloques con posicionamiento libre (`Elementor`)
- Múltiples plantillas por tier con variantes condicionales
- Versionado / undo histórico
- Diseño responsivo
- Custom CSS arbitrario
- JavaScript ejecutable en la plantilla

Mantener el alcance acotado a "secciones lineales + variables + fórmulas básicas" es lo que diferencia 1-2 meses de trabajo vs 6+ meses.

### Cuándo construirlo

Cuando lleguen 30-40 orgs distintas pidiendo templates custom y vos (founder) te estés volviendo el cuello de botella diseñando `.hbs` a mano. Antes de eso, **mantener el flujo actual** (founder instala plugin con HTML pre-hecho + edita JSONB) escala perfectamente.

### Plan de construcción por fases (decisión 2026-08-03)

Del análisis "builder de presupuestos + perfiles de org" salió el orden de ataque:

- **Fase 0 — motor de secciones SIN UI** (se puede adelantar antes del umbral): definir el formato JSON de plantilla por secciones (texto, tabla de precios, separador, imagen, variables) y un renderer que lo consuma, cuyo primer caso de uso es **reproducir byte-a-byte el documento genérico actual** (`lib/budget-pdf/document.tsx`) como una plantilla de secciones. Cero UI nueva: el founder edita el JSON a mano igual que hoy edita `org_plugins.config`. Esto valida el modelo de datos del builder con un consumidor real antes de invertir en editor visual, y convierte el PDF genérico en la primera plantilla del sistema (menos código especial, no más).
- **Fase 1+ — el builder visual** (recién al umbral de 30-40 orgs de arriba): panel de edición, estilos predefinidos, dropdown de variables, fórmulas simples y preview — sobre el motor ya probado de Fase 0.

Los dos flags de mig 181 (`documents_enabled`, `pricing_mode`) ya cubren los perfiles simples sin builder; el builder solo se justifica para orgs que quieren *diseño* propio, no solo *contenido* propio.

### Prerequisitos arquitectónicos (ya cumplidos)

- ✅ Sistema de plugins per-org con config JSONB editable (mig 169, esta sesión)
- ✅ Pipeline HTML+Handlebars+Puppeteer en Vercel (sparticuz/chromium, sesión previa)
- ✅ Capa 2 desacoplada del addon de fertilidad
- ✅ Modos de presupuesto por org (mig 181): `documents_enabled` + `pricing_mode` en `org_budget_pdf_settings`


---

## 18. Sistema de Especialidades Médicas

> **Estado:** Fase 1 implementada (infraestructura + onboarding). Fases 2-4 pendientes.

### Arquitectura

```
specialties (catálogo global, 28 especialidades seed)
├── organization_specialties (many-to-many: org ↔ especialidades activas)
├── organizations.primary_specialty_id (acceso rápido a la principal)
├── doctor_specialties (pendiente: doctor ↔ especialidades)
└── specialty_clinical_data (JSONB genérico para datos clínicos por especialidad)
```

### Tablas existentes (migradas)

| Tabla | Estado | Descripción |
|---|---|---|
| `specialties` | Migrada | 28 especialidades LATAM con slug, icon, description |
| `organization_specialties` | Migrada | Vínculo org ↔ especialidad (many-to-many) |
| `organizations.primary_specialty_id` | Migrada | FK a especialidad principal |
| `specialty_clinical_data` | Migrada | Almacén genérico JSONB para datos clínicos por especialidad |

### Migraciones futuras (NO implementar aún)

| Migración | Tabla/Cambio | Propósito | Cuándo |
|---|---|---|---|
| `doctor_specialties` | `doctor_id UUID, specialty_id UUID, UNIQUE(doctor_id, specialty_id)` | Vincular doctores a sus especialidades individuales | Fase 2 (primer módulo vertical) |
| `specialty_modules` | `id, specialty_id, name, slug, module_type, config JSONB` | Registro de módulos disponibles por especialidad | Fase 2 |
| `organization_modules` | `organization_id, module_id, is_active, activated_at` | Qué módulos tiene activos cada org | Fase 2 |
| `specialty_field_definitions` | `specialty_id, field_name, field_type, field_config JSONB` | Campos personalizados por especialidad (ej: "presión intraocular" para oftalmología) | Fase 3 |

### Lógica de visibilidad de tabs clínicos (Fase 2)

```
Rol Owner/Admin:
  → Ve TODOS los tabs de especialidades activas de la org
  → Ve tabs "Histórico" (solo lectura) de especialidades desactivadas con datos

Rol Doctor:
  → Ve solo tabs de SUS especialidades (via doctor_specialties)
  → Si la org tiene 1 sola especialidad → ve todo (no necesita filtro)

Rol Recepcionista:
  → No ve tabs clínicos de especialidad (solo datos generales del paciente)
```

### Cambio de especialidad — Reglas

| Regla | Detalle |
|---|---|
| Quién puede cambiar | Solo Owner, desde Settings → General |
| Confirmación requerida | Modal: "¿Estás seguro? Los datos clínicos previos se mantendrán" |
| Datos al cambiar | **Nunca se borran.** Se ocultan tabs, datos persisten en `specialty_clinical_data` |
| Datos previos | Se muestran en tab "Histórico" en modo solo lectura |
| Al reactivar especialidad | Todos los datos reaparecen con escritura habilitada |
| Impacto en billing | Cambio de especialidad no cancela add-ons pagados |
| Sin política DELETE | `specialty_clinical_data` no tiene DELETE policy (cumplimiento legal/auditoría) |

### Especialidades seed (28)

Medicina General, Odontología, Ginecología y Obstetricia, Pediatría, Dermatología, Oftalmología, Cardiología, Endocrinología, Endocrinología Pediátrica, Medicina Reproductiva, Nutrición, Psicología, Psiquiatría, Traumatología y Ortopedia, Otorrinolaringología, Urología, Neurología, Gastroenterología, Neumología, Fisioterapia, Cirugía General, Cirugía Plástica, Medicina Estética, Oncología, Nefrología, Reumatología, Medicina Interna, Otra especialidad.

### Fases de implementación

| Fase | Contenido | Estado |
|---|---|---|
| **Fase 1** | Tablas `specialties`, `organization_specialties`, `specialty_clinical_data`. Select con búsqueda en onboarding. Primary specialty en org. | Implementado |
| **Fase 2** | Infraestructura de addons (`addons`, `organization_addons`). Auto-activación por especialidad en onboarding. UI de gestión en Settings → Módulos. Primer módulo vertical entregado: **Curvas de crecimiento OMS** para endocrinología pediátrica / pediatría (migraciones 091, 092). | Parcialmente implementado |
| **Fase 3** | Tabla `doctor_specialties`. Tabs condicionales en historia clínica según especialidad del doctor. Módulos premium cobrables (campo `is_premium` + `min_plan` ya presentes en catálogo). Campos custom por especialidad. | Pendiente |
| **Fase 4** | Marketplace de módulos. Módulos creados por terceros. API para extensiones. | Futuro |

### Primeros módulos verticales candidatos

| Especialidad | Módulo | Funcionalidades clave | Estado |
|---|---|---|---|
| Endocrinología Pediátrica / Pediatría | Curvas de crecimiento (`growth_curves`) | Percentiles OMS P3/P15/P50/P85/P97 para peso, talla, IMC y perímetro cefálico. Z-score por medición. Trayectoria del paciente superpuesta. Banda P3–P97 sombreada. | **Implementado (migración 092)** |
| Medicina Reproductiva | Tracking de fertilidad | Ciclos de estimulación, conteo de óvulos, etapas FIV, criopreservación | Pendiente |
| Odontología | Odontograma | Mapa dental visual, plan de tratamiento por pieza, historial por diente | Pendiente |
| Dermatología | Mapa corporal | Fotos comparativas, seguimiento de lesiones, antes/después | Pendiente |
| Nutrición | Plan nutricional | IMC, macros, plan alimenticio, seguimiento de peso con gráfica | Pendiente |
| Oftalmología | Examen visual | Agudeza visual, presión intraocular, fondo de ojo, receta de lentes | Pendiente |

---

## 19. Historial de cambios

El registro cronológico completo de cambios (51+ entradas de changelog, desde 2026-03-23 hasta v0.15.29 / 2026-08-12) se movió a **[CHANGELOG.md](CHANGELOG.md)** para mantener este PRD enfocado en el estado canónico del producto.

- **[CHANGELOG.md](CHANGELOG.md)** — todas las sesiones de desarrollo en orden cronológico ascendente, más el hito del pilot de Vitra y el apéndice con el detalle de features implementadas.
- Convención de versionado: `v0.MAYOR.MENOR`; las colisiones históricas de numeración están anotadas en el propio CHANGELOG (sufijos `b`).

---
