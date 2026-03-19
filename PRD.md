# VibeForge — Product Requirements Document (PRD)

> **Última actualización:** 2026-03-19
> **Versión:** 0.2.1
> **Estado:** MVP en desarrollo activo

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
- **Doctor:** No puede interactuar con citas de otros doctores en el scheduler
- **Receptionist:** Redirigido a `/scheduler` como página principal
- **Admin/Owner:** Ve dashboard administrativo con KPIs globales de la org
- **Non-admin:** Ve mensaje "acceso denegado" en `/settings` y secciones admin

---

## 5. Planes y Suscripciones

### Plan Independiente (Starter) — Gratis
- 1 miembro, 1 doctor, 1 consultorio
- 150 pacientes, 100 citas/mes, 100MB storage
- Sin recepcionistas ni admins adicionales
- Reportes básicos, sin exportación, sin AI

### Plan Centro Médico (Professional) — S/49/mes
- 4 miembros, 2 doctores, 2 consultorios
- 1,000 pacientes, 500 citas/mes, 2GB storage
- 1 admin, 1 recepcionista
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
| `user_profiles` | Extensión: full_name, avatar_url, phone, whatsapp_phone, professional_title, is_founder |
| `organizations` | Tenant: name, slug, logo_url, organization_type, is_active, settings (JSONB: restrict_doctor_patients, etc.) |
| `organization_members` | Relación user↔org con role (owner/admin/receptionist/doctor) |
| `organization_invitations` | Invitaciones pendientes con token, email, role |

### Gestión Clínica
| Tabla | Propósito |
|-------|----------|
| `offices` | Consultorios/salas: name, code, phone, address, display_order |
| `doctors` | Doctores: name, specialty, cmp, user_id (link a cuenta), default_meeting_url, is_active |
| `doctor_services` | Relación N:N doctor↔servicio |
| `doctor_schedules` | Horarios semanales por doctor (día, hora inicio/fin) |
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
5. Detección de conflictos de horario
6. Bloques de tiempo y break times (almuerzos recurrentes)
7. Doctor solo ve sus propias citas
8. Historial de citas pasadas en `/scheduler/history`

### 7.4 Gestión de Pacientes
1. Lista con búsqueda por nombre, DNI, teléfono
2. Filtros: estado, tags, servicio, origen, rango de fechas, deuda
3. Drawer lateral con perfil detallado
4. Historial de citas y pagos por paciente
5. Sistema de tags/etiquetas

### 7.5 Reportes
1. Cuatro tipos de reporte con selector de rango de fechas y presets (hoy, 7d, 30d, 90d, este mes):
   - **Financiero:** Ingresos, cobranza, balance pendiente
   - **Marketing:** Fuentes de adquisición, tendencias de nuevos pacientes
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

### Pendiente / Por Mejorar
- [ ] Impresión de recibo/comprobante (F3) — Requiere evaluar formato legal Perú (SUNAT)
- [ ] Confirmación de cita desde email 1-click (F4) — Token seguro temporal
- [ ] WhatsApp Business API (F6 Fase 2) — Envío automático vía Twilio/360dialog
- [x] Booking online / agenda pública (F7)
- [x] Recordatorios automáticos por cron (F8)
- [x] Notas clínicas por cita — formato SOAP (F9)
- [x] Historia clínica completa (F9-EXT) — Plantillas, tratamientos, recetas, adjuntos, seguimientos, diagnósticos, versionado
- [ ] Notificaciones in-app en tiempo real (F11)
- [ ] Consentimiento informado digital (F12) — Requisito legal Perú
- [ ] Módulo de inventario básico (F13)
- [ ] Portal del paciente (F14)
- [ ] Reportes con IA generativa (F15)
- [ ] App móvil o PWA
- [ ] Facturación electrónica
- [ ] Add-ons de plan (UI para comprar consultorios/miembros extra)
- [ ] Tests automatizados (unit, integration, e2e)
- [ ] Optimización de performance y caching

---

## 13. Hooks y Componentes Clave

### Custom Hooks
| Hook | Propósito |
|------|----------|
| `useUser` | Usuario autenticado de Supabase (subscribe a cambios de auth) |
| `useUserProfile` | Perfil extendido (full_name, role, avatar) |
| `useOrgRole` | Rol actual en la org + helpers: `isAdmin`, `isOwner`, `isDoctor`, `hasMinRole()` |
| `usePlan` | Plan + suscripción + uso actual. Helpers: `isNearLimit()`, `isAtLimit()`, `getLimit()` |
| `useBilling` | Info de billing de Mercado Pago + `addAddon()` para comprar extras |
| `useCurrentDoctor` | Registro de doctor vinculado al usuario actual (solo para rol doctor) |

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

### Componentes de Arquitectura
| Componente | Propósito |
|-----------|----------|
| `OrganizationProvider` | Context: org actual, rol, isOrgAdmin. Auto-healing si membership falta |
| `LanguageProvider` | Context: idioma (es/en), función `t()` con 100+ keys de traducción |
| `ThemeProvider` | Context: tema dark/light con persistencia en localStorage |
| `RoleGate` | Renderizado condicional por rol: `<RoleGate minRole="admin">...</RoleGate>` |
| `PlanLimitWarner` | Toast automático al 80% y 100% de uso de recursos del plan |
| `AiAssistantPanel` | Panel flotante de chat AI con queries SELECT sobre la DB |
| `Sidebar` | Navegación lateral colapsable con items por rol |
| `Topbar` | Header con email, avatar e iniciales del usuario |

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
| `lib/scheduler-config.ts` | Config del scheduler (localStorage): horarios, intervalos |
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
