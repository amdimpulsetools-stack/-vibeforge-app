# VibeForge — Product Requirements Document (PRD)

> **Última actualización:** 2026-04-15
> **Versión:** 0.8.1
> **Estado:** MVP — desplegado en Vercel (producción) + Landing/Blog/SEO + Hardening UX Trial/Auth

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
| `patients` | Directorio: dni, document_type (DNI/CE/Pasaporte), first_name, last_name, phone, email, birth_date, departamento, distrito, is_foreigner, nationality, status, origin, referral_source, custom_field_1, custom_field_2, notes |
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
- [ ] Especialidades: select editable en Settings (solo Owner)
- [ ] Especialidades: tabla `doctor_specialties` + asignación en admin de doctores
- [ ] Especialidades: tabs condicionales en historia clínica según especialidad del doctor
- [ ] Especialidades: primer módulo vertical (Endocrinología Pediátrica o Fertilidad)
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
| **Fase 2** | Tabla `doctor_specialties`. Primer módulo vertical (según primer cliente). Tabs condicionales en historia clínica. Filtro por rol de doctor. | Pendiente |
| **Fase 3** | Módulos premium como add-on en billing. UI de activación/desactivación de módulos en Settings. Campos custom por especialidad. | Pendiente |
| **Fase 4** | Marketplace de módulos. Módulos creados por terceros. API para extensiones. | Futuro |

### Primeros módulos verticales candidatos

| Especialidad | Módulo | Funcionalidades clave |
|---|---|---|
| Endocrinología Pediátrica | Curvas de crecimiento | Percentiles OMS, gráfica talla/peso vs edad, alertas de desviación |
| Medicina Reproductiva | Tracking de fertilidad | Ciclos de estimulación, conteo de óvulos, etapas FIV, criopreservación |
| Odontología | Odontograma | Mapa dental visual, plan de tratamiento por pieza, historial por diente |
| Dermatología | Mapa corporal | Fotos comparativas, seguimiento de lesiones, antes/después |
| Nutrición | Plan nutricional | IMC, macros, plan alimenticio, seguimiento de peso con gráfica |
| Oftalmología | Examen visual | Agudeza visual, presión intraocular, fondo de ojo, receta de lentes |
