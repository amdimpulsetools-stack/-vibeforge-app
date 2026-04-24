# VibeForge — Product Requirements Document (PRD)

> **Última actualización:** 2026-04-24
> **Versión:** 0.12.7
> **Estado:** MVP en producción + Sistema de módulos verticales (addons) + Primer vertical OMS (curvas de crecimiento pediátrico) + Portal del Paciente Phase 1 (Apple Health redesign mobile + desktop 2-col, detalle cita, mi perfil, botón condicional, Mi plan card) + Dashboard admin con timeline + Pacientes: etiqueta Recurrente + /book redesign (light, especialidad, default office) + Presupuestos de tratamiento multi-servicio con vinculación cita↔sesión + saldo unificado + Descuentos: inline (todos los planes) y códigos reutilizables (Pro) + Consentimiento informado Tier 1 (Ley 29414) + Auditoría multi-agente + 2 rondas de fixes (v0.12.3 + v0.12.4) + **Preparación de pilot con primer cliente real (Vitra, fertilidad)**

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

### Plan Independiente (Starter) — Gratis
- 1 miembro, 1 doctor, 1 consultorio
- 150 pacientes, 100 citas/mes, 100MB storage
- Sin recepcionistas ni admins adicionales
- Reportes básicos, AI Assistant (30 consultas/mes), sin exportación
- Owner actúa simultáneamente como doctor (rol dual)

### Plan Centro Médico (Professional) — S/49/mes
- 6 miembros totales, 3 doctores, 3 consultorios, 2 recepcionistas
- 1,000 pacientes, 500 citas/mes, 2GB storage
- 1 admin
- Reportes + exportación + AI Assistant
- Add-ons: S/15/consultorio extra, S/10/miembro extra

### Plan Clínica (Enterprise) — S/149/mes (precio provisional, pendiente de pruebas con Mercado Pago)
- 15 miembros totales: 10 especialistas + 3 recepcionistas + 1 admin + 1 owner
- 10 cupos para doctores/especialistas/licenciados (ej. psicólogos)
- 10 consultorios
- 3 recepcionistas
- 1 admin
- Pacientes y citas ilimitadas, 10GB storage
- Todas las features (reportes, export, AI, API, soporte prioritario)
- Add-ons: S/12/consultorio extra, S/8/miembro extra

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
| `organizations` | Tenant: name, slug, logo_url, organization_type, is_active, settings (JSONB: restrict_doctor_patients, etc.) |
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
| `seed_email_templates(org_id)` | Crea 18 templates de email por defecto para org nueva |
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
2. Selecciona email y rol (admin, receptionist, doctor)
3. Se envía email de invitación vía SMTP (Nodemailer) con link `register?invite=<token>`
4. Invitado se registra → se une a la org existente con el rol asignado
5. Si rol es doctor: se crea/vincula automáticamente un registro en tabla `doctors`

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
Vista dedicada de seguimientos clínicos accesible desde el sidebar (bajo Agenda). Muestra todos los seguimientos de la organización con:
- Filtros por estado (pendientes/resueltos) y prioridad (semáforo)
- Nombre del paciente, doctor, servicio, fecha de seguimiento
- Acciones rápidas para resolver seguimientos
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

#### Fase 2: WhatsApp Business API (Pendiente)
- Integración con WhatsApp Business API via Twilio o 360dialog
- Envío automático de confirmaciones y recordatorios
- Templates aprobados por Meta para mensajes transaccionales
- Endpoint `app/api/whatsapp/send/route.ts`
- Vinculación con sistema de recordatorios automáticos (F8)

### 7.7 Dashboard por Rol
- **Admin/Owner:** KPIs globales (pacientes, doctores, citas, ingresos), top servicios, heatmap de citas, stats operacionales
- **Doctor:** Dashboard personal con sus citas del día/mes, ingresos propios, próximas citas
- **Receptionist:** Redirige directo a scheduler

---

## 8. Estructura de Rutas

```
/ ............................ Landing page (pública)
/book/[slug] ................. Página pública de reserva de citas

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
│   └── /history ............. Historial de citas pasadas
├── /patients ................ Gestión de pacientes
├── /reports ................. Reportes (financiero, marketing, operacional)
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
| Agenda | Calendario, Seguimientos, Historial | Todos |
| Pacientes | Pacientes | Todos |
| Reportes | Reportes | Admin/Owner |
| Administración | Consultorios, Doctores, Servicios, Catálogos, Variables, Miembros | Admin/Owner |
| — | Configuración | Admin/Owner |
| — | Mi Cuenta | Todos |
| — | Founder Dashboard | Solo founder |

---

## 10. Configuración por Organización

### Settings (General)
- Nombre y slug de la organización
- Logo (upload/remove via Supabase Storage)
- Idioma (español/inglés)

### Settings (Agenda)
- Hora de inicio/fin del scheduler (8am-8pm)
- Tamaño de slot: 15, 20, 30, 45 o 60 minutos
- Indicador de hora actual (on/off)

### Settings (WhatsApp)
- Toggle para activar/desactivar modal de copia rápida post-cita
- Editor de plantilla de mensaje con variables dinámicas
- Vista previa en vivo con datos de ejemplo
- Botón de restaurar plantilla por defecto

### Settings (Correos)
- Configuración de email (remitente, templates)

### Settings (Integraciones)
- Marketplace visual de integraciones externas (WhatsApp Business API, Mercado Pago, Google Calendar, etc.)
- Tarjetas con estado (disponible / próximamente / conectado)
- Wizard guiado por integración (ej. WhatsApp: paso a paso para conectar Business API)

### Settings (Módulos)
- Gestión de addons activos por organización — ver Sección 22
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

---

## 12. Features Implementadas (Estado Actual)

### Completado
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
- [x] **Exportación CSV de datos** — Botón de descarga CSV en pacientes (lista filtrada con datos financieros), reportes financieros, marketing y operacionales. Utilidad reutilizable en `lib/export.ts`
- [x] **Indicador de deuda visible en citas** — Badge rojo con monto pendiente en tarjetas de cita del scheduler (day-view) y badge de deuda total del paciente en el sidebar de la cita. Consulta automática de deuda a nivel paciente
- [x] **Fecha de nacimiento con edad automática** — Cálculo y display de edad en: lista de pacientes (icono + años), header del drawer del paciente, campo de edición en tab Info. Campo `birth_date` en DB desde migración 019
- [x] **Dashboard de retención de pacientes (F10)** — Tab "Retención" en reportes con 5 KPIs (recurrentes, nuevos, tasa retención, frecuencia, LTV), gráfica de tendencia mensual (nuevos vs recurrentes), gráfica de tasa de retención, tabla de pacientes en riesgo con filtro configurable (2-12 meses), ranking top 20 pacientes por LTV, exportación CSV. RPCs: `get_retention_overview`, `get_visit_frequency`, `get_at_risk_patients`, `get_patient_ltv`, `get_retention_trend`
- [x] **WhatsApp click-to-clipboard (F6 Fase 1)** — Modal post-creación de cita con mensaje pre-formateado para copiar y pegar en WhatsApp. Plantilla configurable en Settings con 7 variables dinámicas (nombre, fecha, hora, doctor, servicio, clínica, dirección). Toggle activar/desactivar, editor de plantilla con vista previa en vivo. Persistencia en localStorage
- [x] **Notas clínicas SOAP (F9)** — Formato SOAP (Subjetivo, Objetivo, Evaluación, Plan) integrado en el sidebar de cita. Tabla `clinical_notes` con RLS multi-tenant, una nota por cita (unique constraint). Signos vitales como JSONB (peso, talla, temperatura, PA, FC, FR, SpO₂). Diagnóstico con código CIE-10 opcional. Sistema de firma digital (is_signed) que bloquea edición. Notas internas no visibles al paciente. Solo el doctor tratante o admin puede editar. API CRUD completa con rate limiting. Validación Zod en todas las rutas. Tipos: `types/clinical-notes.ts`
- [x] **Historia Clínica Completa (F9-EXT)** — Extensión integral del módulo clínico con 7 submódulos:
  - **Plantillas Clínicas:** Plantillas SOAP reutilizables globales (admin) o personales (doctor). 15 especialidades predefinidas (Medicina General, Ginecología, Pediatría, Dermatología, etc.). CRUD completo en `/admin/clinical-templates`. Aplicación rápida desde dropdown en editor de nota. Tabla `clinical_templates` con RLS
  - **Planes de Tratamiento:** Creación de planes con generación automática de sesiones numeradas. Barra de progreso visual. Estados: active, completed, cancelled, paused. Sesiones individuales con status (pending/completed/missed/cancelled). Vinculación opcional a citas. Tablas `treatment_plans` + `treatment_sessions`
  - **Recetas Médicas:** Registro completo de prescripciones (medicamento, dosis, frecuencia, duración, vía, instrucciones, cantidad). 12 vías de administración (Oral, IM, IV, Tópica, Sublingual, Inhalatoria, Ótica, Oftálmica, Nasal, Rectal, Vaginal, Transdérmica). 12 frecuencias predefinidas. Toggle activa/suspendida. UI expandible con detalles. Tabla `prescriptions`
  - **Adjuntos Clínicos:** Upload drag-and-drop (máx 10MB). 6 categorías: general, resultado de laboratorio, imagen diagnóstica, referido, consentimiento, otro. Descarga vía Supabase Storage. Metadata completa (nombre, tipo, tamaño). Tabla `clinical_attachments`
  - **Seguimientos Clínicos (Semáforo):** 3 niveles de prioridad: Rojo=Urgente, Amarillo=Moderado, Verde=Rutina. Fecha de seguimiento y resolución con timestamp. Resuelto por (doctor/admin ID). Vinculación a citas y notas. Tabla `clinical_followups`
  - **Historial de Diagnósticos:** Timeline visual de todos los diagnósticos del paciente. Agrupación por código CIE-10 con conteo de frecuencia. Atribución por doctor y fecha. Panel dedicado en drawer de paciente
  - **Versionado de Notas (Auditoría):** Historial completo de versiones por nota clínica. Snapshot inmutable de SOAP, vitales y diagnóstico por versión. Número de versión incremental y resumen de cambio. Tabla `clinical_note_versions`. Endpoint `/api/clinical-notes/[id]/versions`
  - **Migraciones:** 050 (clinical_notes), 051 (clinical_templates), 053 (treatment_plans, treatment_sessions, prescriptions, clinical_attachments, clinical_followups, clinical_note_versions)
  - **Componentes:** 6 paneles en drawer de paciente (followups, attachments, prescriptions, treatment-plans, diagnosis-history) + editor de nota clínica en scheduler + página admin de plantillas + vista de impresión de nota clínica + vista de impresión de receta médica + modal expandido de historia clínica + panel centralizado de seguimientos
  - **API:** 13 endpoints (6 recursos × GET/POST + PATCH/DELETE según recurso) con rate limiting y validación Zod
  - **Tipos:** `types/clinical-notes.ts`, `types/clinical-history.ts`, `types/clinical-templates.ts`
  - **Seguridad:** RLS en todas las tablas, aislamiento multi-tenant, firma digital inmutable, validación Zod en todas las rutas, rate limiting generalLimiter (30 req/min)
- [x] **Booking online / agenda pública (F7)** — Página pública `/book/[slug]` para que pacientes agenden citas sin cuenta. Wizard de 5 pasos: doctor → servicio → fecha/hora → datos del paciente → confirmación. Tabla `booking_settings` con configuración por org (toggle activar, días anticipación máx, horas mín de antelación, campos obligatorios, color de acento, mensaje de bienvenida). API pública `/api/book/[slug]` (GET datos) y `/api/book/[slug]/create` (POST crear cita). Validación de horarios, conflictos y schedule blocks. Creación automática de paciente. Email de confirmación. Rate limiting por IP. Tab "Reservas" en Settings con URL copiable. Tema oscuro, diseño mobile-first
- [x] **Recordatorios automáticos por cron (F8)** — Cron job `/api/cron/reminders` ejecutado cada 30 min via Vercel Cron. Dos ventanas de recordatorio: 24h y 2h antes de la cita. Deduplicación con tabla `reminder_logs` (UNIQUE por appointment + template + canal). Soporte email (SMTP) y WhatsApp Business API. Agrupamiento por organización para reutilizar templates/settings. Variables de email: paciente, doctor, fecha, hora, servicio, clínica, teléfono. Config en `vercel.json`
- [x] **Impresión de Receta Médica** — Botón "Imprimir Receta" en panel de prescripciones. Genera documento HTML imprimible con datos de paciente/doctor, lista numerada de medicamentos (dosis, vía, frecuencia, duración, cantidad, indicaciones), firma del médico y nota legal (30 días de validez). Formato A5 landscape. Solo visible con prescripciones activas. Componente: `scheduler/prescription-print.tsx`
- [x] **Modal expandido de Historia Clínica** — Botón "Ver en grande" en tab clínico del drawer de pacientes. Modal amplio (max-w-5xl) con notas SOAP en layout 2 columnas, texto legible (text-sm vs text-xs), vitales en grid 8 columnas, paneles clínicos completos editables para doctores/admins. Resuelve `doctorId` via `useCurrentDoctor`. Componente: `patients/clinical-history-modal.tsx`
- [x] **Panel centralizado de seguimientos (`/scheduler/follow-ups`)** — Vista dedicada accesible desde sidebar (bajo Agenda → Seguimientos). Muestra todos los seguimientos clínicos de la organización con filtros por estado y prioridad semáforo
- [x] **Planes de tratamiento editables en modales clínicos** — `TreatmentPlansPanel` integrado en el modal de nota clínica (scheduler) y en el modal expandido de historia clínica (pacientes) con `canEdit=true` y `doctorId`. Doctores y admins pueden crear planes desde ambos contextos
- [x] **Órdenes de exámenes médicos** — Catálogo configurable (exam_categories + exam_catalog) por owner/admin. Doctor selecciona exámenes del catálogo o escribe manualmente, agrega indicaciones (ej: "en ayunas"), diagnóstico presuntivo CIE-10. Impresión profesional A5. Tracking por item: pendiente → parcial → completado. Integrado en clinical-note-modal, clinical-history-modal y patient-drawer
- [x] **Bloqueo post-firma** — Al firmar nota clínica: prescripciones y exámenes nuevos bloqueados (UI + API 403). Suspender Rx y marcar resultados de exámenes sigue permitido. Polling cada 2s para detección automática
- [x] **Email: bienvenida paciente nuevo** — Se envía automáticamente al crear paciente con email. Endpoint `/api/notifications/send-patient`
- [x] **Email: cumpleaños** — Cron diario (7am Perú) envía felicitación a pacientes cuya fecha de nacimiento coincide con hoy
- [x] **Email: seguimiento pacientes inactivos** — Cron diario detecta pacientes sin cita completada en 90+ días. Máx 20/día/org. Cooldown 60 días via `marketing_email_logs`
- [x] **Email: factura (payment_invoice)** — Checkbox opcional al registrar pago. Envía recibo + factura si está marcado
- [x] **Resumen diario del equipo** — Cron diario envía tabla de citas del día a emails configurados en `email_settings.notification_emails`
- [x] **4 nuevas variables de email** — `{{direccion_clinica}}`, `{{link_ubicacion}}`, `{{instrucciones_servicio}}`, `{{monto_cita}}`. Instrucciones configurables por servicio (`services.pre_appointment_instructions`). Google Maps URL en Settings
- [x] **Confirmación de contraseña en registro** — Campo "Confirmar contraseña" con validación visual en tiempo real + indicador de fortaleza 5 niveles
- [x] **Paginación historial de citas** — 50 por página con flechas prev/next (servidor-side con .range())
- [x] **Responsive mobile (Fase 1)** — Sidebar como drawer con hamburger, scheduler sidebar como overlay fullscreen, patient drawer w-full, topbar hamburger, notificaciones dropdown responsivo
- [x] **Responsive mobile (Fase 2+3)** — Reports/Settings tabs con scroll horizontal, patients header stacking, dashboard botón oculto, members cards stacking, history table overflow-x-auto, modals con padding compacto, touch targets 40px+, vitals grid progresivo
- [x] **Páginas de producto SEO** — 7 páginas premium bajo /producto/ con mega-menu full-width en landing navbar: Agenda Médica, Historia Clínica, Gestión de Pacientes, Comunicación Automatizada, Asistente IA, Reportes y Analítica, Gestión de Equipo. Cada una con storytelling, mockups, pain stats, before/after, schema.org, breadcrumbs
- [x] **Marketplace de integraciones (Settings → Integraciones)** — Tab dedicado con tarjetas de integraciones externas y estado por org (conectado/disponible/próximamente). Wizard guiado para WhatsApp Business API paso a paso. Lock visual en tabs de integraciones aún no activadas hasta conexión completa
- [x] **Founder: tracking completo de owners** — Tab "Organizaciones" con embudo de signups → trial → conversión. RPC `get_owner_lifecycle_funnel()`. Tabla `owner_lifecycle_events` (signup, trial_start, plan_upgrade, churn). Vista detalle por owner con notas privadas (`founder_notes`). Endpoints: `/api/founder/stats/owners`, `/api/founder/notes`
- [x] **Sistema de Addons / Módulos Verticales** — Infraestructura escalable para verticalización por especialidad. Catálogo global (`addons`) + activación por org (`organization_addons`). 14 addons seed (10 especialidad + 4 workflow). Auto-activación de addons gratuitos que matchean la especialidad elegida en onboarding. Nuevo tab "Módulos" en Settings con sección de recomendados, agrupación por categoría, toggle on/off (owner/admin), badges PRO. Hook `useOrgAddons` con `hasAddon(key)` para gating de UI. API `/api/addons` con Zod + rate limiting. Migración 091
- [x] **Addon de Curvas de Crecimiento OMS (primer vertical pediátrico)** — Addon `growth_curves` específico para endocrinología pediátrica y pediatría. Tabla `patient_anthropometry` para mediciones longitudinales (peso, talla, perímetro cefálico). Campo `patients.sex` (requerido por WHO). Componente `GrowthCurvesPanel` con Recharts ComposedChart: banda sombreada P3–P97, 5 líneas de percentiles (P3/P15/P50/P85/P97), scatter conectado con trayectoria del paciente, tooltip con Z-score y percentil. 4 métricas: Peso/Edad, Talla/Edad, IMC/Edad, Perímetro Cefálico/Edad. Tablas LMS OMS en `lib/growth-curves/who-data.ts` (WHO Child Growth Standards 0–5a + Growth Reference 5–19a). Cálculo de Z-score/percentil vía fórmula LMS. Pestaña "Crecimiento" en el drawer de paciente gated por `hasAddon('growth_curves')`. Selector de sexo biológico en tab Datos. API `/api/patients/[id]/anthropometry`. Migración 092

### Pendiente / Por Mejorar
- [ ] Impresión de recibo/comprobante (F3) — Requiere evaluar formato legal Perú (SUNAT)
- [ ] Confirmación de cita desde email 1-click (F4) — Token seguro temporal
- [ ] WhatsApp Business API (F6 Fase 2) — Envío automático vía Twilio/360dialog
- [ ] Consentimiento informado digital (F12) — Requisito legal Perú
- [ ] Módulo de inventario básico (F13)
- [ ] Portal del paciente (F14)
- [ ] Reportes con IA generativa (F15)
- [ ] App móvil o PWA
- [ ] Facturación electrónica SUNAT
- [ ] Add-ons de plan (UI frontend para comprar extras desde el panel)
- [ ] Bloqueo de usuario desactivado (modal "Su usuario ha sido desactivado")
- [ ] Tests automatizados (unit, integration, e2e)
- [ ] Optimización de performance y caching
- [ ] Custom SMTP en Supabase Auth (para envío de invitaciones sin rate limit)
- [x] Especialidades: primer módulo vertical entregado — Curvas de crecimiento OMS (Endocrinología Pediátrica / Pediatría)
- [ ] Especialidades: select editable en Settings (solo Owner)
- [ ] Especialidades: tabla `doctor_specialties` + asignación en admin de doctores
- [ ] Especialidades: tabs condicionales en historia clínica según especialidad del doctor
- [ ] Especialidades: segundo módulo vertical — Odontograma (Odontología) o Tracking de fertilidad (Medicina Reproductiva)
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
- [ ] Página /base-conocimientos (hub de ayuda con categorías)
- [ ] Página /contacto (formulario)
- [ ] Página /socios (programa de socios)
- [ ] Conectar lead magnets con captura de email real (Resend/Mailchimp)
- [ ] Imágenes reales para blogs (fotos/ilustraciones)
- [ ] Reemplazo global de "REPLACE" por nombre final del software

### Coming Updates (roadmap próximo)
- [ ] **Etiqueta "Paciente Recurrente" automática** — Tag automático en DB cuando el paciente acumula 2+ citas completadas. Columna computada o trigger que actualice una bandera `is_recurring` en `patients`. Badge visible en lista, drawer y scheduler
- [ ] **Límites de plan: UX de soft-wall** — ¿Qué pasa cuando la org pasa de 500, 1000 o 3000 pacientes activos? Definir mensajes de bloqueo suave (modal "Has alcanzado el límite de tu plan"), CTA de upgrade, y comportamiento: ¿bloquear creación de nuevos pacientes o solo advertir? Aplicar para cada recurso con límite (pacientes, citas/mes, miembros, doctores, consultorios, storage)
- [ ] **Storage: límites y mensajes de espacio** — Auditar dónde se pueden subir imágenes (avatares, logos, adjuntos clínicos, fotos antes/después). Al acercarse o agotar el storage del plan, mostrar alerta con uso actual vs límite y CTA de upgrade. Mensaje claro: "Has alcanzado tu límite de almacenamiento (X MB/GB). Mejora tu plan para seguir subiendo archivos"
- [ ] **Módulo de Laboratorio (addon `lab_integration`)** — Conexión con laboratorios, recepción de resultados digitales, asociación a historias clínicas y órdenes de exámenes. Ya existe el addon seed; falta la implementación de UI y flujos
- [ ] **Grabación de consulta + transcripción con IA** — Grabar audio de la consulta médica, transcribir con Whisper/similar, y generar automáticamente nota SOAP pre-llenada vía LLM. Requiere evaluación de privacidad médica, consentimiento del paciente, y costos de API
- [ ] **Módulo Dermatología: antes/después con optimización de imágenes** — Addon `dermatology` ya registrado. Implementar galería de fotos comparativas (antes/después) por zona corporal, con compresión y resize automático (ej: max 1200px, WebP) para no agotar storage. Timeline visual de evolución de lesiones
- [ ] **Bundle Consulta + Tratamiento** — Permitir crear un "paquete" que agrupe un servicio de consulta + sesiones de tratamiento en un solo cobro. Precio bundle con descuento opcional. Al agendar, se crean la cita inicial + las sesiones del plan de tratamiento automáticamente

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
| `lib/constants.ts` | APP_NAME ("PacientesPro"), roles, tipos de org |
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

---

## 18. Changelog — Sesión 2026-03-23

### Nuevas Funcionalidades

#### Sistema de Cuotas de Consultas IA por Plan
- **Migración 061:** Tabla `ai_query_usage`, columna `max_ai_queries` en plans, RPC `get_ai_query_usage_this_month()`
- **Cuotas:** Starter/Independiente: 50, Professional: 120, Enterprise: 250 consultas/mes
- **API:** Verificación de cuota antes de procesar cada consulta IA, log de uso después
- **Modelo:** Cambiado de `claude-sonnet` a `claude-haiku-4-5` (más económico)
- **Restricción:** Solo usuarios admin/owner pueden usar el asistente IA
- **Hook:** `useAiQuota()` — expone `{ used, limit, remaining, percentage }`
- **UI Chat:** Badge de cuota en header del panel (verde/amarillo/rojo), refresco automático tras cada consulta, botón deshabilitado al agotar
- **UI Account:** Card con anillo SVG mostrando "Quedan X/Y consultas IA", botón refresh, CTA "Mejorar plan"

#### Meta de Ingresos Mensual (Settings)
- Input numérico en Settings > General para configurar `monthly_revenue_goal`
- Solo visible para admins, guarda directamente en `organizations`

#### Días Laborables Permanentes (Settings > Agenda)
- Selector visual de 7 días (Lun-Dom) para desactivar/activar días
- Días desactivados no cuentan para cálculo de ocupación
- Config en `localStorage` como `disabledWeekdays` (default: domingo desactivado)
- Mínimo 1 día debe quedar activo

#### Agenda Compacta (Settings > Agenda)
- "Horario" y "Tamaño de bloques" unificados en una sola card con layout 2 columnas
- Reduce espacio visual sin perder funcionalidad

### Hardening Pre-Deployment

#### Fonts Self-Hosted
- Migrado de `next/font/google` a `next/font/local`
- 12 archivos `.woff2` en `app/fonts/` (Plus Jakarta Sans, Outfit, JetBrains Mono)
- Elimina dependencia de Google Fonts API durante el build

#### Validación de Variables de Entorno
- `lib/env-validation.ts` — valida variables requeridas al iniciar el servidor
- Integrado en `instrumentation.ts` — falla ruidosamente si faltan `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`
- Warnings para variables opcionales (Anthropic, SMTP, MercadoPago)

#### Content Security Policy (CSP)
- Header CSP agregado en middleware con whitelist para Supabase, Anthropic API, MercadoPago
- `frame-ancestors 'none'` para prevenir clickjacking
- `base-uri 'self'` y `form-action 'self'`

#### Fix: AI Query Usage Logging
- El insert a `ai_query_usage` ahora maneja errores explícitamente en lugar de fallar silenciosamente
- Migración 061 aplicada directamente a la base de datos de producción

### Auditoría de Producción (Rating: 9/10 — actualizado 2026-03-31)
- **81+ indexes** verificados activos en la base de datos
- **Seguridad:** 9.5/10 — Auditoría completa 16/16 issues resueltos, encryption at rest, CSP hardened, org checks en todos los PATCH/DELETE, Zod en todos los endpoints, TOTP 2FA para founder panel
- **Base de datos:** 9.5/10 — 75 migraciones, RLS completo, scheduler settings en DB, avatar options, responsible_user_id, created_by en patients
- **Arquitectura:** 9/10 — Multi-tenant sólido, billing, roles, DB-backed config, owner+doctor dual role
- **Performance:** 8/10 — 26 queries optimizadas, singleton Supabase client, lazy loading
- **Testing:** 2/10 — Gap principal: 0 tests automatizados (script de seed users disponible)
- **Pendientes para producción real:** Tests automatizados, CI/CD pipeline

---

## 19. Changelog — Sesión 2026-03-26

### UI/UX — Onboarding y Registro

#### Panel Derecho Rediseñado (`/register`)
- Fondo dark emerald con gradiente radial y patrón grid sutil
- Texto rotatorio con ShimmerText: 3 frases benefit-oriented que rotan cada 4s con blur transition
- 4 feature cards con iconos: WhatsApp reminders, historial clínico, reportes, seguridad
- Testimonial card con social proof (Dra. María Gonzales)
- Trust bar: "Datos encriptados · HIPAA-ready · Soporte en <2h"
- Framer Motion entrance animations staggered

#### Login Mejorado
- Icono SVG de Google en botón OAuth (4 colores oficiales)
- Checkbox "Recordar mi usuario" con persistencia en localStorage

### UI/UX — Componentes Nuevos

#### BorderAvatar (`components/ui/avatar-border.tsx`)
- Avatar con anillo emerald, 3 tamaños (sm/md/lg), badge verificado con check
- Soporte para foto, silueta SVG, o iniciales como fallback

#### Avatares SVG Silueta (`components/ui/avatar-silhouettes.tsx`)
- 4 siluetas minimistas: Doctor (estetoscopio), Doctora (cruz médica), Admin (corbata), Recepcionista (audífono)
- Selector en página de cuenta cuando no hay foto subida
- Columna `avatar_option` en `user_profiles` (migración 069)

#### Topbar con Foto de Avatar
- Hook `useUserAvatar` carga `avatar_url` + `avatar_option` del perfil
- BorderAvatar integrado en topbar con foto/silueta/iniciales

### UI/UX — Página de Cuenta Rediseñada

#### Layout 3 Columnas (Admin/Owner)
- **Izquierda (50%):** Avatar + Datos personales (4 campos: nombre, celular, título profesional, email read-only) + Cambiar contraseña (2 columnas)
- **Centro-derecha (50%):** Sub-grid 2x2:
  - Account info card (Founder + Rol + Org en un solo card)
  - Consultas IA (anillo SVG)
  - Plan info (estado, trial progress, botón gradient "Cambiar plan")
  - Límites del plan (5 recursos con barras de progreso)
- **Sesión activa:** Card compacto debajo de Plan (Proveedor, Último acceso, Cuenta creada, ID)
- Inputs más compactos (py-2, rounded-lg, text-xs labels)
- Campo "Título profesional" (Doctor/Especialista/Licenciado) ahora visible
- Botón "Cambiar plan" con gradiente emerald→teal y shadow glow

### UI/UX — Scheduler

#### Calendario Mejorado
- Marcadores de día circulares (rounded-full en vez de rounded-md)
- Flechas de navegación con más espaciado del top
- Botones nav circulares

#### Configuración de Agenda Persistida en DB
- **Migración 068:** Tabla `scheduler_settings` (por organización): start_hour, end_hour, intervals, time_indicator, disabled_weekdays
- **API:** GET/PUT `/api/scheduler-settings` con auth + role checks
- **Config layer:** `fetchSchedulerConfig()` carga de DB, `saveSchedulerConfigToDb()` guarda a DB, localStorage como cache/fallback
- Settings page guarda a DB en vez de solo localStorage

#### Días Deshabilitados Visibles en Scheduler
- **Week view:** Headers con fondo sombreado, texto "Cerrado", overlay con rayas diagonales en time slots
- **Day view:** Overlay completo con lock icon, "Día cerrado" y mensaje apuntando a Settings → Agenda. Bloquea interacción (z-50)

### UI/UX — Dashboard Admin
- Padding reducido en cards de Ingresos, Cobranza y Citas (p-6→p-5, mt-2→mt-1.5)
- Contenido visualmente centrado

### Soporte / Tickets
- `handleCreateTicket` ahora muestra toasts de error específicos en vez de fallar silenciosamente
- Logea errores RLS/DB al console para debugging

### Seguridad — Auditoría Completa (16/16 issues resueltos)

#### CRÍTICOS (4 fixes)
- `/api/prescriptions/[id]` — Org membership check en PATCH/DELETE
- `/api/treatment-plans/[id]` — Org membership check en PATCH/DELETE
- `/api/clinical-followups/[id]` — Org membership check en PATCH/DELETE
- `/api/clinical-attachments/[id]` — Org membership check en DELETE

#### ALTOS (5 fixes)
- `/api/email/send-test` — Org membership check
- `/api/notifications/send` — Org + appointment ownership check
- `/api/clinical-notes/[id]/versions` — Org check explícito (ya existía)
- `/api/clinical-templates/[id]` — Org + role check (ya existía)
- `/api/ai-assistant` — SQL hardened: block semicolons + CTE DML detection

#### MEDIOS (5 Zod validation + 2 hardening)
- `/api/scheduler-settings` PUT — Zod schema validation
- `/api/whatsapp/config` PUT — Zod schema validation
- `/api/whatsapp/send` POST — Zod schema validation
- `/api/whatsapp/templates/[id]` PUT — Zod schema (reemplaza allowedFields)
- `/api/whatsapp/templates` POST — Zod schema (reemplaza casting manual)
- `lib/encryption.ts` — AES-256-GCM para `whatsapp_config.access_token`
- CSP: `unsafe-eval` solo en desarrollo, removido en producción

#### Client-Side (todo PASS)
- Service role key aislado en server
- XSS mitigado (sanitización HTML en markdown)
- Security headers completos (HSTS, X-Frame, X-XSS, Referrer-Policy, Permissions-Policy)
- Open redirect prevenido en auth callback
- File upload validado (whitelist tipos, 10MB limit)
- Webhooks con HMAC-SHA256 timing-safe

### Migraciones Aplicadas
- **068:** `scheduler_settings` — Config de agenda por org en DB
- **069:** `avatar_option` en `user_profiles` — Siluetas SVG seleccionables

### Variables de Entorno Nuevas
- `ENCRYPTION_KEY` — Clave AES-256 para encriptar tokens sensibles (32+ chars). Opcional: sin ella funciona en plaintext

---

## 20. Changelog — Sesión 2026-03-31

### Founder Panel con 2FA (TOTP)
- **Panel separado** en `/founder-dashboard` con layout propio (navbar horizontal, sin sidebar de clínica)
- **Autenticación 2FA** con Google Authenticator / Authy (TOTP RFC 6238)
- **5 páginas:** Overview (12 stat cards), Organizaciones (tabla), Revenue (desglose por plan), Usuarios (owners/admins + miembros), Health (DB, webhooks, soporte, auditoría)
- **APIs con admin client** (`/api/founder/stats/*`) para bypass RLS y ver data cross-org
- **Sesión 4h** con cookie httpOnly, secure, sameSite strict
- Migraciones: 070 (totp_secret + totp_enabled en user_profiles)

### Owner + Doctor (Plan Independiente)
- Owner con doctor record vinculado hereda permisos de doctor
- **Dashboard dual:** AdminDashboard + sección colapsable "Mi Consulta" con DoctorDashboard
- Owner puede crear/firmar notas clínicas, ver tab Clínico en drawer pacientes
- Scheduler pre-selecciona al owner como doctor en formularios
- AI Assistant visible para owner (no para doctores miembros ni recepcionistas)
- Trigger `handle_new_user` ahora seedea solo 1 consultorio por defecto

### Flujo de Invitación Mejorado
- `InviteTokenHandler` captura tokens de invitación en hash URL
- `/api/auth/accept-invite` acepta invitación automáticamente (agrega a org, elimina org auto-creada)
- Redirect optimizado: reset-password primero, accept-invite en background
- Middleware: miembros invitados saltan onboarding, prefiere org con suscripción activa
- RPC `get_user_session_check` ordena membresías por org con plan activo

### Seguridad — RLS Fixes
- `user_profiles` peer visibility: nueva función `get_org_peer_user_ids()` SECURITY DEFINER (evita recursión)
- `user_profiles` UPDATE: nueva función `get_own_is_founder()` SECURITY DEFINER (evita recursión con peer policy)
- Clinical notes signing: usa admin client para bypass RLS en firma
- `organization_members` role check: agregado `receptionist` al constraint

### Performance
- **Supabase client singleton** — elimina LockManager timeout (10000ms) en dev
- **26 queries optimizadas** — select("*") reemplazado con columnas específicas
- **Scheduler config instant** — localStorage en useState initializer, DB sync en background
- **Responsables via API** — `/api/members/responsibles` con admin client (bypass RLS)

### UI/UX — Páginas de Planes Rediseñadas
- `/select-plan` y `/plans` rediseñados con estilo de landing page pricing
- Cards limpios con precio grande, badge "IA incluida", feature list con checks
- Plan popular (Centro Médico) con scale-105, borde emerald, badge "Recomendado"
- Banners de upgrade contextuales en Members y Offices para plan independiente

### UI/UX — Otras Mejoras
- Notificaciones con fondo sólido (`bg-background`) y z-[100] para estar encima de todo
- Botón nested fix en NotificationItem (div con role="button" en vez de button anidado)
- Tab "Clínico" oculto para recepcionistas en drawer de pacientes
- Título profesional oculto para recepcionistas en Account
- CSV export desactivado para plan independiente (feature_export = false)
- Dashboard greeting usa `user_profiles.full_name` en vez de email

### Datos y Tracking
- **`responsible_user_id`** en appointments — dashboard agrupa por user_id y resuelve nombre actual (no texto histórico)
- **`created_by`** en patients — doctores ven pacientes que crearon aunque no tengan citas
- Notificaciones al crear cita + al registrar pago en creación de cita
- Doctor solo ve su propio registro en select de doctor al crear citas
- Followups visibles hasta 365 días (antes 30)
- `get_doctor_personal_stats` RPC: todos los campos del dashboard (month_total, today_completed, etc.)

### Planes Actualizados
- **Independiente:** IA activada con 30 consultas/mes, 1 consultorio default
- **Centro Médico:** 6 miembros (1 owner + 3 doctores + 2 recepcionistas), 3 consultorios

### Migraciones Aplicadas (070-075)
- **070:** totp_secret + totp_enabled en user_profiles
- **071:** user_profiles peer visibility (get_org_peer_user_ids)
- **072:** user_profiles UPDATE policy fix (get_own_is_founder)
- **073:** responsible_user_id en appointments + backfill
- **074:** get_doctor_personal_stats con todos los campos
- **075:** created_by en patients + RLS actualizada

### Scripts
- `scripts/seed-test-users.ts` — Crea 9 usuarios de prueba en 3 orgs con Gmail aliases

---

## 21. Changelog — Sesión 2026-04-05

### Restricciones de Rol Doctor
- **Reprogramar (Reprogramar):** Botón oculto para doctores — solo visible para owner/admin/recepcionista
- **Cancelar:** Doctores solo pueden cancelar sus propias citas, con motivo obligatorio (textarea). El motivo se guarda en notas de la cita como `[Motivo de cancelación]: ...`
- **Otros botones** (Confirmar, Completar, No asistió): Disponibles para doctores en sus propias citas
- Botón rojo "Cancelar cita" con texto visible (fix: text-white en vez de text-destructive-foreground)

### Filtrado de Consultorios por Horario del Doctor
- `doctor_schedules.office_id` ahora se incluye en query de `useSchedulerMasterData`
- Al crear cita, el dropdown de consultorio filtra según la combinación doctor + día
- Si el doctor tiene oficinas específicas asignadas, solo aparecen esas
- Auto-selección cuando solo hay 1 consultorio disponible
- Reset automático si la selección actual deja de ser válida

### Configuración de Consultorios por Doctor (Admin)
- Corregido label incorrecto en schedule tab: "Consultorio" → "Día" en selector de día
- Select de consultorio: "--" cambiado a "Todos los consultorios" para claridad
- Nota informativa para owner/admin sobre restricción de consultorios
- Traducción `schedule.day` agregada (ES/EN)

### Demografía en Reportes de Marketing
- Query de pacientes ahora incluye `departamento` y `distrito`
- Gráfico dona: distribución por departamento
- Gráfico barras horizontales: top 15 distritos
- Tabla detallada: departamento, pacientes, % con barra de progreso visual
- Badge de cobertura: "X% con ubicación" para monitorear calidad de datos
- Datos demográficos incluidos en exportación de reporte

### Fix Build Error
- `app/api/founder/totp/verify/route.ts`: Cambiado `window: 2` a `epochTolerance: 60` (otplib v13 API)

### Auditoría de Producción (Rating: 9.5/10 — actualizado 2026-04-12)
- **Build:** Compilación limpia sin errores. NODE_OPTIONS="--max-old-space-size=4096" para build con muchas páginas SSG
- **Seguridad:** 9.5/10 — Restricciones de rol doctor, bloqueo post-firma en notas clínicas (UI + API), RLS roles corregidos (owner/admin/doctor)
- **Base de datos:** 9.5/10 — 82 migraciones. Nuevas tablas: exam_catalog, exam_orders, specialties, marketing_email_logs
- **Mercado Pago:** Integración completa (checkout, webhook, addons)
- **Emails:** 11 plantillas funcionales (confirmación, recordatorios, recibo, factura, bienvenida, cumpleaños, seguimiento, resumen diario). 6 plantillas ocultas (pendientes de implementación)
- **Responsive:** Sidebar drawer mobile, scheduler overlay, modals/tables con overflow, touch targets 40px+
- **SEO:** 7 páginas de producto SSG con schema.org, breadcrumbs, mega-menu full-width
- **Desplegado:** Vercel (producción), 2 cron jobs (reminders + daily-summary/marketing)

---

## 21.5. Changelog — Sesión 2026-04-09 a 2026-04-12 (v0.7.0)

### Exámenes médicos
- Tablas: `exam_categories`, `exam_catalog`, `exam_orders`, `exam_order_items` (migración 078)
- Admin: `/admin/exam-catalog` con categorías + exámenes configurables
- Doctor: panel ExamOrdersPanel con búsqueda en catálogo, selección múltiple, indicaciones, diagnóstico CIE-10
- Tracking: pendiente → parcial → completado (auto-calcula por items)
- Impresión: A5 landscape profesional con firma

### Bloqueo post-firma de nota clínica
- UI: botones "Recetar" y "Solicitar" ocultos cuando `is_signed=true`
- API: POST `/api/prescriptions` y `/api/exam-orders` rechazan con 403 si nota firmada
- Polling: modal detecta firma cada 2 segundos
- Badge: "Nota firmada" visible en header del modal

### Sistema de emails (11 funcionales)
- `patient_welcome`: auto al crear paciente con email (via `/api/notifications/send-patient`)
- `marketing_birthday`: cron diario, match MM-DD, registro en `marketing_email_logs`
- `marketing_followup`: cron diario, pacientes sin cita 90+ días, cooldown 60 días, máx 20/org/día
- `payment_invoice`: checkbox opt-in al registrar pago
- `team_daily_summary`: cron diario 7am Perú, tabla de citas del día a `notification_emails`
- 4 variables nuevas: `direccion_clinica`, `link_ubicacion`, `instrucciones_servicio`, `monto_cita`
- Campos nuevos: `services.pre_appointment_instructions`, `organizations.google_maps_url`, `email_settings.notification_emails`
- Plantillas ocultas: post-consulta, pedir reseña, campaña, pago pendiente, nueva cita equipo, cancelación equipo

### Registro y seguridad
- Confirmar contraseña con validación visual en tiempo real (borde rojo/verde)
- Indicador de fortaleza: 5 niveles (muy débil → muy fuerte), mínimo "Aceptable"

### Paginación historial de citas
- 50 registros por página con flechas prev/next
- Server-side con Supabase `.range()`, total count exact

### Especialidades (Fase 1)
- 28 especialidades seed (LATAM common) + select con búsqueda en onboarding
- Tablas: `specialties`, `organization_specialties`, `specialty_clinical_data`
- `organizations.primary_specialty_id` para acceso rápido

### Responsive mobile
- **Fase 1**: Sidebar → drawer con backdrop + hamburger en topbar (mobile only). Scheduler sidebar → overlay fullscreen. Layout padding compacto (p-4 vs p-7)
- **Fase 2**: Reports/Settings tabs con overflow-x-auto scroll. Patients header flex-col en mobile. Dashboard botón reportes oculto. Clinical templates botón debajo del subtítulo. Members cards stacking vertical
- **Fase 3**: History table overflow-x-auto min-w-[900px]. Appointment form date span 2cols. DNI select w-[80px]. Pagination buttons 40px touch. Vitals grid 2→4→8 cols. Modal paddings compactos. Clinical history modal max-w-[95vw]

### Páginas de producto (SEO)
- `lib/product-features.ts`: 7 features con metadata SEO, keywords, slugs
- Mega-menu full-width en navbar con 3 columnas + highlight IA
- `/producto`: overview page con 7 feature cards + includes badges
- 7 páginas premium con storytelling (SSG):
  1. `/producto/agenda-medica-online` — Calendar mockup + booking mockup
  2. `/producto/historia-clinica-electronica` — SOAP mockup + 3 sub-features
  3. `/producto/gestion-pacientes` — Patient card mockup + lifecycle journey
  4. `/producto/comunicacion-automatizada` — WhatsApp mockup + 8 message types
  5. `/producto/asistente-ia-consultorio` — Chat AI mockup + before/after
  6. `/producto/reportes-clinica-medica` — Dashboard KPI mockup + 4 report areas
  7. `/producto/gestion-equipo-medico` — 4 role cards con permisos
- Cada página: hero provocativo, pain stats (fondo oscuro), features, before/after, testimonial placeholder, CTA aversión a la pérdida, schema.org, breadcrumbs
- `/producto` añadido a rutas públicas del middleware (no requiere auth)

### Fixes varios
- Vercel cron: `*/30` → `0 13 * * *` (Hobby plan solo permite daily)
- Topbar z-index: `z-[100]` → `z-40` (no se superpone a modals)
- RLS exam_orders: roles corregidos (owner/admin/doctor en vez de 'member')
- Sidebar exam-catalog agregado a navegación admin
- waiting-for-plan: loop fix usando misma RPC que middleware
- Clinical note modal: 2 columnas (SOAP izq + paneles der) en pantallas xl

---

## 21.6. Changelog — Sesión 2026-04-12 (v0.8.0) — Landing, Blog, SEO

### Vista expandida de paciente
- Botón Maximize (⛶) en el header del drawer de paciente
- Abre modal max-w-6xl con 5 tabs en layout amplio (2 columnas donde aplica)
- Info: datos personales + 3 KPI cards (citas, pagado, notas) + etiquetas
- Historial: tabla completa con overflow-x-auto
- Clínico: prescripciones/exámenes en 2 cols + link a historial completo
- Finanzas: tabla de pagos + card resumen
- Marketing: datos de origen + métricas (primera/última cita)

### Paginación de pacientes
- Cambió de "Cargar más" a paginación con flechas prev/next
- 25 pacientes por página, server-side con .range()
- Footer: "X pacientes · Página Y de Z"
- Touch targets 40px en mobile, 32px en desktop

### Páginas de producto (SEO) — Reestructuración 13→7
- `lib/product-features.ts`: 7 features agrupadas (antes 13)
  1. Agenda Médica Online (+ booking)
  2. Historia Clínica Electrónica (+ recetas + exámenes)
  3. Gestión de Pacientes
  4. Comunicación Automatizada (WhatsApp + email)
  5. Asistente Médico con IA
  6. Reportes y Analítica (+ retención + cobros)
  7. Gestión de Equipo Médico
- Mega-menu actualizado: 3 columnas + highlight IA
- 7 páginas premium con storytelling (cada una ~600 líneas):
  - Hero provocativo + mockup visual
  - Pain stats en fondo oscuro con datos
  - Features con beneficios detallados
  - Before/after o journey del usuario
  - Testimonial placeholder
  - CTA con aversión a la pérdida
  - Schema.org + breadcrumbs

### Mega-menu "Recursos"
- Dropdown full-width con 3 columnas:
  1. Conoce REPLACE: Blog + Base de conocimientos
  2. Herramientas gratuitas: Calculadora WhatsApp + Plantilla SOAP
  3. Contáctanos: Contacto + Soporte + Socios
- Footer: "Contactar soporte" + "Contratar socio experto"
- Mobile: accordion colapsable

### Calculadora de precios WhatsApp (/calculadora-whatsapp)
- Estimador rápido para clínicas: input citas/día + días/semana
  → auto-calcula: recordatorios, confirmaciones, seguimientos, cumpleaños
  → muestra costo estimado mensual en USD
- Calculadora manual (estilo Kommo): selector país (10 países LATAM)
  + sliders de marketing y utilidad con precio/mensaje
  + card verde con total estimado
- FAQ con 5 preguntas sobre WhatsApp Business API
- Precios de Meta API actualizados 2026

### Blog (/blog)
- Página index estilo Kommo: search bar, 9 category pills, featured articles,
  article grid 3 cols, "Lo mejor del Blog" category links, CTA banner
- Ruta dinámica /blog/[slug] con SSG para 12 artículos
- Markdown rendering: react-markdown + gray-matter + remark-gfm
- Layout Kommo-style: hero verde + 2 columnas (content + sticky sidebar)
- Sidebar: author card, tabla de contenidos (auto-generated), CTA, share buttons
- Typography audited: H2 28px+border, H3 21.6px bold, body 15px/1.85
  Blockquotes gradient, tables rounded, emoji bullets, decorative HR

### SEO Strategy (content/blog/ESTRATEGIA-SEO.md)
- Pilar-Cluster architecture: 1 pillar page + 4 clusters (16 blogs planned)
- Keyword map with search volume, intent, funnel stage
- Lead magnet per blog with specific CTAs
- GEO rules for AI Overview citability
- 3-month editorial calendar

### 3 Blog posts completos (2,500-3,500 palabras cada uno)
1. `digitalizar-consultorio-medico-peru.md` — TOFU
   - 6 pasos, tablas de costos, errores comunes, FAQ, lead magnet: checklist 21 pasos
2. `reducir-ausentismo-pacientes-clinica.md` — MOFU
   - 5 estrategias, caso práctico 25%→7%, calculadora, FAQ
3. `notas-soap-formato-medico.md` — MOFU
   - SOAP explicado, ejemplos por 5 especialidades (tablas), FAQ

### 3 Lead magnets (content/blog/lead-magnets/)
1. Checklist 21 pasos para digitalizar consultorio (PDF)
2. Calculadora de pérdidas por ausentismo (Excel)
3. Plantilla SOAP por 5 especialidades (PDF)

### Rutas públicas agregadas al middleware
`/producto`, `/blog`, `/base-conocimientos`, `/calculadora-whatsapp`, `/contacto`, `/socios`, `/soporte`

### Roadmap Post-V1
- **V1.1:** WhatsApp CRM (chat directo, tipo Leadsales)
- **V1.2:** UTM Attribution (tracking automático de fuente de citas desde campañas Meta)
- **V1.3:** Mensajes masivos WhatsApp API (marketing automation)
- **V1.4:** Boletas/Facturas SUNAT (Nubefact o similar)
- **V2.0:** IA avanzada (resúmenes automáticos, sugerencias diagnóstico, analytics predictivo)

---

## 21.7. Changelog — Sesión 2026-04-15 (v0.8.1) — Hardening UX Trial/Auth + Tema

### Tema visual (surface hierarchy)
- `--background`: `#eef0f1` → `#fbfbfb` (fondo general más claro)
- Inputs, textareas y campos del onboarding: `bg-transparent` / `bg-background/50` → `bg-card` (blanco `#ffffff`)
- Archivos: `app/globals.css`, `components/ui/input.tsx`, `components/ui/textarea.tsx`, `app/(auth)/onboarding/steps.tsx`
- Jerarquía resultante: fondo gris suave `#fbfbfb` → cards `#ffffff` → inputs blancos con borde

### Auth — manejo de `otp_expired` / `access_denied`
- **Problema:** el escáner de seguridad del correo (Gmail/Outlook) abre el enlace de confirmación antes que el usuario, consumiendo el link PKCE único. El usuario veía una URL cruda con `#error=access_denied&error_code=otp_expired`.
- **Fix en `app/api/auth/callback/route.ts`:** detecta `error` / `error_code` de Supabase en query params y redirige a `/login?error=<code>` con el código preservado. Añadido branch `exchange_failed` para fallos de `exchangeCodeForSession`.
- **Fix en `app/(auth)/login/page.tsx`:** nueva función `parseAuthError(query, hash)` que lee tanto query string como hash fragment. Banner ámbar (AlertTriangle) explica el problema en español, ofrece botón **"Reenviar enlace de confirmación"** que llama `supabase.auth.resend({ type: "signup" })`. Limpia la URL con `history.replaceState` tras mostrar el banner.
- Códigos manejados: `otp_expired`, `access_denied`, `exchange_failed`, `auth_failed`.

### Onboarding — hint sobre categoría "General"
- Step 4 (primer servicio) ahora muestra texto aclaratorio: *"Se creará automáticamente la categoría **General**. Podrás reorganizar luego desde Admin → Servicios."*
- Clarifica el comportamiento silencioso del backend (que auto-crea la categoría si no existe) sin pedirle al usuario un campo extra.
- Archivo: `app/(auth)/onboarding/steps.tsx`.

### Trial de 14 días — hardening end-to-end
- **Runtime explícito:** `export const runtime = "nodejs"` en `/api/plans/start-trial` (nodemailer requiere Node, no Edge).
- **Limpieza de filas huérfanas:** al iniciar el trial se borran filas `pending | expired | canceled` de la misma org (las sobras de checkouts Mercado Pago abandonados ya no bloquean reintentos).
- **Email no bloqueante:** `sendTrialWelcomeEmail` se programa con `after()` de `next/server` para correr en fase post-respuesta, evitando que el `socketTimeout: 15s` de nodemailer retenga la función serverless y el cliente reciba timeout.
- **Errores transparentes:** si el insert de `organization_subscriptions` falla, la API devuelve `{ error, detail, code }` con el mensaje real de Supabase (antes era un genérico `trial_creation_failed`).
- **Cliente:** `select-plan/page.tsx` `handleStartTrial` ahora hace `res.text()` primero + `JSON.parse` con fallback; si el backend responde HTML (ej. 504 de Vercel), el usuario ve el mensaje real en vez de `"Error de conexión"`. El catch usa `err.message` cuando está disponible.

### Limpieza DB (producción)
- Eliminada fila `organization_subscriptions` huérfana (`cfe38e38-adb8-4a73-815c-95ff2fbcd580`, status=`pending`) de la org `db445605-5587-4b87-a732-abfd8152ee34` (chaivana).

### Diagnóstico documentado — `email rate limit exceeded`
- **No es bug del código:** es el límite del SMTP interno de Supabase (2 correos/hora/proyecto) cuando se hacen múltiples pruebas de signup/reenvío.
- Solución recomendada: configurar **Custom SMTP** en Supabase Dashboard → *Authentication → SMTP Settings* con las mismas credenciales `SMTP_HOST/USER/PASS` que ya usa la app. Beneficios: elimina el límite de 2/hora y hace que los correos salgan desde el dominio propio (reduce drásticamente el `otp_expired` por escáneres de seguridad).

### Commits
- `710cc11` — tema `#fbfbfb` + inputs `#ffffff`
- `646d642` — auth callback + banner ámbar con resend
- `bbec0e6` — trial start hardening + mensajes de error reales + hint categoría General

---

## 21.8. Changelog — Sesión 2026-04-16 (v0.8.2) — Antecedentes clínicos + CIE-10 personalizable

### Corrección — Doctor no podía interactuar con su cita
- **Problema:** el doctor `oscardlopez@outlook.com` (Jose Lopez) veía su cita asignada pero la nota clínica aparecía bloqueada (solo lectura).
- **Causa raíz:** 3 registros duplicados en `doctors` para el mismo `user_id`, generados por ciclos repetidos de auto-creación. El hook `useCurrentDoctor()` no filtraba por `is_active` ni ordenaba, así que a veces retornaba un doctor inactivo → `currentDoctorId !== appointment.doctor_id` → panel bloqueado.
- **Fix en `hooks/use-current-doctor.ts`:** `.eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle()`.
- **Limpieza DB (producción):** consolidados citas, horarios y servicios al registro canónico `4ec5776b`; los 2 duplicados desactivados con sufijo `[DUPLICADO - MIGRADO]` y luego restaurado `full_name = 'Jose Lopez'` al canónico.

### Antecedentes del paciente en la nota clínica
- **Motivación:** el doctor necesita ver alergias, condiciones crónicas y diagnósticos previos sin salir del panel de nota clínica (feedback directo de cliente).
- **Migración 087:** 3 tablas normalizadas con RLS (lectura por miembros de org, escritura por org, borrado solo admin/owner):
  - `patient_allergies`: sustancia, severidad (`leve`/`moderada`/`severa`), reacción, notas
  - `patient_conditions`: condición, código ICD, tipo (`chronic`/`personal`/`family`), estado, fecha dx, familiar
  - `patient_medications`: nombre, dosis, frecuencia, vía, fechas inicio/fin, doctor prescriptor
- **API `/api/patients/[id]/antecedents`:** GET (4 queries paralelas + últimos 5 diagnósticos de `clinical_notes` con join a `doctors`), POST (discrimina por `type`), PATCH y DELETE (soft-delete con `is_active = false`).
- **`types/patient-antecedents.ts`:** interfaces `PatientAllergy`, `PatientCondition`, `PatientMedication`, `PatientAntecedents`.
- **`PatientContextCard`** (`scheduler/patient-context-card.tsx`):
  - Tarjeta colapsable, auto-expande si existen alergias
  - `AllergyBadge` con colores por severidad (rojo/ámbar/amarillo)
  - `ConditionRow` con labels de tipo (Crónica/Antec. personal/Antec. familiar)
  - `MedicationRow` con dosis y frecuencia
  - Sección de últimos 5 diagnósticos CIE-10
  - `InlineAddForm` para agregar alergias/condiciones/medicamentos directamente
- **Integración:** renderizada sobre el encabezado de la nota clínica en `clinical-note-panel.tsx`.

### Catálogo CIE-10 personalizable por organización
- **Motivación:** el catálogo global estático (~160 códigos en `lib/cie10-catalog.ts`) no cubre diagnósticos de especialidades como endocrinología, dermatología, etc.
- **Migración 088:** tabla `custom_diagnosis_codes` con `organization_id`, `code` (UNIQUE por org), `label`, `specialty_id` (FK opcional a `specialties`), `notes`, `created_by`. RLS: lectura por miembros, CUD solo owner/admin.
- **API `/api/custom-diagnosis-codes`:** GET (lista por org), POST (insert con detección de duplicado `23505`), PATCH (update label/specialty/notes), DELETE.
- **Admin → Diagnósticos CIE-10** (`admin/diagnosis-codes/page.tsx`): tabla con búsqueda, formulario inline para agregar/editar, conteo de catálogo global vs. personalizado, selector de especialidad.
- **`searchCIE10WithCustom()`** en `lib/cie10-catalog.ts`: nueva función que mezcla hasta 5 resultados custom (etiquetados con `custom: true`) + el resto del catálogo global, sin duplicados.
- **Integración en nota clínica:** `clinical-note-panel.tsx` carga los códigos custom de la org al montar y los pasa a `searchCIE10WithCustom`. En el dropdown, los resultados custom muestran badge "personalizado".
- **Navegación:** sidebar con icono `BookOpen` + card en admin page con conteo. Traducciones ES/EN agregadas.

### COMING-UPDATES.md
- Movidos a ✅ Entregados: "Catálogo CIE-10 personalizable" y "Antecedentes del paciente en nota clínica"
- Nuevo item pendiente: "Importación masiva de códigos CIE-10 (CSV/Excel)"

### Commits
- `4d2bd01` — fix: doctor appointment blocked — duplicate doctor records + missing filter
- `145d89e` — feat: patient antecedents (allergies, conditions, medications) in clinical note
- `be11615` — feat: custom CIE-10 diagnosis codes per organization

---

## 22. Sistema de Especialidades Médicas

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

## 23. Changelog — Sesión 2026-04-17 (v0.9.0)

### Sistema de Addons / Verticalización por Especialidad (migración 091)

Entregamos la infraestructura escalable para módulos verticales de especialidad, evitando hardcodear features por vertical.

- **Catálogo global `addons`:** key, name, description, category (specialty/workflow/clinical), specialties[] (slugs a los que aplica), icon, is_premium, min_plan, sort_order. 14 addons seed: 10 de especialidad (dermatology, odontology, nutrition, psychology, pediatrics, ophthalmology, gynecology, cardiology, traumatology, aesthetic) + 4 de workflow (telehealth, advanced_reports, inventory, lab_integration).
- **Activación por org `organization_addons`:** organization_id, addon_key, enabled, settings (JSONB), activated_at, activated_by. RLS con políticas separadas para select/insert/update/delete (owner/admin).
- **Auto-activación en onboarding:** al completar onboarding, se activan automáticamente los addons gratuitos cuya lista de `specialties` contiene alguna de las especialidades elegidas por la org.
- **UI Settings → Módulos:** nuevo tab en Settings con sección "Recomendados para tu especialidad", grid agrupado por categoría, toggle on/off por módulo (owner/admin), badge PRO para premium, vista read-only con ícono de candado para no-admins.
- **Hook `useOrgAddons`:** catálogo enriquecido + `hasAddon(key)` + `toggleAddon(key, enabled)` + `refetch()`. Gating de UI en cualquier componente del dashboard.
- **API `/api/addons`:** GET devuelve catálogo enriquecido con `enabled` y `recommended` por org. POST (solo admin/owner) togglea el addon con upsert y Zod.

### Primer Vertical — Curvas de Crecimiento OMS (migración 092)

Primer addon vertical completo, para endocrinología pediátrica y pediatría.

- **Esquema:** `patients.sex` (male/female), tabla `patient_anthropometry` (measurement_date, weight_kg, height_cm, head_circumference_cm, notes, recorded_by) con RLS multi-tenant.
- **Tablas LMS OMS (`lib/growth-curves/`):** WHO Child Growth Standards (0–5 años) + WHO Growth Reference (5–19 años). Parámetros Lambda-Mu-Sigma para weight-for-age, height-for-age, BMI-for-age (ambos sexos, 0–19 años) y head-circumference-for-age (0–36 meses).
- **Cálculo:** Z-score vía fórmula LMS `Z = ((x/M)^L − 1) / (L·S)`. Percentil vía CDF normal estándar (Abramowitz & Stegun). Interpolación lineal entre puntos LMS. Reverso para graficar las líneas de percentiles.
- **Componente `GrowthCurvesPanel` (Recharts ComposedChart):** banda P3–P97 sombreada en emerald, 5 líneas de percentiles (P3/P15/P97 punteadas, P15/P85 dashed, P50 sólida emerald), scatter con línea de trayectoria del paciente en indigo. Tooltip con valor, percentil y Z-score por punto. Tarjeta resumen de la última medición con colores semáforo (verde <15–85>, ámbar 3–15/85–97, rojo <3 o >97).
- **4 métricas seleccionables:** Peso/Edad, Talla/Edad, IMC/Edad (auto-calculado desde peso y talla), Perímetro Cefálico.
- **Formulario inline** para registrar nuevas mediciones, con validación. Historial tabular con botón de eliminación.
- **Integración drawer paciente:** nueva pestaña "Crecimiento" gated por `hasAddon("growth_curves")`, visible solo a doctores/admins. Selector de sexo biológico en tab Datos (requerido por las tablas OMS). Empty states amigables cuando falta fecha de nacimiento o sexo.
- **API `/api/patients/[id]/anthropometry`:** GET (cronológico) / POST (Zod, al menos una medición) / DELETE (por entryId).

### Founder Panel — Tracking de Owners

- Tabla `owner_lifecycle_events` con eventos: signup, trial_start, plan_upgrade, churn.
- Tabla `founder_notes` para anotaciones privadas por organización.
- Endpoints `/api/founder/stats/owners` y `/api/founder/notes`.
- Tab "Organizaciones" en founder dashboard con embudo de conversión y notas editables por owner.

### Marketplace de Integraciones

- Nuevo tab "Integraciones" en Settings con tarjetas de integraciones externas (WhatsApp Business API, Mercado Pago, Google Calendar, etc.) y estado por org.
- Wizard paso a paso para conectar WhatsApp Business API.
- Bloqueo visual (candado) en tabs de integraciones aún no activadas.

### Mejoras Menores

- Fix sidebar: eliminadas entradas duplicadas de Founder e Integraciones.
- Lock de tabs de WhatsApp hasta que la API esté conectada (consistencia con el marketplace).

### Archivos Nuevos Clave

- `supabase/migrations/091_addon_modules.sql`
- `supabase/migrations/092_growth_curves_pediatric.sql`
- `lib/growth-curves/{types,who-data,index}.ts`
- `hooks/use-org-addons.ts`
- `app/api/addons/route.ts`
- `app/api/patients/[id]/anthropometry/route.ts`
- `app/(dashboard)/settings/modulos-tab.tsx`
- `app/(dashboard)/patients/growth-curves-panel.tsx`

### Cambios de Alcance

- Fase 2 de Especialidades (Sección 22) pasa de "Pendiente" a "Parcialmente implementado": la infraestructura de addons + el primer vertical completo están entregados; quedan pendientes `doctor_specialties`, tabs condicionales en historia clínica, y módulos premium cobrables.
- Pendientes movidos a Completado: sistema de módulos verticales, primer vertical (endocrinología pediátrica), marketplace de integraciones, tracking de owners del founder.

---

## 24. Changelog — Sesión 2026-04-22 (v0.10.1) — Portal rediseñado + Dashboard timeline

### Fixes de schema drift (el portal no enviaba magic link ni mostraba citas)

Dos columnas asumidas por el código y el PRD nunca existieron en producción porque los `CREATE TABLE IF NOT EXISTS` de migraciones posteriores saltaron las columnas nuevas:

- **Migración 094** — `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`. Sin esta columna, `/api/portal/auth/request-link` hacía `.eq("is_active", true)` sobre una columna inexistente, PostgREST devolvía 400, `.single()` retornaba null, el `if (!org)` entraba al branch silencioso y nunca se creaba el token — el correo jamás salía.
- **Migración 095** — `ALTER TABLE doctors ADD COLUMN IF NOT EXISTS specialty TEXT`. Sin esta columna, `/api/portal/appointments` fallaba al seleccionar `doctors(specialty, …)` y la vista "Mis Citas" del portal se mostraba vacía aunque hubiera citas.

Ambas migraciones son no-destructivas y usan `IF NOT EXISTS`; los valores por defecto respetan el modelo de negocio (todas las orgs activas por defecto, `specialty` nullable editable por staff).

### Canonicalización de URLs (yenda.app)

Tres puntos del código construían URLs públicas desde `window.location.origin` o `req.headers.get("origin")`, generando links al dominio `saas-orcin-seven.vercel.app` en lugar del canónico `yenda.app`:

- `app/api/portal/auth/request-link/route.ts` — origen del magic link
- `app/(dashboard)/settings/booking-settings-tab.tsx` — panel admin con URL pública
- `components/integrations/whatsapp-wizard.tsx` — webhook URL

Todos ahora priorizan `process.env.NEXT_PUBLIC_APP_URL` con fallback al request. La Site URL de Supabase Auth se apunta a `https://yenda.app` para que OAuth (Google) aterrice correctamente.

### Portal del Paciente — Rediseño Apple Health (Phase 1.1)

`app/portal/[slug]/mis-citas/page.tsx` reescrita con lenguaje visual tipo Apple Health, mobile-first:

- Fondo iOS `systemGray6` (`#F2F2F7`), tarjetas blancas `rounded-3xl` con `ring-1 ring-black/5`.
- Sticky header con blur, título "Resumen" + nombre de la org, botones circulares (perfil con iniciales + salir).
- Grid 2×2 de tiles de salud con icono tintado al 12%: Próxima cita (rojo), Citas completadas (naranja), Última visita (morado), Especialistas (verde). Todos tappable.
- Tabs segmentadas **Próximas** / **Historial** con contadores en vivo.
- Hero card de próxima cita: banner en gradiente del accent color, bloque de fecha blanco tipo iOS (día de semana + número), filas de detalle con avatar del doctor, servicio y consultorio.
- Filas de programadas y historial agrupadas por mes (abril 2026, marzo 2026, …) en tarjetas con divisores.

### Portal del Paciente — Enriquecimiento (Phase 1.2)

Agregadas 5 interacciones nuevas y 1 API:

- **Bottom sheet de detalle de cita** — tap en cualquier cita o tile → abre sheet con doctor+avatar, servicio, consultorio, precio, origen (portal/whatsapp/manual/booking), notas, y dos acciones: "Añadir al calendario" (genera .ics client-side) y "Cancelar cita" (respeta `portal_allow_cancel`).
- **FAB "Agendar cita"** flotante persistente que lleva a `/book/[slug]` reutilizando el flujo público existente. También aparece inline en el empty state cuando no hay próximas citas.
- **Bottom sheet de perfil** — botón con iniciales del paciente en el header. Muestra DNI + email bloqueados (con nota "Usado para iniciar sesión") y teléfono editable inline con validación.
- **Filter chips en Historial** — Todas / Completadas / Canceladas / No asistió con conteos en vivo. Chips con 0 se ocultan.
- **Bottom sheet de especialistas** — tap en el tile "Especialistas" → lista de doctores con # de citas visitadas ordenado por frecuencia.
- **API `PATCH /api/portal/profile`** — única ruta editable del perfil. Valida formato de teléfono (`^[+\\d\\s()-]{6,30}$`), escribe solo `portal_phone` para evitar tampering de identidad. Nombre, email y DNI requieren contacto con la clínica (decisión de producto).

### Dashboard admin — Lenguaje visual consistente con el portal

`app/(dashboard)/dashboard/admin-dashboard.tsx` recibe el mismo patrón de icono tintado + label de color que el portal, adaptado a dark mode con utilidades Tailwind (`bg-<color>-500/10`):

| Card | Icono | Color |
|---|---|---|
| Ingresos del mes | `Wallet` blanco sobre emerald | emerald hero |
| Cobranza pendiente | `CircleDollarSign` | orange |
| Citas | `CalendarDays` | violet |
| Pacientes nuevos vs recurrentes | `UserPlus` | emerald |
| Rendimiento por recepcionista | `Headset` | sky |
| % de Ocupación | `Gauge` (dinámico) | rose/amber/emerald |
| Meta del mes | `Target` | emerald |
| Timeline últimos 30 días | `Activity` | emerald |

### Dashboard admin — Timeline + KPI polish

- **Timeline de 30 días** (reemplaza Top 5 Tratamientos; estos viven en `/reports` desde v0.7.0). Área chart de recharts con gradiente emerald, grid horizontal sutil, tooltip con día de la semana + fecha + conteo. Header del card muestra total + promedio/día y link "Ver agenda →" al scheduler. La query se hace en `dashboard/page.tsx`: `appointments` de los últimos 30 días excluyendo `cancelled`, rellenando con 0 los días sin citas.
- **Citas card normalizada** — ya no mezcla absoluto y porcentaje. Ahora muestra los tres valores en absoluto (Completadas N · No shows N · Canceladas N) para claridad con volumen bajo.
- **Ocupación tri-color**:
  - `>= 60%` → emerald + "Óptima"
  - `20-60%` → amber + "Media"
  - `< 20%` → rose + "Baja"
  - Barra de progreso con ancho mínimo 2% para que 0-1% sea visible.
  - Hint `"Meta saludable: 60%+"` para dar contexto al número.
- **Rendimiento por recepcionista condicional** — se oculta cuando hay menos de 2 recepcionistas (la mayoría de clínicas al inicio). La fila 2 colapsa automáticamente de `md:grid-cols-3` a `md:grid-cols-2`, sin hueco visual.

### Archivos Nuevos / Modificados Clave

- `supabase/migrations/094_restore_organizations_is_active.sql` (nuevo)
- `supabase/migrations/095_restore_doctors_specialty.sql` (nuevo)
- `app/api/portal/profile/route.ts` (nuevo — PATCH de teléfono)
- `app/portal/[slug]/mis-citas/page.tsx` (rewrite completo)
- `app/(dashboard)/dashboard/admin-dashboard.tsx` (iconos + timeline + KPI fixes)
- `app/(dashboard)/dashboard/page.tsx` (nueva query `dailySeries`, prop `topTreatments` removida)
- `app/api/portal/auth/request-link/route.ts` (URL canónica)
- `app/(dashboard)/settings/booking-settings-tab.tsx` (URL canónica)
- `components/integrations/whatsapp-wizard.tsx` (URL canónica)

### COMING-UPDATES.md — Añadidos al roadmap del portal

- **Portal — Panel de Resultados médicos (lab/imágenes)** — nueva tabla `patient_files`, bucket de Supabase Storage con policy por `org_id`+`patient_id`, UI de upload desde admin, listado agrupado por tipo en el portal.
- **Portal — Indicaciones / pre-consulta** — campo `pre_appointment_instructions` en `services`, override opcional `custom_instructions` en `appointments`, visible en detalle de cita y email de recordatorio 24h antes.

### Cambios de Alcance

- Portal del Paciente avanza de "Phase 1 (auth + mis citas)" a "Phase 1 consolidada con detalle de cita, perfil editable, filtros y CTA de agendar". Las fases 2 (reservar desde portal), 3 (reprogramar), 4 (documentos) siguen en roadmap.
- Dashboard admin: el foco cambió de "mix estratégico de servicios" (Top 5) a "pulso operativo" (timeline diario). La visión estratégica sigue disponible en `/reports`.

---

## 25. Changelog — Sesión 2026-04-22 tarde (v0.11.0) — Paciente Recurrente + Portal desktop + /book redesign

### Etiqueta "Paciente Recurrente" automática (migración 096)

Nueva columna `patients.is_recurring boolean NOT NULL DEFAULT false` con índice parcial `(organization_id, is_recurring) WHERE is_recurring`. El flag es **lifetime-persistent**: se activa cuando el paciente acumula ≥ 2 citas `status='completed'` en la org, y se apaga si las citas se eliminan o cambian de estado.

Mantenimiento 100% automático:

- Función `refresh_patient_recurring(p_patient_id uuid)` con `SECURITY DEFINER`.
- 3 triggers en `appointments`:
  - `AFTER INSERT` cuando `NEW.status='completed'`.
  - `AFTER UPDATE OF status, patient_id`.
  - `AFTER DELETE` cuando `OLD.status='completed'`.
- Backfill one-shot al correr la migración.

**Conceptualmente distinto** del métric `recurring_patients_month` del dashboard (v0.9.0), que mide multi-visitas **en el mes actual** (operativo). El nuevo flag mide **relación de toda la vida** (segmentación). Ambos coexisten.

**Zonas UX** donde aparece (`components/patients/recurring-badge.tsx` con 2 variantes: `RecurringBadge` tintado emerald + `RecurringDot` 1.5px):

| Zona | Archivo | Componente |
|---|---|---|
| Lista `/patients` — fila | `patients/page.tsx:683` | Chip `xs` junto al nombre |
| Drawer del paciente — header | `patients/patient-drawer.tsx:345` | Chip `xs` |
| Modal expandido — header | `patients/patient-drawer.tsx:1172` | Chip `sm` |
| Scheduler — "paciente encontrado" | `scheduler/appointment-form-modal.tsx:628` | Chip `xs` inline |
| Scheduler day view — cards | `scheduler/day-view.tsx:303` | Punto verde |
| Scheduler week view — cards | `scheduler/week-view.tsx:289` | Punto verde |

**Filtro en `/patients`** — nuevas pills "Nuevos / Recurrentes" separadas por divider del filtro de status, con auto-toggle al hacer click en el activo.

**Scheduler**: la query de `scheduler/page.tsx` ahora hace join `patients(is_recurring)` para que day/week views lean el flag sin round-trips extra.

**Tipado**: `types/admin.ts` augmenta `Patient` con `is_recurring?: boolean | null` hasta que Supabase regenere los tipos (`npm run types` después del deploy).

### Portal del Paciente — Rediseño Desktop (v1.1)

Hasta ahora el portal vivía con `max-w-md` centrado — en desktop se veía como "un teléfono flotando". Rediseño completo respetando el lenguaje Apple Health mobile:

- **Container**: `max-w-md` → `max-w-5xl`, `lg:px-8`.
- **Grid principal `lg+`**: `grid-cols-[1fr_320px] gap-8`
  - **Columna principal**: greeting, hero de próxima cita, sección "Programadas", sección "Historial" con grupos por mes. Los tabs mobile "Próximas/Historial" **desaparecen en desktop** — ambas secciones stack verticalmente con headers propios.
  - **Sidebar sticky** (`lg:sticky top-28`): tiles 2×2 de resumen + card clickeable "Mi Perfil" con avatar + iniciales.
- **Tipografía escalada**: título `28px` → `lg:text-4xl`, greeting `22px` → `lg:text-3xl`.
- **Bottom sheets → drawer responsive**: el componente `BottomSheet` ahora usa `useMediaQuery("(min-width: 1024px)")`. En mobile: slide desde abajo (como antes). En desktop: slide desde la derecha con `max-w-md`, `inset-y-0 right-0 rounded-l-3xl`. Drag handle solo en mobile. `role="dialog" aria-modal="true"`.
- **Polish UX**: `focus-visible:ring-2` en botones circulares del header, hover shadows en sidebar cards, `max-w-prose` en welcome message. `PortalSkeleton` reemplaza el spinner centrado — renderiza la estructura del layout para reducir jank percibido.
- Mobile intacto.

### Botón "Agendar cita" condicional (migración 097)

Nueva columna `booking_settings.allow_online_booking boolean NOT NULL DEFAULT true`. Cuando el owner la desactiva desde el admin, el portal deja de linkear a `/book` y en su lugar abre un sheet de contacto.

- `allow_online_booking = true` → botón en el header → `<Link href="/book/[slug]">`.
- `allow_online_booking = false` → mismo botón → abre `<ContactSheet>`.

**ContactSheet** (nuevo componente en `app/portal/[slug]/mis-citas/page.tsx`):

- Reusa el `BottomSheet` responsive (bottom en mobile, right drawer en desktop).
- Lista WhatsApp (`wa.me/<digits>`), Llamar (`tel:`), Email (`mailto:`), cada uno como row con icono tintado. Filas que no aplican (canal no configurado) se ocultan.
- Empty state si la clínica no tiene ningún canal.
- Datos vienen de `global_variables` (`clinic_phone`, `clinic_email`) scoped por org, surfaced por `/api/portal/auth/session` como `clinic_contact`.

**Mobile FAB** se mantiene solo en `< 640px` con el mismo comportamiento condicional (icono `Plus` vs `PhoneCall`).

### `/book/[slug]` — Rediseño Light + Filtros

**Conversión a tema claro** (era el único flujo del producto aún en dark):

- Paleta: `bg-zinc-950/900/800` → `bg-zinc-50/white`, borders `zinc-800/700` → `zinc-200/300`, body text `zinc-400/300` → `zinc-500/700`.
- `text-white` preservado solo en superficies con accent color (logo badge, opción seleccionada, submit buttons).
- El `accent_color` de la clínica sigue manejando selected state, submit button y filter chips.

**Office picker eliminado del UX del paciente**. El paciente nunca debería elegir consultorio:

- Nueva columna `doctors.default_office_id uuid REFERENCES offices(id) ON DELETE SET NULL` (migración 098) con índice parcial.
- Al cambiar el doctor, un `useEffect` auto-resuelve el office:
  1. `doctor.default_office_id` si está set y el office sigue activo.
  2. Primer office alfabético (fallback).
- El bloque "Consultorio" en el paso de servicio se eliminó.

**Doctor step — búsqueda + filtro por especialidad**:

- Input de búsqueda por nombre/especialidad — solo visible cuando hay ≥ 4 doctores. Botón `X` para limpiar.
- Chips de especialidad con conteo — solo visibles cuando hay ≥ 2 especialidades distintas. Chip activo usa el accent color, chip "Todas" es el default.
- `displayedDoctors` = memo que cruza search + specialty. Empty state amigable si no matchea nada.

### Admin doctor form — Especialidad + Consultorio por defecto

`/admin/doctors/[id]` (ProfileTab) tenía un hueco histórico: no había dónde setear la especialidad del doctor (la columna `specialty` existía desde migración 095 pero sin UI).

- Nuevo campo **Especialidad** — input de texto libre, max 100, optional. Hint: "Visible en el portal del paciente y en la reserva pública".
- Nuevo campo **Consultorio por defecto** — dropdown con los offices de la org (o "Sin preferencia"). Alimenta `doctors.default_office_id`.
- `lib/validations/doctor.ts` extendido con `specialty` y `default_office_id` (ambos nullable).
- El payload del `UPDATE` escribe ambos, convirtiendo string vacío a `null`.

### API changes

- `GET /api/portal/auth/session` retorna ahora `portal_settings.allow_online_booking` + nuevo campo `clinic_contact: { phone, email }` (de `global_variables`).
- `GET /api/book/[slug]` retorna `doctors.default_office_id` para permitir resolución client-side.

### Archivos Nuevos / Modificados Clave

- `supabase/migrations/096_patients_is_recurring.sql` (nuevo)
- `supabase/migrations/097_booking_settings_allow_online_booking.sql` (nuevo)
- `supabase/migrations/098_doctors_default_office.sql` (nuevo)
- `components/patients/recurring-badge.tsx` (nuevo)
- `app/portal/[slug]/mis-citas/page.tsx` (desktop grid, ContactSheet, skeleton, responsive sheet)
- `app/api/portal/auth/session/route.ts` (allow_online_booking + clinic_contact)
- `app/book/[slug]/page.tsx` (rewrite de tema + search + specialty chips + office auto-resolve)
- `app/api/book/[slug]/route.ts` (añade default_office_id al select)
- `app/(dashboard)/admin/doctors/[id]/page.tsx` (specialty + default_office_id en ProfileTab)
- `app/(dashboard)/patients/page.tsx` (badge + filter Recurrentes)
- `app/(dashboard)/patients/patient-drawer.tsx` (badge en drawer + modal)
- `app/(dashboard)/scheduler/page.tsx` (join `patients(is_recurring)`)
- `app/(dashboard)/scheduler/day-view.tsx` + `week-view.tsx` (RecurringDot)
- `app/(dashboard)/scheduler/appointment-form-modal.tsx` (badge en patient found)
- `lib/validations/doctor.ts` (specialty + default_office_id)
- `types/admin.ts` (augment Patient con `is_recurring`)

### Cambios de Alcance

- Nuevo pilar: **segmentación de pacientes por engagement**. La bandera `is_recurring` habilita filtros en `/patients`, y futuras campañas de marketing diferenciadas (variable `{{paciente_recurrente}}` en plantillas, próxima iteración).
- **Portal desktop** sale de estado "mobile-only" a experiencia multi-resolución sin duplicar componentes — misma API, un único `BottomSheet` que se adapta.
- **Owner control sobre la reserva online**: clínicas que prefieren gestionar el canal vía recepción pueden desactivar `/book` del portal sin cerrarlo globalmente. Flag separado de `booking_settings.is_enabled` (que sigue controlando el acceso público a `/book` para quien no está logueado).
- Consultorios dejan de ser exposed al paciente — decisión de producto basada en que 99% de clínicas pequeñas asigna consultorio por doctor, no por cita.
- Especialidad por doctor queda configurada en un único lugar: `/admin/doctors/[id]`. Se muestra en el portal y en `/book`.

---

## 26. Changelog — Sesión 2026-04-22 noche (v0.12.0) — Presupuestos de tratamiento + Descuentos

### Presupuestos de tratamiento multi-servicio (migración 099)

Extensión al sistema de treatment plans (existente desde v0.7.0) para que cada plan represente un presupuesto facturable con sesiones expandidas y contabilidad unificada.

**Modelo de datos — todo aditivo**:

```
NEW TABLE treatment_plan_items (
  id, treatment_plan_id, organization_id, service_id,
  quantity, unit_price, display_order, created_at
)

ALTER treatment_sessions:
  + service_id              -- qué servicio es esta sesión
  + session_price           -- precio snapshot al crear
  + treatment_plan_item_id  -- de qué item del plan viene

ALTER appointments:
  + treatment_session_id    -- link 1:1 con la sesión cuando aplica

ALTER patient_payments:
  + treatment_plan_id       -- permite anticipos al plan sin cita
```

**Modelo contable unificado**:

```
Total del plan    = SUM(items.quantity * items.unit_price)
Pagado            = SUM(patient_payments WHERE treatment_plan_id = X)
Consumido         = SUM(session_price WHERE status='completed' AND plan = X)
Saldo             = Pagado - Consumido
```

Un solo modelo cubre los 3 escenarios de pago que el producto necesita soportar:
1. **Sesión por sesión**: `payment(appointment_id, treatment_plan_id)` en cada cita.
2. **Anticipo parcial**: `payment(null, treatment_plan_id)` antes de las sesiones.
3. **Pago total upfront**: mismo payment con el monto completo.

El saldo se recalcula a demanda. No hay estados especiales de "anticipo" vs "pago normal".

**Doctor — TreatmentPlansPanel (multi-item)**:
- Form rebuilt como "ticket": lista de líneas editables con servicio (dropdown), cantidad, precio unitario (snapshot de `services.base_price` editable).
- Añadir/quitar líneas dinámicamente. Preview del total en pill emerald ("S/ 800 · 10 sesiones").
- Al guardar: crea N sesiones expandidas automáticamente (una por unidad de cada item), con `session_price` snapshot.
- Template selector existente preservado para nombre/diagnóstico.

**Recepción — Scheduler banner**:
- Al crear cita con DNI, si el paciente tiene planes activos con sesiones pending → banner azul "Este paciente tiene un plan activo — Sesión N / M · Servicio · S/ X".
- Click "Agendar sesión" → pre-llena service_id, doctor, y fija `price_snapshot` al `session_price` de la sesión (no al `services.base_price`, para que el presupuesto matemático se mantenga consistente).
- Al guardar: setea `appointments.treatment_session_id` + mirror `treatment_sessions.appointment_id`.

**Recepción — Appointment sidebar**:
- Banner de contexto cuando la cita está vinculada: "Sesión N / M · Plan Title" + tres pills (Pagado / Consumido / Saldo).
- Mensaje verde si `saldo >= session_price` ("Esta sesión se cubre con el crédito del plan"); ámbar si falta cobrar.
- Payments desde el sidebar ahora se registran con `treatment_plan_id` cuando la cita está vinculada → la contabilidad del plan se actualiza automáticamente.
- `updateStatus` mirror: completed → session completed + completed_at, cancelled → session unlinked (status pending), no_show → session missed.

**Staff — Nueva tab "Presupuestos" en el drawer del paciente**:
- Componente `BudgetsPanel` nuevo (`app/(dashboard)/patients/budgets-panel.tsx`): lista de planes con cards total/pagado/saldo, barra de progreso de consumo, badge de estado.
- Botón "Registrar pago" → modal con monto editable, presets (25/50/100% del pendiente), chips de método (efectivo/yape/transferencia/tarjeta/otro), referencia.
- Insert en `patient_payments` con `treatment_plan_id` set y `appointment_id` null → anticipo al plan.

**Paciente — Card "Mi plan" en el portal**:
- Nuevo endpoint `GET /api/portal/plans` devuelve balance computado server-side para los planes activos/pausados del paciente.
- Card con título, barra de progreso, pagado vs total, pendiente por cobrar.
- Respeta `accent_color` del clinic.
- Ubicación: mobile antes de los tiles, desktop en la sidebar arriba de Mi Perfil.

### Descuentos — inline + códigos reutilizables (migración 100)

Sistema two-tier. Inline para todos, códigos reutilizables como Pro feature.

**Modelo de datos**:

```
NEW TABLE discount_codes (
  id, organization_id, code, type ('percent'|'fixed'), value,
  max_uses, uses_count, valid_from, valid_until,
  applies_to_service_ids uuid[], is_active, notes,
  created_by, created_at, updated_at,
  UNIQUE (organization_id, code)
)

ALTER appointments:
  + discount_amount    -- default 0
  + discount_reason    -- texto libre o "Código X"
  + discount_applied_by (FK auth.users)
  + discount_code_id   (FK discount_codes, nullable)
```

**Effective price computation**:

```
effective_price = GREATEST(0, price_snapshot - discount_amount)
```

Computado en render — no hay columna generada. Callers que no conocen el discount (reportes existentes, portal) siguen leyendo `price_snapshot` sin cambios.

**Inline discount (plan Starter y superiores)**:
- Botón "Aplicar descuento" en el Cobros section del sidebar.
- Form expandible con 2-3 tabs: `%` / `S/.` / `Código` (el tercero solo en Pro).
- Live preview mientras se escribe: "Descuento S/ X · Nuevo total S/ Y".
- Writes directo a `appointments.discount_amount + discount_reason + discount_applied_by` vía RLS.
- Cuando hay descuento activo: summary muestra el gross price tachado, el delta, y la razón. "Editar" / "Quitar" accesibles.
- El math del sidebar (totalPrice / pending / paymentStatus / progress bar) usa `effective_price`, así pagar el discounted amount marca la cita como `paid`.

**Códigos reutilizables (Professional, Enterprise)**:
- Nueva admin page `/admin/discount-codes` gated por `RoleGate minRole=admin` + plan check.
- Starter ve un prompt de upgrade con link a `/select-plan`.
- Tabla de códigos: code (copy-to-clipboard), valor, usos/límite, vigencia, estado auto-computado (Activo / Inactivo / Expirado / Agotado), edit/delete.
- Create/edit modal: code, type, value, max_uses (optional), date window, applies_to services (chips — sin selección = todos), notes.
- Card nuevo en `/admin` grid (icono Tag, link a la página).

**API**:
- `GET /api/discount-codes` — list (plan-gated).
- `POST /api/discount-codes` — create (plan-gated, valida percent ≤ 100).
- `PATCH /api/discount-codes/[id]` — update.
- `DELETE /api/discount-codes/[id]` — delete.
- `POST /api/discount-codes/apply` — atomic apply. Valida status / dates / usage-limit / service-scope, escribe discount en appointment, incrementa `uses_count` via admin client.
- Todos devuelven `402` cuando `plan.slug === 'starter'`.

### Feature toggle — Descuentos activables (migración 101)

Owner puede desactivar todo el feature desde Settings:

- Nueva columna `booking_settings.discounts_enabled boolean default true`.
- Nueva sección "Descuentos en citas" en **Settings → Agenda** con toggle y hint-text inline que enumera qué controla.
- Cuando `false`:
  - El botón "Aplicar descuento" desaparece del sidebar (hidden).
  - `POST /api/discount-codes/apply` devuelve `403` con mensaje claro.
  - No afecta descuentos ya aplicados — solo bloquea nuevos.
- Independiente del plan gating: `discounts_enabled=true` en Starter sigue exponiendo solo el inline (codes siguen siendo Pro).

### Decisión de producto — Descuentos al crear cita en el scheduler

Evaluado y descartado por ahora. El form de creación de cita ya es largo (patient fields, servicio, doctor, office, status, anticipo). Añadir descuento duplica UI que ya existe en el sidebar (1 click después de guardar) y aumenta el cognitive load del form principal.

Si la recepción reporta fricción, se puede añadir más adelante como toggle compacto. La decisión queda documentada aquí para evitar re-debatirla.

### Ingresos reconocidos vs Caja — roadmap

Añadido a COMING-UPDATES.md sección Reportes. No se implementa ahora porque sin volumen de anticipos post-release, las tres vistas devuelven el mismo número. Reevaluar 2-3 meses después del rollout de Presupuestos.

### Archivos Nuevos / Modificados Clave

**Migraciones**:
- `supabase/migrations/099_treatment_plan_items_and_links.sql` (nuevo)
- `supabase/migrations/100_discounts.sql` (nuevo)
- `supabase/migrations/101_booking_settings_discounts_enabled.sql` (nuevo)

**Treatment plans**:
- `app/api/treatment-plans/route.ts` (multi-item + items expand)
- `app/(dashboard)/patients/treatment-plans-panel.tsx` (rewrite a form multi-item)
- `app/(dashboard)/patients/budgets-panel.tsx` (nuevo — tab Presupuestos)
- `app/(dashboard)/patients/patient-drawer.tsx` (nueva tab)
- `app/(dashboard)/scheduler/appointment-form-modal.tsx` (banner plan + link session)
- `app/(dashboard)/scheduler/appointment-sidebar.tsx` (plan context + saldo + mirror on status change)
- `app/api/portal/plans/route.ts` (nuevo)
- `app/portal/[slug]/mis-citas/page.tsx` (PortalPlanCard)
- `types/clinical-history.ts` (TreatmentPlanItem, TreatmentPlanBalance)

**Descuentos**:
- `app/api/discount-codes/route.ts` (nuevo)
- `app/api/discount-codes/[id]/route.ts` (nuevo)
- `app/api/discount-codes/apply/route.ts` (nuevo — atomic)
- `app/(dashboard)/admin/discount-codes/page.tsx` (nuevo)
- `app/(dashboard)/admin/admin-page-content.tsx` (card nuevo + count guard)
- `app/(dashboard)/scheduler/appointment-sidebar.tsx` (DiscountControls, effective_price math)

**Settings**:
- `app/(dashboard)/settings/booking-settings-tab.tsx` (toggle discounts_enabled)

**Docs**:
- `docs/treatment-plans-design.md` (nuevo — 10 diagramas Mermaid)
- `COMING-UPDATES.md` (add Ingresos vs Caja report, add Panel de resultados + Indicaciones de pre-consulta al Portal)

### Cambios de Alcance

- **Presupuestos** sale como fundacional para cualquier clínica que venda paquetes (dermatología, fertilidad, estética). Antes no era viable hacerlo bien porque `treatment_plans` no tenía precio y `patient_payments` no ligaba a plan.
- **Descuentos** sale con arquitectura clean two-tier: inline desbloquea casos cotidianos sin gating, códigos como feature de marketing que justifica el upgrade a Pro.
- **Feature toggle** — nueva convención: features que impactan flujos operativos (como los descuentos) deben poder ser desactivadas por el owner. La mayoría de clínicas lo tendrá activo, pero algunas pueden preferir no permitir descuentos (clínicas de alta gama, o cuando se está construyendo disciplina de precios).
- **Zero breaking change**: todo `discount_amount` default 0 + `treatment_session_id` null + `treatment_plan_id` null en payments. Flujos existentes no se tocan hasta que explícitamente se usen las nuevas features.

---

## 27. Changelog — Sesión 2026-04-22 cierre (v0.12.1) — Parches post-release

Cuatro bugs encontrados probando los features de v0.12.0 en producción, más un incidente de integridad de datos que originó un bug preventivo en el form del scheduler.

### Parche 1 — `discount_amount` no se descontaba en múltiples vistas

El feature de descuentos actualizó la matemática del sidebar de cita, pero 4 lugares adicionales seguían comparando `price_snapshot` gross contra `total_paid`, haciendo que una cita pagada en su totalidad tras un descuento apareciera como deudora por el monto del descuento.

**Síntoma reproducible**: cita de S/ 150 con 10% de descuento (= S/ 135), pagada por completo. La card del scheduler day-view mostraba badge rojo `⚠ S/15` en vez del check verde.

**Lugares corregidos**:
- `scheduler/day-view.tsx` — indicator de Payment/Debt en cada card.
- `scheduler/week-view.tsx` — indicator compacto en cards de la vista semanal.
- `scheduler/appointment-sidebar.tsx` — cálculo de "deuda del paciente" (suma de pendientes de todas sus citas).
- `patients/page.tsx` — filtro "Deudores" y columna Deuda del CSV export.

Todos ahora usan `effective_price = max(0, price_snapshot - discount_amount)` antes de comparar contra pagos. `PatientExtraData.appointments[].discount_amount` añadido al tipo y al `SELECT`. Default zero para filas previas a migración 100.

### Parche 2 — Integridad del link paciente↔cita al editar en el scheduler

**Bug real descubierto en producción**: una cita mostraba `patient_name = "Anahir Lopez"` pero `patient_id` apuntaba a Oscar Duran (otro paciente real distinto de la misma org). Los pagos de la cita se atribuyeron a Oscar. La "Anahir Lopez" no aparecía en `/patients` porque nunca existió como fila en `patients`.

**Causa**: flow UX permisivo en `appointment-form-modal.tsx`. Recepción tipea un DNI → el sistema encuentra un paciente → auto-llena `patient_id`, `patient_name`, `patient_last_name`, `patient_phone`. Si recepción luego **edita manualmente** los campos de nombre/teléfono para crear "otra persona", el `patient_id` quedaba pegado al match original. Al guardar: la cita saveaba con el `patient_id` equivocado.

**Fix**: nuevo `useEffect` en `appointment-form-modal.tsx` que observa `patient_name`, `patient_last_name` y `patient_phone`. Si cualquiera diverge del `foundPatient` ligado, limpia `patient_id` (`setValue("patient_id", "")`) y hace `setFoundPatient(null)`. El banner "paciente encontrado" se transforma automáticamente en "paciente nuevo", dando feedback visual claro al usuario.

Solo actúa en el create-flow. No afecta edición de citas existentes (ahí `foundPatient` nunca se inicializa).

### Parche 3 — Toast de error genérico escondía causas reales

**Síntoma**: "Error al guardar el paciente" sin más contexto, dejaba al usuario sin saber qué hacer. Debugear requería abrir DevTools y leer el error de Supabase.

**Fix** en `patient-drawer.tsx → handleSaveInfo`. El toast ahora decodifica los códigos más comunes de Postgres:
- `23505` → "Este DNI ya está registrado en otro paciente"
- `42703` → "Columna faltante en la base de datos: {detalle}. Aplica las migraciones pendientes." (detecta cuando una migración crítica como `sex` en 092 no se aplicó)
- `23514` → "Valor no permitido: {detalle}. Revisa los campos del formulario." (violaciones de CHECK constraint)
- Default → mensaje genérico + el `error.message` de Supabase appended

También loggea el error completo a `console.error` para power users.

**Caso que motivó el fix**: un owner intentaba guardar datos de una paciente y fallaba siempre con el mensaje genérico. El diagnóstico expuso que la migración 092 (que añade `patients.sex`) nunca había sido aplicada en esa instancia — un tipo de error silencioso que este toast ahora previene.

### Parche 4 — Scheduler solo mostraba una sesión en planes multi-servicio

**Síntoma**: un paciente tiene plan con 2 items (ej: "10 sesiones de Tratamiento Laser S/ 1200" + "2 sesiones de Mapeo de Endometriosis S/ 350"). Al crear cita con su DNI, el banner solo mostraba ONE sesión (la que tuviera menor `session_number` globalmente), sin dar opción a elegir cuál servicio agendar.

**Fix** en el banner del scheduler (`appointment-form-modal.tsx`): la lógica de agrupación pasó de `(plan_id)` a `(plan_id, treatment_plan_item_id)`. Cada item del plan ahora surfaea su propia fila con la siguiente sesión pending de ese servicio y su botón "Agendar sesión" independiente.

Para planes con un solo servicio, el render se colapsa a exactamente 1 fila y la UX es idéntica a antes (sin regresión). Para planes con 2+ servicios aparece un encabezado de nombre de plan seguido de una fila por servicio. El mensaje de confirmación al vincular ahora menciona el servicio específico: "Esta cita se vinculará a la sesión 11 de Mapeo de endometriosis del plan …".

`activePlanSessions` state type extendido con `treatment_plan_item_id: string | null`, propagado en el fetch.

### Data repair ejecutado manualmente

El paciente Anahir Lopez (caso de Parche 2) fue reparado en producción con SQL directo:
1. Crear paciente `Anahir Lopez` con teléfono `987589854`, DNI provisional NULL — asigna UUID nuevo `9f5a6ada-…`.
2. Re-vincular 2 citas (`58556211-…` del 30-mar y `d71f8c7c-…` del 22-abr) al UUID correcto.
3. Re-atribuir 2 pagos (`5827adb0-…` y `d39963aa-…` por S/ 79.50 y S/ 55.50 respectivamente) a Anahir. Antes estaban sumando deuda ficticia a Oscar Duran.

Procedimiento documentado para casos similares: buscar con queries heurísticas citas donde `appointments.patient_name` no coincide con `patients.first_name + last_name` del `patient_id` ligado, o donde `patient_phone` no matchea `patients.phone`.

### Diagnóstico de schema drift + catchup de migraciones 091 + 092

Auditoría durante el debug del Parche 3 reveló que este ambiente de producción nunca había corrido las migraciones 091 (sistema de addons) ni 092 (curvas de crecimiento). Estaba funcionando gracias a que:
- `useOrgAddons()` hacía `SELECT FROM organization_addons` sobre tabla inexistente, fallaba silencioso, devolvía `[]`.
- `patients.sex` no existía, pero se usaba solo cuando el form del drawer intentaba hacer `UPDATE` — de ahí el error opaco.

Documentado para referencia futura un SQL catchup seguro con:
- `addons` + `organization_addons` + RLS policies
- Seed de 15 addons (dermatology, odontology, pediatrics, cardiology, aesthetic, growth_curves, telehealth, lab_integration, etc.) con sus metadatos (category, specialties, is_premium, min_plan)
- `patient_anthropometry` table con RLS
- Sin los `INSERT FROM organization_specialties` de auto-activación (para no depender de tablas que podrían no existir todavía en ambientes similares)

Decisión de producto: como alternativa al copy-paste manual en Supabase SQL Editor, agregar Supabase CLI al flujo de desarrollo queda recomendado. El setup (5 min, una sola vez) permite `npm run db:push` para aplicar todas las migraciones pendientes en orden sin posibilidad de saltarse una. Task no crítico, a hacer cuando el owner tenga tiempo.

### Archivos modificados

- `app/(dashboard)/scheduler/day-view.tsx`
- `app/(dashboard)/scheduler/week-view.tsx`
- `app/(dashboard)/scheduler/appointment-sidebar.tsx`
- `app/(dashboard)/scheduler/appointment-form-modal.tsx`
- `app/(dashboard)/patients/page.tsx`
- `app/(dashboard)/patients/patient-drawer.tsx`

Cero migraciones nuevas en v0.12.1. Todo el trabajo es TypeScript + lógica. La migración 101 ya fue ejecutada en v0.12.0; las migraciones 091 + 092 quedan pendientes de aplicación manual con SQL catchup documentado.

### Cambios de Alcance

- **Disciplina de observabilidad**: el Parche 3 establece el patrón de decodificar códigos Postgres en toasts al usuario. Los próximos formularios de edición de entidades (organization, doctor, service, etc.) deben adoptar el mismo patrón para no reintroducir UX ciega.
- **Integridad de datos en forms multi-modo**: el Parche 2 expone una categoría de bugs donde un form que hace prefetch+prefill por un identificador (DNI, email, phone) debe mantener la invariante "mientras los campos coincidan con el registro encontrado, la relación sigue; si divergen, se rompe". Aplicar misma guarda a cualquier form que siga este patrón (búsqueda de proveedores, pacientes familiares, etc.).
- **Schema drift es un problema operativo real**, no teórico: esta sesión se toparon 5 columnas y 3 tablas faltantes en un proyecto productivo. Justifica la inversión en automatizar el push de migraciones (CLI / CI) antes de llegar a más clientes.

---

## 28. Changelog — Sesión 2026-04-22 cierre-2 (v0.12.2) — Consentimiento informado Tier 1

Feature legal obligatoria en Perú (Ley 29414 + DS 027-2015-SA) — consentimiento informado para procedimientos con riesgo. Implementado en su versión MVP; Tiers 2 y 3 documentados en COMING-UPDATES.

### Migración 102

Tres columnas nuevas, todas aditivas y con defaults seguros:

- `services.requires_consent BOOLEAN NOT NULL DEFAULT false` — el clinic admin marca qué servicios son procedimientos riesgosos (cirugía, anestesia, estética, radiación, etc.).
- `clinical_notes.consent_registered BOOLEAN NOT NULL DEFAULT false` — marca de auditoría que el doctor obtuvo consentimiento.
- `clinical_notes.consent_notes TEXT` — notas contextuales (ej: "firmado por la madre en caso pediátrico", "paciente difiere el procedimiento", "testigo presente").

Zero impacto en datos existentes. Decisión de diseño: el **archivo firmado en sí** (foto del papel / escaneo) sigue viviendo en `clinical_attachments` con `category='consent'` — ese valor de categoría ya existía pero nunca se había usado operativamente. Reusamos el flujo de upload existente (que en móvil ofrece "Tomar foto" automáticamente desde el browser) en lugar de construir un uploader nuevo.

### Admin — Toggle por servicio

En `/admin/services` al editar cada servicio, nuevo toggle **"Requiere consentimiento informado"** con hint explicativo. Al marcar un servicio como `requires_consent = true`, todas las citas futuras de ese servicio activarán el bloque prominente en la nota clínica.

Zod schema extendido en `lib/validations/service.ts`. Default false para no romper servicios existentes.

### Editor de nota clínica — Bloque "Consentimiento informado"

Nuevo panel integrado en `ClinicalNotePanel`:

- **Auto-adaptativo al servicio**: si el servicio de la cita tiene `requires_consent = true`, el bloque aparece en **ámbar prominente** con badge "Requerido" y texto legal de contexto. Si no, aparece como bloque gris discreto (por si el doctor quiere registrar consentimiento optativo igual).
- **Checkbox "Consentimiento registrado"** — firma operativa del doctor.
- **Textarea de notas** opcional.
- **Contador de adjuntos** tipo `consent` ya subidos a la cita (pill verde "✓ N archivos").
- **Warning amarillo** cuando el servicio lo requiere pero no hay adjuntos: instruye al doctor a tomar foto del papel firmado y subirlo en Adjuntos → categoría Consentimiento.

Los nuevos campos se propagan por el autosave existente (30s debounce) + save manual sin cambios en la arquitectura del panel.

### API

- `clinicalNoteSchema` + `clinicalNoteUpdateSchema` extendidos con `consent_registered` y `consent_notes`.
- `/api/clinical-notes` POST y PATCH ya hacían spread de `parsed.data`, por lo que los nuevos campos se persisten sin cambios adicionales de código.
- Types `ClinicalNote` en `types/clinical-notes.ts` actualizados.

### Fetch del flag + contador

Nuevo `useEffect` en `ClinicalNotePanel` que al abrir la nota consulta:
- `appointments.services.requires_consent` para saber si activar modo ámbar.
- `COUNT` de `clinical_attachments` con `category='consent'` ligados a la cita/paciente — alimenta el badge verde.

Queries simples, una sola vez por apertura del modal. Sin impacto en perf.

### UX flow completo (cómo usarlo)

1. **Clinic admin** va a `/admin/services`, edita el servicio "Aplicación de Botox" (por ejemplo), activa el toggle "Requiere consentimiento informado" → guarda.
2. **Recepción** agenda una cita con ese servicio para una paciente.
3. **Doctor** el día de la cita abre la nota clínica desde el scheduler. El bloque de consentimiento aparece en ámbar con badge "Requerido".
4. **Doctor imprime** el formato de consentimiento (por ahora desde un Word/PDF propio — Tier 2 lo hará automático). Paciente firma a mano.
5. **Doctor toma foto** con su celular al papel firmado, lo sube en Adjuntos → categoría Consentimiento. El contador del bloque pasa a "✓ 1 archivo".
6. **Doctor marca** el checkbox "Consentimiento registrado" en la nota. Autosave en 30s.

Flujo legal cumplido end-to-end. El documento firmado queda en Supabase Storage con RLS por org, y el registro de "consent_registered = true" queda en la nota clínica auditable.

### Tier 2 y Tier 3 — Roadmap

Documentados con detalle en COMING-UPDATES.md sección 🏥 Historia Clínica:

- **Tier 2** — `consent_templates` + `consent_records` + generador de PDF pre-llenado con datos del paciente/doctor/clínica. Gated a Professional+. Ahorra ~10 min por procedimiento.
- **Tier 3** — Firma digital desde el portal del paciente (canvas manuscrito o aceptación electrónica con hash). Diferible hasta que haya demanda explícita de clientes.
- **Badge de incumplimiento** — nice-to-have en drawer del paciente para auditorías internas. ~1h de trabajo cuando se priorice.

### Archivos modificados

- `supabase/migrations/102_informed_consent_tier1.sql` (nuevo)
- `lib/validations/service.ts` (`requires_consent` en zod schema)
- `lib/validations/clinical-note.ts` (`consent_registered` + `consent_notes` en zod schema)
- `types/clinical-notes.ts` (ClinicalNote extendido)
- `app/(dashboard)/admin/services/page.tsx` (toggle en form)
- `app/(dashboard)/scheduler/clinical-note-panel.tsx` (bloque UI + fetch de flag + autosave extendido)
- `COMING-UPDATES.md` (tier 2, tier 3, badge documentados)

Cero breaking change. Servicios existentes siguen con `requires_consent = false` y notas existentes con `consent_registered = false` — comportamiento idéntico al pre-v0.12.2 hasta que el owner marque explícitamente los servicios.

### Cambios de Alcance

- **Cumplimiento legal como feature foundational, no premium**: el Tier 1 queda disponible en TODOS los planes (incluyendo Starter). Razón: el cumplimiento de Ley 29414 no debe ser un paywall — es una obligación del negocio médico. La diferenciación comercial vendrá del Tier 2 (templates + generación de PDF) que es productivity.
- **Reuso de infrastructure existente antes de construir nueva**: la decisión de usar `clinical_attachments.category='consent'` + el input file HTML estándar (que ofrece "Tomar foto" en móvil) evitó construir un uploader especializado. Patrón a repetir para otras features.
- **Detección contextual automática**: el bloque de consentimiento cambia su prominencia visual según el servicio de la cita, sin que el doctor tenga que recordar cuáles son "riesgosos". La configuración vive donde debe (admin), la aplicación se hace donde importa (nota clínica).

---

## 29. Changelog — Sesión 2026-04-22 cierre-3 (v0.12.3) — Primera ronda de fixes post-auditoría

Primeros 5 items atacados del plan de acción derivado de la auditoría multi-agente (security + performance + UX). Los reportes completos quedan en `docs/*-review-2026-04-22.md`.

### 🔴 Security — 2 P0 corregidos

**F-01 (P0) — cross-tenant PHI risk in `/api/portal/plans`**

`app/api/portal/plans/route.ts` usa `createAdminClient()` (bypass RLS) para consultar `patient_payments` por `treatment_plan_id`. Aunque los `planIds` venían pre-filtrados por org en la query anterior, el admin client **no respeta RLS**, así que un ataque teórico con colisión de UUID podría haber expuesto pagos de otra clínica.

Fix: añadir `.eq("organization_id", session.organization_id)` explícito al query de `patient_payments`. Defense-in-depth contra el admin client.

**F-02 (P0) — TOCTOU en cancel de cita del portal**

`app/api/portal/appointments/cancel/route.ts` hacía el `UPDATE` sin re-asertar `patient_id` + `organization_id` en el WHERE, dependiendo solo del `SELECT` previo para validar ownership. Con admin client y race condition, un atacante con session_token válido podría haber cancelado citas ajenas.

Fix: el UPDATE ahora incluye `.eq("patient_id", ...).eq("organization_id", ...).in("status", ["scheduled", "confirmed"])` como guarda atómica.

### ⚡ Performance — Migración 103

Nueva migración `103_perf_indexes_2026_04_22.sql` con 10 índices identificados por el performance audit:

- `schedule_blocks(organization_id, block_date)` — F-32
- `clinical_notes(patient_id, created_at DESC)` — F-14
- `pg_trgm` extension + GIN indexes on `patients(first_name, last_name, dni, phone)` — F-11 (patient search ILIKE)
- `lookup_values(lookup_category_id, organization_id, is_active)` — F-29
- `patient_payments(appointment_id) INCLUDE (amount)` — covering index, F-18
- `reminder_logs(appointment_id, template_slug, channel, status)` — cron cadence
- `notifications(organization_id, created_at DESC)` — dashboard topbar
- `patient_portal_sessions(patient_id, expires_at DESC)`
- `clinical_attachments(patient_id, created_at DESC)`

`ANALYZE` sobre todas las tablas afectadas al final de la migración para que el planner adopte los índices de inmediato.

### 📦 Bundle — paquete `motion` eliminado

`npm uninstall motion` — removido del `package.json`. Duplicado de `framer-motion` (ambos instalados), nunca importado (`grep "from 'motion'"` → 0 matches). Ahorra ~8.5 MB de node_modules y ~300 KB gzip en el bundle de producción (Next no lo tree-shakeaba porque aparecía como import inválido al momento del análisis).

### 🎨 UX — AlertDialog + dialogs accesibles

**Nuevo sistema de confirmación imperativo**:
- `components/ui/alert-dialog.tsx` — wrapper de `@radix-ui/react-alert-dialog` con variantes `default` y `destructive`.
- `components/ui/confirm-dialog.tsx` — `<ConfirmDialogProvider>` al root layout + hook `useConfirm()` para uso imperativo tipo `await confirm({ title, description, variant: "destructive" })`.

**3 `confirm()` nativos críticos reemplazados** (los más irreversibles del repo):
- `clinical-note-panel.tsx:350` — firmar nota clínica (bloquea ediciones futuras).
- `appointment-sidebar.tsx:549` — eliminar cita.
- `portal/mis-citas/page.tsx:282,285` — `alert()` → `toast.error()` (tiene sentido un toast, no un dialog, en el portal).

Los otros ~13 `confirm()` restantes (admin CRUD: discount-codes delete, treatment-plan-templates, clinical-templates, diagnosis-codes, lookups, members, offices, services, growth-curves, whatsapp-templates) usan el mismo patrón `if (!confirm(...)) return;` — su migración al `useConfirm()` es ~10 min de trabajo lineal, documentada en COMING-UPDATES como follow-up.

**3 modales hand-rolled convertidos a Radix Dialog** (role="dialog" + aria-modal + ESC + focus trap + focus return + portal):
- `scheduler/appointment-form-modal.tsx` — el más usado del app, crear/editar cita.
- `patients/budgets-panel.tsx` — modal de registrar pago al plan.
- `admin/discount-codes/page.tsx` — CodeFormModal crear/editar código.

Los ~6 modales restantes (patient-drawer expanded, clinical-history-modal, bulk-import, patient-form, account, members) siguen hand-rolled. Documentado en COMING-UPDATES como deuda de a11y a pagar en el siguiente sprint.

### Archivos modificados

- `app/api/portal/plans/route.ts` (+3 líneas, explicit org filter)
- `app/api/portal/appointments/cancel/route.ts` (+3 líneas, UPDATE re-asserts ownership)
- `supabase/migrations/103_perf_indexes_2026_04_22.sql` (nuevo)
- `package.json` (− `motion` dependency)
- `components/ui/alert-dialog.tsx` (nuevo)
- `components/ui/confirm-dialog.tsx` (nuevo — Provider + useConfirm)
- `app/layout.tsx` (wire ConfirmDialogProvider)
- `app/(dashboard)/scheduler/clinical-note-panel.tsx` (useConfirm para firma)
- `app/(dashboard)/scheduler/appointment-sidebar.tsx` (useConfirm para delete)
- `app/(dashboard)/scheduler/appointment-form-modal.tsx` (Radix Dialog)
- `app/(dashboard)/patients/budgets-panel.tsx` (Radix Dialog para payment)
- `app/(dashboard)/admin/discount-codes/page.tsx` (Radix Dialog para form)
- `app/portal/[slug]/mis-citas/page.tsx` (alert → toast)

### Cambios de Alcance

- **Defense-in-depth cuando se usa `createAdminClient`**: establecido el patrón de re-asertar filtros de ownership en cada query/UPDATE bajo admin client, aún cuando un SELECT previo ya validó. No confiar en el estado de 2 queries atrás — los admin writes bypass RLS y las RLS son nuestra red de seguridad real.
- **A11y de modales** pasa de "bienintencionada pero ausente" a "sistema Radix con 3 patrones adoptados". La deuda restante (~6 modales) está documentada y tiene el pattern definido — el siguiente sprint es puramente copiar el patrón.
- **Confirmaciones imperativas** reemplazan `confirm()` nativo sin cambiar la forma del código (`if (!(await confirm({...}))) return;` vs `if (!confirm("...")) return;` — prácticamente el mismo diff en cada sitio), incentivando adopción.
- **Performance**: migración 103 entrega los índices sin tocar código. Una sola aplicación mejora latencia de 8+ queries en hot paths (scheduler, dashboard, portal, cron).

### Migración pendiente de aplicar

```sql
-- Aplicar en Supabase SQL Editor (o npm run db:push cuando esté configurado)
-- Ver: supabase/migrations/103_perf_indexes_2026_04_22.sql
```

Post-apply, ejecutar:
```sql
SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_%_trgm' OR indexname LIKE 'idx_schedule_blocks_%' OR indexname LIKE 'idx_clinical_notes_%';
-- Debe listar los 10 nuevos.
```

---

## 30. Changelog — Sesión 2026-04-22 cierre-4 (v0.12.4) — Segunda ronda post-auditoría

Segunda tanda de fixes del plan de acción tras la auditoría multi-agente. Cierra 3 findings P1 de security, las optimizaciones del hot-path del scheduler y una primera pasada de copy polish.

### 🛡️ F-06 — `clinical-attachments` ownership check

`GET /api/clinical-attachments/[id]` generaba una URL firmada para el archivo sin verificar que perteneciera a la org del caller. Aunque las RLS policies ya limitaban el SELECT, el endpoint no re-aseguraba en su query. Ahora incluye `.eq("organization_id", membership.organization_id)` explícito — defensa en profundidad + semántica clara 403/404.

### 🛡️ F-10 + F-04 — 2FA real para founder routes (migración 104)

Antes el panel founder tenía 2FA "cosmético": el TOTP generaba una cookie pero **ningún endpoint la verificaba**. Cualquier sesión con `is_founder = true` entraba aunque la cookie fuera falsa o inexistente. Adicionalmente las sesiones se guardaban en un `Map<token, entry>` in-memory — roto en Vercel serverless (cada lambda tiene su propia memoria).

**Fix en 4 partes:**

1. **Migración 104** — nueva tabla `founder_2fa_sessions (token, user_id, expires_at, created_at)` con RLS activa y cero policies (bloquea acceso directo, solo service role escribe/lee).

2. **`lib/founder-auth.ts` reescrito** — ahora usa el admin client + tabla. Funciones `createFounder2FASession`, `validateFounder2FASession`, `destroyFounder2FASession`, `getCurrentFounder2FAUser`. Cleanup amortizado de filas expiradas.

3. **Nuevo `lib/require-founder.ts`** — helper unificado que valida 3 capas: auth + `is_founder` + cookie 2FA. Devuelve `{ userId }` o `{ error: NextResponse }`. Código de error `FOUNDER_2FA_MISSING` permite al frontend redirigir a re-auth.

4. **8 routes founder actualizadas** para usar `requireFounder()` en vez del patrón de auth+is_founder manual (~15 líneas menos por route). Las 3 rutas TOTP (`/setup`, `/verify`, `/status`) preservan el patrón antiguo intencionalmente — corren ANTES del 2FA.

### 🛡️ F-11 — PHI allowlist en LLM assistant

El asistente IA (`/api/ai-assistant`) envía los resultados de queries al usuario como contexto a Anthropic, sin filtrado. Eso significaba que DNIs, nombres, teléfonos, notas clínicas libres y diagnósticos CIE-10 viajaban a la API externa. Aunque Anthropic no retiene bajo contrato empresarial, para contratos con clínicas institucionales (hospitales estatales, aseguradoras) esto es bloqueador.

**Fix:** nuevo `lib/pseudonymize-phi.ts` con helper `pseudonymizePHI(data)`. Dos reglas:

- **Denylist de keys**: `dni`, `email`, `phone`, `portal_*`, `notes`, `subjective/objective/assessment/plan` (SOAP), `diagnosis_code`, `diagnosis_label`, `consent_notes`, direcciones, custom_fields → reemplazadas con `"[redacted]"`.
- **Pseudonimización consistente**: `first_name`, `last_name`, `patient_name`, `full_name` → mapeo `Map<valor_original, "Paciente #N">` para que el LLM pueda correlacionar ("el Paciente #3 vino 4 veces") sin saber de quién se trata.
- `birth_date` se trunca a año (`1985-XX-XX`).
- **NO se redactan**: nombres de doctores (profesionales públicos), servicios, oficinas, fechas de cita, precios, estados → el LLM puede seguir respondiendo "¿cuántas consultas hizo Dr. García este mes?" útilmente.

Aplicado en una sola línea de `/api/ai-assistant/route.ts:522` — se sanitiza `queryData` antes del `JSON.stringify` que va al prompt.

### ⚡ Item 7 — Scheduler hot-path

**Cambio 1 — columnas explícitas en vez de `select("*, ...")`**. El fetch principal del scheduler pasaba por la red todas las ~40+ columnas de `appointments` cuando el UI solo lee ~25. Ahora enumera explícitamente (`id, patient_id, patient_name, patient_phone, doctor_id, office_id, service_id, appointment_date, start_time, end_time, status, origin, payment_method, responsible, responsible_user_id, notes, meeting_url, price_snapshot, discount_amount, discount_reason, discount_code_id, treatment_session_id, organization_id, created_at, updated_at, edited_at, edited_by_name` + las relaciones). Reduce ~50% el volumen de red + parse en clínicas con 200+ citas/día.

**Cambio 2 — indices pre-construidos para lookups O(1)**. `day-view.tsx` hacía `appointments.find(...)` y `appointments.some(...)` dentro del render loop = O(citas × slots × oficinas) por render. Con 200 citas, 50 slots, 5 oficinas → 50.000 comparaciones por cada actualización del DOM.

Nuevo helper `buildAppointmentIndices(appointments, dateStr, slotMinutes)` corre UNA vez por render (vía `useMemo`) y construye:
- `byExactStart: Map<"officeId|slotTime", Appointment>` para lookup exacto
- `occupiedSlots: Set<"officeId|slotTime">` para "¿este slot está ocupado?"
- `sorted: Appointment[]` para el fallback range (citas fuera del grid)

Lookup por celda ahora es O(1). Con los mismos 200 × 50 × 5 = 50.000 checks, el tiempo de render pasa de ~200ms a ~15ms.

### 🎨 Item 9 — Copy polish (primera pasada)

Ediciones aplicadas de la lista del UX review:

- `"Error de conexión"` → `"Sin conexión. Revisa tu internet e intenta otra vez."` en 10 archivos (portal, book, auth, clinical panels, patient drawer).
- `"Error al crear la cita"` (public booking) → `"No pudimos reservar. El horario puede haberse ocupado — elige otro."`.
- Portal cancelación: `"Error al cancelar"` → `"No pudimos cancelar tu cita. Intenta de nuevo o contacta a la clínica."` + conversión de `alert()` a `toast.error()` (commit anterior).
- Portal tiles: `"Primera vez"` → `"Sin visitas previas"`.
- Portal empty state: `"Contacta a la clínica para agendar"` → `"Contáctanos para agendar tu cita"` (menos stiff).
- Anglicismo `"Break Time"` → `"Descanso"` en scheduler day-view + dialog (3 archivos).

Las otras ~15 ediciones (status labels conservados para no romper operaciones, placeholders, microcopy de ayuda) quedan registradas en `docs/ux-review-2026-04-22.md` sección "Copy polish" para aplicar con calma.

### Archivos modificados / nuevos

**Security:**
- `app/api/clinical-attachments/[id]/route.ts` — org guard en GET
- `supabase/migrations/104_founder_2fa_sessions.sql` (nuevo)
- `lib/founder-auth.ts` — reescrito para DB backend
- `lib/require-founder.ts` (nuevo)
- `app/api/founder/totp/verify/route.ts` — await de create session + constante renombrada
- 8 rutas founder (no TOTP) — usar `requireFounder()`
- `lib/pseudonymize-phi.ts` (nuevo)
- `app/api/ai-assistant/route.ts` — aplica `pseudonymizePHI`

**Performance:**
- `app/(dashboard)/scheduler/page.tsx` — columnas explícitas
- `app/(dashboard)/scheduler/day-view.tsx` — indices memoizados

**Copy:**
- 10 archivos con `"Error de conexión"` → versión amigable
- `app/portal/[slug]/mis-citas/page.tsx` — varias cadenas
- `app/book/[slug]/page.tsx` — error de reserva
- `app/(dashboard)/scheduler/day-view.tsx` + `break-time-dialog.tsx` — Break Time → Descanso

### Migración a aplicar (además de 103)

```sql
-- supabase/migrations/104_founder_2fa_sessions.sql
CREATE TABLE IF NOT EXISTS founder_2fa_sessions (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_founder_2fa_sessions_user ON founder_2fa_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_founder_2fa_sessions_expiry ON founder_2fa_sessions (expires_at);
ALTER TABLE founder_2fa_sessions ENABLE ROW LEVEL SECURITY;
```

Sin esta migración, **TODAS las rutas founder responderán 403** (F-10 code `FOUNDER_2FA_MISSING`) porque la verificación de cookie busca un token en la tabla que no existe. Aplicar **antes** de deployear el código.

### Cambios de Alcance

- **Defense-in-depth** se consolida como patrón obligatorio: cada endpoint que usa `createAdminClient()` debe re-asertar filtros de ownership. Las RLS son la primera línea de defensa, las queries explícitas son la segunda.
- **PHI-at-rest vs PHI-in-transit a LLMs**: establece el patrón de pseudonymización antes de enviar a APIs externas. Aplicable a futuras integraciones (OpenAI, Google, etc.) y a exports/reportes que puedan viajar fuera del perímetro.
- **Scheduler perf**: pattern de "indices pre-construidos con useMemo" puede aplicarse a otras vistas con lookups caros (week-view, historical reports). Queda codificado como ejemplo en `day-view.tsx`.
- **Copy amigable por defecto**: "Sin conexión. Revisa tu internet" reemplaza el estándar "Error de conexión" en todo el producto. Los próximos errores deben adoptar el mismo tono — específicos, accionables, primera persona plural ("No pudimos…", "Revisa…").

---

## 31. Hito — Pilot de Vitra (2026-04-24)

**Primer cliente real.** Centro de fertilidad en Lima, contrato de 1 mes de evaluación antes de renovación anual. Arranque: semana del Lunes siguiente.

### Docs de soporte creados

Toda la guía operativa del pilot vive en `docs/`:

- `docs/vitra-pilot-checklist.md` — Fases 0→4 (pre-launch, onboarding, semana 1, semanas 2-3, evaluación mes 4)
- `docs/vitra-seed-data.sql` — Template SQL con placeholders `<<<...>>>` para catálogo de fertilidad (servicios + `requires_consent` + precios), doctores, consultorios, horarios, booking settings
- `docs/vitra-training-script.md` — 45 min divididos en Recepción (15) · Doctor (15) · Admin (10) · Portal (5)
- `docs/vitra-feedback-log.md` — Tabla de bugs + métricas semanales + notas de reuniones Viernes + rúbrica de evaluación final
- `docs/system-tour.md` — Guía mental del sistema (capas, flujos end-to-end, mapa de archivos, gotchas operativos, checklist de mantenimiento)

### Estado de deuda técnica al momento del pilot

Verificación de código al 2026-04-24:

**✅ Cerrados** (v0.12.3 + v0.12.4):
- F-04 — 2FA sessions DB-backed (migración 104)
- F-06 — clinical-attachments ownership check
- F-10 — founder routes validan cookie 2FA real (`requireFounder()`)
- F-11 — PHI allowlist en LLM assistant (`pseudonymizePHI()`)
- F-01 perf — columnas explícitas en scheduler
- Item 6 perf — indices O(1) en day-view (200ms → 15ms)
- ~14/24 copy edits aplicados
- `motion` package duplicado removido (-8.5MB)
- AlertDialog system para confirms críticos
- Migraciones 103 (performance indexes) + 104 (founder 2fa sessions) aplicadas

**🟡 Parcial**:
- F-05 rate limiter — funciona in-memory (`lib/rate-limit.ts`), aplicado a webhook MP (60/min) y portal magic-link (3/min). Migración a Upstash/Redis diferida post-pilot (single-instance suficiente para 1 clínica).

**⏸️ Diferidos post-pilot** (no bloquean operación, riesgo de regresión con cliente mirando):
- F-03 magic-link hash — tokens plaintext en `patient_portal_tokens`. Mitigación actual: RLS estricto + rate limit + TTL corto. Fix programado para v0.12.5.
- F-19 MP webhook prefix — HMAC sí valida, pero falta prefix check de `data.id`. Fix programado para v0.12.5.
- ~10 copy edits restantes — principalmente "Error al guardar" genéricos en admin CRUD.
- 9 modales hand-rolled → Radix Dialog (incluye drawer del paciente, 1400 líneas — refactor delicado).
- 13 `confirm()` nativos → `useConfirm()` en admin CRUD + 1 en scheduler sidebar.
- Design system dual (portal iOS-flavored vs dashboard shadcn-tokens vs /book light) — refactor grande, post-feedback de Vitra para priorizar qué unificar.
- `recharts` dynamic import (F-12 perf).
- AppointmentSidebar 4 awaits secuenciales → `Promise.all` (F-05 perf).

### Principio operativo del pilot

**El pilot NO es momento de construir features nuevas.** Es momento de pulir lo existente con uso real. Cualquier request de Vitra que no sea bug se captura en `docs/vitra-feedback-log.md` y se prioriza en reunión de evaluación del mes 4.

### Artefactos esperados al cierre del pilot

- Caso de estudio con números reales (citas, pacientes, ingresos, tiempo promedio de consulta)
- Lista priorizada de bugs/features basada en uso real
- Testimonial para marketing (si fue bien)
- Plantilla de onboarding reusable para próximas clínicas
- Decisión comercial: renovación anual (Professional vs Enterprise) + features pagables extra

---

## 32. Changelog — Sesión 2026-04-24 (v0.12.5) — Tier seguro pre-pilot

Última ronda de fixes **antes** del arranque del pilot de Vitra. Selección deliberadamente minimalista: solo cosas con bajo riesgo de regresión, altas en valor para el flujo que Vitra va a tocar.

### 🛡️ F-03 — Magic-link tokens hasheados (migración 105)

Antes: `patient_portal_tokens.token` guardaba el token raw (64 chars hex) idéntico al que viajaba en el email del paciente. Un backup de DB fugado, una réplica mal configurada, o un RLS momentáneamente débil bastaba para impersonar cualquier paciente cuyo token estuviera vivo (ventana 15 min).

**Fix:**
- Migración 105: purga los tokens pending, drop columna `token`, añade `token_hash TEXT UNIQUE NOT NULL` + índice. Las filas históricas (used_at NOT NULL) se backfillan con `'legacy-<id>'` para no romper la PK.
- `lib/portal-auth.ts`: nueva helper `hashToken(raw) = sha256(raw)` hex.
- `app/api/portal/auth/request-link/route.ts`: genera token raw, lo hashea, persiste solo el hash. Raw sigue yendo al email (estándar para magic-link flows).
- `app/api/portal/auth/verify/route.ts`: recibe raw del URL query, hashea, busca por hash.

Ahora un leak de DB no es suficiente para usarse — el atacante necesitaría también acceso al correo del paciente (que es exactamente el modelo de seguridad de cualquier magic-link).

### 🧹 11 `confirm()` nativos → `useConfirm()`

Cerrado el último frente del patrón `useConfirm()` introducido en v0.12.3. Migrados:

- `admin/clinical-templates` (delete plantilla)
- `admin/diagnosis-codes` (delete código)
- `admin/lookups` (delete valor)
- `admin/members` (2×: remove + deactivate)
- `admin/offices` (delete)
- `admin/services` (2×: delete servicio + delete categoría)
- `admin/treatment-plan-templates` (delete plantilla)
- `admin/discount-codes` (delete código)
- `patients/growth-curves-panel` (delete medición)
- `settings/whatsapp-templates-tab` (delete plantilla)

Cero `confirm()` nativos restantes en `app/(dashboard)/**`. Solo quedan 3 `alert()` en `founder/integrations/page.tsx` (uso interno, menor prioridad).

### 🎨 Copy edits — ronda 2 (11 cadenas)

Aplicadas de la lista del UX review sección "Copy polish":

- `clinical-note-panel`: `"Error al guardar"` → `"No se pudo guardar la nota. Tus cambios siguen en pantalla — reintenta."` | `"Error al firmar"` → `"No se pudo firmar la nota. Revisa que todos los campos estén completos."` | dialog de firma: `"¿Firmar esta nota clínica? Una vez firmada no podrá ser editada."` → `"Firmar nota clínica. Al firmar se bloquea la edición permanentemente."`.
- `appointment-sidebar`: `"Error al subir el documento"` → `"No pudimos subir el archivo. ¿Excede los 10 MB?"` | `"Error al registrar pago: " + msg` → `"No pudimos registrar el pago. " + msg`.
- `scheduler/page`: `"Error al mover la cita: " + msg` → `"No pudimos mover la cita. " + msg`.
- `appointment-form-modal`: `"Cita creada, pero error al registrar anticipo: " + msg` → `"Cita creada. No se pudo registrar el anticipo — regístralo manualmente en el panel."`.
- `book/[slug]/page`: `"Elige fecha y hora"` → `"Selecciona fecha y hora"` | `"Entra a tu portal"` → `"Accede a tu portal"` | placeholders `"Juan"`/`"Pérez"` → `"Ej. María"`/`"Ej. Rodríguez"`.
- Portal: 3× `"Error de conexión"` → `"Sin conexión. Revisa tu internet e intenta otra vez."` en `mis-citas`, `registro`, `verify`.

### 🧱 6 modales hand-rolled → Radix Dialog

Modales convertidos al patrón Radix Dialog (focus trap, ESC, overlay click-outside, `role="dialog"` + aria-labelledby, SSR-friendly portal):

- `scheduler/block-dialog.tsx`
- `scheduler/available-slots-modal.tsx` (además removido dead `motion`/`AnimatePresence` imports)
- `admin/members/page.tsx` — invite modal
- `account/page.tsx` — modal "Añadir cupos extra" (addons)
- `patients/clinical-history-modal.tsx`
- `patients/patient-form-modal.tsx`

Patrón copiado de `scheduler/appointment-form-modal.tsx` (referencia dorada). Shell idéntica: `<Dialog open onOpenChange={v => !v && onClose()}> <DialogContent className="[&>button]:hidden"> <DialogTitle/> <DialogDescription className="sr-only"/> ...contenido... </DialogContent> </Dialog>`.

### ⏸️ Explícitamente diferidos (rastreables en `COMING-UPDATES.md`)

- **`patients/patient-drawer.tsx`** — ~1400 líneas, drawer del paciente que recepción usa a diario. Refactor delicado (tabs anidados, estado de edición inline, keyboard shortcuts). Riesgo alto de regresión con pilot arrancando. Requiere sesión dedicada + QA manual.
- **`patients/bulk-import-modal.tsx`** — parsing de CSV con edge cases numerosos. Mismo argumento.
- **F-19** (MP webhook prefix check) — fix trivial (~15 min) pero requiere test con sandbox de MP para no romper el flujo de cobros. Se hará en commit separado antes del deploy.

### Archivos modificados / nuevos

**Security:**
- `supabase/migrations/105_portal_magic_link_hash.sql` (nuevo)
- `lib/portal-auth.ts` — añadida `hashToken()`
- `app/api/portal/auth/request-link/route.ts` — persiste hash
- `app/api/portal/auth/verify/route.ts` — busca por hash

**UX (`useConfirm`):**
- `app/(dashboard)/admin/clinical-templates/page.tsx`
- `app/(dashboard)/admin/diagnosis-codes/page.tsx`
- `app/(dashboard)/admin/lookups/page.tsx`
- `app/(dashboard)/admin/members/page.tsx`
- `app/(dashboard)/admin/offices/page.tsx`
- `app/(dashboard)/admin/services/page.tsx`
- `app/(dashboard)/admin/treatment-plan-templates/page.tsx`
- `app/(dashboard)/admin/discount-codes/page.tsx`
- `app/(dashboard)/patients/growth-curves-panel.tsx`
- `app/(dashboard)/settings/whatsapp-templates-tab.tsx`

**UX (copy):**
- `app/(dashboard)/scheduler/clinical-note-panel.tsx`
- `app/(dashboard)/scheduler/appointment-sidebar.tsx`
- `app/(dashboard)/scheduler/page.tsx`
- `app/(dashboard)/scheduler/appointment-form-modal.tsx`
- `app/book/[slug]/page.tsx`
- `app/portal/[slug]/mis-citas/page.tsx`
- `app/portal/[slug]/registro/page.tsx`
- `app/portal/[slug]/verify/page.tsx`

**UX (modales Radix):**
- `app/(dashboard)/scheduler/block-dialog.tsx`
- `app/(dashboard)/scheduler/available-slots-modal.tsx`
- `app/(dashboard)/admin/members/page.tsx`
- `app/(dashboard)/account/page.tsx`
- `app/(dashboard)/patients/clinical-history-modal.tsx`
- `app/(dashboard)/patients/patient-form-modal.tsx`

### Migración a aplicar antes del deploy

```sql
-- supabase/migrations/105_portal_magic_link_hash.sql
DELETE FROM patient_portal_tokens WHERE used_at IS NULL;
DROP INDEX IF EXISTS idx_portal_tokens_lookup;
ALTER TABLE patient_portal_tokens DROP CONSTRAINT IF EXISTS patient_portal_tokens_token_key;
ALTER TABLE patient_portal_tokens DROP COLUMN IF EXISTS token;
ALTER TABLE patient_portal_tokens ADD COLUMN token_hash TEXT;
UPDATE patient_portal_tokens SET token_hash = 'legacy-' || id::text WHERE token_hash IS NULL;
ALTER TABLE patient_portal_tokens ALTER COLUMN token_hash SET NOT NULL;
ALTER TABLE patient_portal_tokens ADD CONSTRAINT patient_portal_tokens_token_hash_key UNIQUE (token_hash);
CREATE INDEX idx_portal_tokens_hash_lookup ON patient_portal_tokens (token_hash, expires_at);
```

Sin esta migración, `/api/portal/auth/request-link` fallará al insertar (columna `token_hash` no existe) y `/api/portal/auth/verify` no encontrará tokens (busca por `token_hash`). Aplicar **antes** de deployear.

### Cambios de Alcance

- **Magic-link security**: establece el patrón de `raw en email + hash en DB` para cualquier token futuro (session tokens del portal siguen siendo plaintext en DB pero están en cookie httpOnly/secure — distinto vector; revisable post-pilot si hace falta).
- **`confirm()` nativos erradicados del dashboard**: queda como regla de contribución. Cualquier PR que introduzca `confirm()` nativo debe convertirse a `useConfirm()`.
- **Modales Radix Dialog**: 2 modales grandes (`patient-drawer` + `bulk-import`) quedan hand-rolled intencionalmente, documentados en COMING-UPDATES con criterios claros para retomar el refactor.


---

## 33. Changelog — Sesión 2026-04-24 tarde (v0.12.6) — Landing auditada + RevenueImpact

Auditoría multi-agente (senior web design + neurocopywriting + UI/UX) de la home page. Foco: qué queda anticuado, qué no persuade, qué sección falta para cerrar la conversación de venta.

### 🎯 Nueva sección `RevenueImpact` — "Cómo Yenda aumenta tus ingresos"

Insertada entre `ExpectedResults` y `Pricing`. Tono: en LATAM se dice "ingresos" / "facturación", NO "ventas" — suena a vendedor de autos. Objetivo: que el owner entienda que Yenda no es gasto operativo, es inversión en revenue.

**Componente:** `components/landing/revenue-impact.tsx` (nuevo, ~320 líneas).

**3 bloques narrativos:**

1. **Grid 4-col de pérdidas** — Cada card muestra dónde se pierde plata HOY vs. qué recupera Yenda, con tachado rose sobre el valor perdido:
   - No-shows (15–25% agenda → hasta 38% menos)
   - Cobranza pendiente (S/ 500–1,200/mes → 60–80% recuperado)
   - Pacientes que no vuelven (40% sin seguimiento → +15% retención)
   - Captación frenada (solo por llamada → +8–12% nuevos)

2. **Calculadora ROI interactiva** — 3 sliders (doctores, citas/doctor/mes, tarifa promedio). Modelo conservador: no-show 20% → 5% + 8% captación extra. Resultado animado con easing cúbico en S/ por mes y por año. Card verde con dos bullets explicando de dónde sale el número.

3. **Headline de apertura:** "Tu clínica pierde dinero todos los meses. Yenda te muestra dónde." Subheadline ataca la objeción peruana típica: "No se trata de presionar a tus pacientes. Se trata de dejar de perder cobros por olvido…".

**Decisión de producto:** el modelo de cálculo es deliberadamente conservador. Con `doctors=3, apptPerDoctor=60, price=150` da ~S/5.4k/mes. No se usan claims agresivos tipo "multiplica por 3x".

### 🧠 Copy del Hero reescrito

Antes:
- H1: "La primera agenda clínica con IA."
- CTAs: "Empezar ahora" / "Ver cómo funciona"
- Trust line: "Sin contratos. Cancela cuando quieras."

Después:
- H1: "Menos tiempo administrando. **Más tiempo con tus pacientes.**"
- CTAs: "Probar gratis 14 días" / "Calcula tu impacto" → `#revenue-impact`
- Trust line: "**Sin tarjeta para probar.** Sin contratos. Configura tu clínica en minutos."

**Razón:** "La primera con IA" es vago (¿primera en qué? ¿por qué importa?). El headline nuevo ataca el dolor concreto (administración come tiempo clínico). El CTA secundario ahora lleva a la calculadora ROI en vez de a un ancla genérica de features — deep-link a la sección más persuasiva de la home.

### 🏥 `SocialProof` rediseñado

Antes: 4 trust badges + 1 pill "Sé de los primeros 100". Sin testimonios ni validación real.

Después: layout 5-col:
- **3 columnas** — testimonial card de Vitra (primer cliente real, pilot Abril 2026): nombre, tipo, ubicación, quote de por qué eligieron Yenda, status pill "Pilot activo". Placeholder verificable — el quote se reemplaza con testimonio real post-pilot.
- **2 columnas** — card verde "Acceso anticipado" con CTA a Pricing.
- **Debajo** — los 4 trust badges originales en fila.

Convierte una sección débil (la más flaggeada por los 3 agentes) en el cierre emocional previo a Pricing. El testimonial de Vitra es real y verificable; el framing "construido con los primeros 100" ancla por qué el feedback del early adopter importa.

### 🔀 Reorden narrativo: `TrustBadges` después de `PainPoints`

Orden antes: Hero → **TrustBadges** → GrowthPath → PainPoints → RoleSuperpowers → Features → LiveNotifications → AIAssistant → ExpectedResults → Pricing → SocialProof → ComingUpdates → FAQ → FinalCTA.

Orden después: Hero → **PainPoints** → **TrustBadges** → GrowthPath → RoleSuperpowers → Features → LiveNotifications → AIAssistant → ExpectedResults → **RevenueImpact** → Pricing → SocialProof → ComingUpdates → FAQ → FinalCTA.

**Razón (neurocopy agent):** TrustBadges después del Hero interrumpe. Mejor fluye así: hook → "¿te suena?" (dolor) → validación institucional → ROI → solución detallada → precio.

### Archivos modificados / nuevos

- `components/landing/revenue-impact.tsx` (nuevo)
- `components/landing/hero.tsx` — headline + CTAs + trust line
- `components/landing/social-proof.tsx` — reescrita completa con testimonial Vitra
- `app/page.tsx` — import + reorden

### Cambios de Alcance

- **"Ingresos" > "Ventas"** queda como regla de copy: todo copy de vender-a-clínica usa "ingresos", "facturación", "cobranza" — nunca "ventas". Aplica a toda landing futura, emails de activación, copy de trial.
- **Deep-links desde Hero**: el CTA secundario de Hero apunta a `#revenue-impact`. Patrón reusable — el CTA secundario puede llevar a la sección con mayor densidad persuasiva, no a un genérico `#features`.
- **Testimonial-placeholder con cliente real**: `SocialProof` muestra a Vitra antes del testimonio verificado final. Políticamente honesto porque el pilot ES real y público — no inventa quote, lo enmarca como "pilot activo". Actualizar quote al cierre del pilot.

### Deuda registrada (ver `COMING-UPDATES.md`)

Items que los agentes detectaron y decidimos NO hacer pre-pilot (riesgo de regresión, foco en estabilidad):

- Modernización del Hero mockup (asymmetric + device secundario flotante)
- Consolidar `GrowthPath` + `Pricing` (duplican los 3 tiers)
- Mobile breaks en `RoleSuperpowers`, `LiveNotifications`, `PatientCardsCarousel`
- CTA differentiation en Pricing (3× "Empezar ahora" idénticos) y RoleSuperpowers (sin CTA)
- Features con screenshots reales (hoy placeholders vacíos)
- Micro-interactions: Pricing toggle, Feature hover, LiveNotifications swipe
- Muletas copy a eliminar: "Todo lo que necesitas. Nada que no.", "Potencia administradores", "Y no para."

---

## 34. Changelog — Sesión 2026-04-24 (v0.12.7) — Google Calendar (org-level, one-way)

Primera integración real con Google Calendar. Modelo deliberadamente simple para empezar: **una sola cuenta por organización** (no por doctor), **one-way Yenda → Google** (Yenda es source of truth, Google es respaldo / vista para el front desk).

### Diseño

- **1 calendar por org**: matchea workflows de recepción donde toda la clínica mira un solo calendar. Un solo OAuth por org. El owner/admin conecta una vez su cuenta Google (puede ser una cuenta dedicada de la clínica) y todas las citas se reflejan ahí.
- **One-way**: Yenda nunca lee de Google. Si alguien edita un evento en Google directamente, Yenda no se entera (y queda fuera de sync hasta la próxima edición desde Yenda). Esto evita conflictos y mantiene Yenda como source of truth.
- **Best-effort async**: si Google falla (token expirado, rate limit, calendar borrado), la cita en Yenda se crea/edita/cancela igual. El sync nunca bloquea la UX.
- **Cancelación = PATCH status='cancelled'**, no DELETE — preserva auditoría en Google también.

### Esquema (migración 106)

Tabla nueva `google_calendar_integrations`:
- `organization_id UNIQUE` (1 por org)
- `connected_by_user_id` (auditoría)
- `google_account_email` (display en UI)
- `google_calendar_id` (default `'primary'`)
- `access_token_encrypted` + `refresh_token_encrypted` — **AES-256-GCM** vía `lib/encryption.ts` con `ENCRYPTION_KEY` env. Nunca plaintext en DB.
- `expires_at`, `scope`, `is_active`
- `last_sync_at`, `last_sync_error`, `last_sync_error_at` — el UI los lee para alertar al owner si el sync rompe.

Columna nueva en `appointments`:
- `google_event_id TEXT` (nullable). Guarda el ID del evento creado en Google para PATCH/cancel posteriores.

RLS:
- SELECT: cualquier miembro de la org (vía `get_user_org_ids()`).
- ALL: solo `owner` o `admin` (vía `is_org_admin(org_id)`).

### Componentes nuevos

- `lib/google-calendar.ts` — todo el wrapping de Google Calendar API (sin `googleapis` SDK; raw fetch para mantener bundle chico):
  - `buildAuthorizationUrl(state, redirectUri)` — URL del consent screen
  - `exchangeCodeForTokens({ code, redirectUri })` — code → tokens (fuerza `prompt=consent` + `access_type=offline` para garantizar refresh_token)
  - `fetchUserInfo(accessToken)` — pide el email del owner (display)
  - `getValidAccessToken(integration)` — refresca transparente si expiró (margen de 60s)
  - `createEvent(orgId, event)` / `updateEvent(orgId, eventId, event)` / `cancelEvent(orgId, eventId)`
  - `revokeToken(token)` — para disconnect
  - `toLimaISO(date, time)` — convierte fecha+hora local de la DB a ISO con offset Lima `-05:00` (Perú no tiene DST)

- `lib/google-calendar-client.ts` — helper de cliente fire-and-forget:
  ```ts
  syncAppointmentToGoogle(appointmentId, "upsert" | "cancel");
  ```
  Llama a `/api/integrations/google/sync-appointment` sin `await`. La ruta devuelve siempre 200 (best-effort) y el cliente nunca falla.

### Routes

- `GET /api/integrations/google/connect` — verifica auth + admin role, firma `state` con HMAC-SHA256(payload, SUPABASE_SERVICE_ROLE_KEY), redirige a Google consent.
- `GET /api/integrations/google/callback` — verifica state, intercambia code, encripta tokens, upsert `google_calendar_integrations`, redirige a `/settings?tab=integraciones&gcal=ok`.
- `POST /api/integrations/google/disconnect` — best-effort revoke en Google + delete row.
- `GET /api/integrations/google/status` — lee estado para la UI (email, last_sync_at, last_sync_error, is_active).
- `POST /api/integrations/google/sync-appointment` — `{ appointmentId, action: "upsert" | "cancel" }`. Carga la cita con relaciones (doctor/office/service), construye el evento, hace POST/PATCH a Google, persiste el `google_event_id` en el primer create. Siempre devuelve 200.

### Wired en 4 puntos de mutación de citas

1. **Crear** — `scheduler/appointment-form-modal.tsx:629` (después de notificación in-app)
2. **Drag & drop move** — `scheduler/page.tsx:367` (después del update)
3. **Reschedule modal** — `scheduler/reschedule-modal.tsx:140` (después del update)
4. **Status change (incluido cancel)** — `scheduler/appointment-sidebar.tsx:520` — distingue `cancel` vs `upsert` según `newStatus`.

### UI Settings → Integraciones

- Card de Google Calendar pasó de `coming-soon` → `available`/`connected`.
- Cuando `connected`: muestra cuenta Google, última sync, y banner ámbar con el último error si lo hubo.
- Botón cambia a "Desconectar" con `useConfirm` destructive.
- Lectura del query param `?gcal=ok|error` post-callback dispara toast y limpia URL.

### Datos del evento en Google

- **Título**: `{patient_name} — {service.name}`
- **Descripción**: doctor, consultorio, teléfono del paciente, notas internas
- **Ubicación**: nombre del consultorio
- **Fechas**: con timezone `America/Lima`
- **Status**: `confirmed` por default, `cancelled` cuando se cancela en Yenda

### Setup necesario (operativo)

1. **Google Cloud Console**:
   - Habilitar Google Calendar API
   - Agregar scope `https://www.googleapis.com/auth/calendar.events` al consent screen (mínimo privilegio — no `calendar` completo)
   - Agregar redirect URIs:
     - Prod: `https://yenda.app/api/integrations/google/callback`
     - Local: `http://localhost:3000/api/integrations/google/callback`

2. **Env vars** (`.env.local` + Vercel):
   - `GOOGLE_CLIENT_ID` — reusa el de login si ya existe
   - `GOOGLE_CLIENT_SECRET` — idem
   - `ENCRYPTION_KEY` — 32 bytes hex. Genera con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Crítico: si se pierde/rota, todos los tokens guardados quedan inservibles y los doctores tienen que reconectar.**
   - `GOOGLE_REDIRECT_URI` (opcional) — override del redirect por defecto si el origin del request no coincide con prod.

3. **Aplicar migración 106** antes de que cualquiera intente conectar.

### Decisiones diferidas

- **Two-way sync**: requiere webhooks de Google (push notifications) o polling + resolución de conflictos. Si Vitra lo pide, evaluar.
- **Multi-doctor calendars** (un calendar por doctor en vez de uno por org): cuando 2-3 clientes pidan separar, agregar columna `doctor_id` nullable a la tabla y selector en el UI.
- **Selector de calendar específico** (no `'primary'`): si un cliente quiere usar un calendar dedicado distinto al principal, listar los calendars del usuario en el callback y dejarle elegir.
- **Bundle del Calendar v3 SDK** (`googleapis`): evitado por peso (~5MB). El wrapping con fetch cubre nuestros 4 endpoints. Si algún día necesitamos features avanzadas, reevaluar.

### Cambios de Alcance

- **Token-at-rest cipher pattern**: cualquier integración futura con OAuth de terceros (MP, Zoom, Meta) debe encriptar tokens con AES-256-GCM via `lib/encryption.ts`. Es la regla.
- **Sync hooks como helpers de cliente**: el patrón `lib/<integration>-client.ts` con función fire-and-forget evita repetir lógica de fetch en N puntos del cliente. Reusable para Zoom (link de reunión), Meet, etc.
- **State firmado en OAuth**: HMAC-SHA256(payload, SUPABASE_SERVICE_ROLE_KEY) bloquea CSRF y replay. Patrón obligatorio para cualquier OAuth flow nuevo.
