# VibeForge — Historia Clínica Digital + Seguimientos v1.2

> **Última actualización:** Marzo 2026  
> **Versión:** 1.2  
> **Estado:** Documento de referencia para Claude Code  
> **Preparado para:** Oscar — AMD Impulse  
> **Features:** F9 (Notas Clínicas SOAP) + Tratamientos Recurrentes + Vista de Seguimientos  
> **Normativa:** NTS 139-MINSA/2018 | Ley 30024 (RENHICE) | Ley 29733 (Datos Personales)

---

# 1. Análisis Estratégico

## 1.1 Por qué ir más allá del SOAP básico

La propuesta original de F9 contemplaba una tabla clinical_notes con formato SOAP. Esto resuelve el problema inmediato pero deja fuera elementos críticos que los doctores necesitan y que la normativa peruana exige. Ampliar el alcance ahora evita refactorizaciones costosas.

## 1.2 Deficiencias de los sistemas clínicos actuales en Perú

| **Problema**                   | **Impacto**                         | **Solución**                                  |
| Notas sueltas sin estructura   | Imposible buscar/comparar           | SOAP estructurado con campos individuales     |
| Sin antecedentes médicos       | Doctor pregunta lo mismo cada vez   | Ficha persistente por paciente                |
| Sin trazabilidad de autor      | Riesgo legal en auditorías          | Registro automático + versionado              |
| Signos vitales dispersos       | No hay tendencias                   | Campos estandarizados con gráficas            |
| Sin CIE-10                     | No se puede reportar a RENHICE      | Catálogo con búsqueda integrada               |
| Sin seguimiento de recurrencia | Pacientes se pierden entre sesiones | Planes de tratamiento + vista de seguimientos |
| Notas no exportables           | No cumplen derecho del paciente     | Exportación PDF de HC completa                |

## 1.3 Valor agregado diferenciador

-   Timeline visual del paciente con todas las citas, notas y archivos

-   Plantillas SOAP configurables por especialidad (escalable sin intervención del dev)

-   Planes de tratamiento con seguimiento de sesiones y progreso

-   Vista de Seguimientos para la recepcionista: quién necesita ser contactado para su próxima sesión

-   Notificaciones automáticas de recordatorio por email y WhatsApp clipboard

-   Comparador de signos vitales entre visitas (gráficas de tendencia)

-   Archivos clínicos adjuntos (fotos antes/después, labs, imágenes)

-   Exportación PDF de historia clínica (obligatorio por NTS 139)

# 2. Marco Normativo Peruano Aplicable

> **IMPORTANTE: Cumplimiento legal no es opcional**
> La NTS 139-MINSA/2018 aplica a TODAS las IPRESS públicas, privadas y mixtas.
> Tus clientes son IPRESS privadas y están sujetas. SUSALUD puede auditar.

## 2.1 NTS N° 139-MINSA/2018/DGAIN — Gestión de Historia Clínica

Norma central. Toda atención debe registrarse con fecha, hora, nombre completo, firma y N° colegiatura.

| **Requisito NTS 139**               | **Impacto en VibeForge**                  | **Implementación**            |
| Registro obligatorio con fecha/hora | created_at automático en clinical_notes | Timestamp no editable         |
| Nombre + N° colegiatura             | JOIN con doctors (campo CMP existente)    | Mostrar en UI y PDF           |
| Datos generales del paciente        | Tabla patients ya los tiene               | Verificar completitud         |
| Antecedentes personales             | NUEVA tabla patient_medical_history     | Tab en patient-drawer         |
| Consentimiento informado            | Registro digital con timestamp            | Campo en clinical_notes      |
| Epicrisis en 5 días hábiles         | Exportación PDF                           | Endpoint API                  |
| Custodia mínima 20 años             | No hard-delete nunca                      | Soft delete en cadena clínica |

## 2.2 Ley 30024 — RENHICE

-   DNI como identificador único. Campo dni en patients debe ser obligatorio para peruanos.

-   RENHICE busca interoperabilidad HL7 FHIR. CIE-10 y campos estructurados facilitan futura integración.

-   Información clínica confidencial: solo médico tratante y paciente.

## 2.3 Ley 29733 — Protección de Datos Personales (+ DS 016-2024-JUS)

1. **Consentimiento explícito:** Formato de tratamiento de datos personales (NTS 139 Anexo 11).

2. **Medidas de seguridad:** Política documentada, controles de acceso. RLS cubre parte.

3. **Derechos ARCO:** Paciente puede solicitar exportar todos sus datos clínicos.

4. **Flujo transfronterizo:** Supabase/AWS. Documentar cumplimiento SOC2.

## 2.4 Consentimiento Informado (Ley 29414 + DS 027-2015-SA)

Obligatorio para procedimientos riesgosos. Debe constar por escrito y ser parte de la HC.

-   Registro de otorgamiento con fecha/hora y referencia al procedimiento

-   Campo para indicar formato físico firmado (adjuntable como archivo)

-   Template configurable por organización

# 3. Modelo de Permisos y Visibilidad Clínica

> **DECISIÓN ARQUITECTÓNICA**
> Modelo de acceso por capas: Doctor = lectura/escritura de sus pacientes.
> Admin/Owner = lectura de toda la org (acto médico prohibido).
> Recepcionista = sin acceso a datos clínicos, pero SÍ a vista de Seguimientos.

## 3.1 Matriz de permisos por rol

|                                   | **Acción**                        | **Doctor**               | **Admin/Owner**      | **Recepcionista**           |
| Crear/editar notas clínicas       | Sus citas (si no locked) | NO                   | NO                          |
| Firmar (lock) notas               | Sus propias notas        | NO                   | NO                          |
| Ver notas clínicas                | Sus pacientes\*          | Todas (solo lectura) | NO                          |
| Editar antecedentes médicos       | Sí                       | NO                   | NO                          |
| Ver antecedentes                  | Sus pacientes\*          | Todos (solo lectura) | NO                          |
| Subir/ver archivos clínicos       | Sí                       | Solo lectura         | NO                          |
| Exportar PDF de HC                | Sus pacientes\*          | Todos                | NO                          |
| Gestionar plantillas SOAP         | Crear propias            | CRUD completo        | NO                          |
| Crear planes de tratamiento       | Sí (desde nota clínica)  | NO                   | NO                          |
| Ver planes de tratamiento         | Sus pacientes\*          | Todos (solo lectura) | Ver lista en Seguimientos   |
| Activar/desactivar notificaciones | Sí                       | Sí                   | Sí (toggle en Seguimientos) |
| Vista de Seguimientos             | NO (no la necesita)      | Sí                   | Sí (vista principal)        |
| Agendar cita desde Seguimientos   | NO                       | Sí                   | Sí                          |
| Marcar paciente como contactado   | NO                       | Sí                   | Sí                          |

*\* Sujeto a restrict_doctor_patients en org settings.*

## 3.2 Implementación técnica

### 3.2.1 RLS Policies

> **RLS para clinical_notes**
> SELECT: doctor → org_id match AND (doctor_id=current OR NOT restricted). admin/owner → org_id match. receptionist → FALSE.
> INSERT: org_id match AND user is doctor.
> UPDATE: org_id match AND doctor_id=author AND is_locked=false.

> **RLS para treatment_plans**
> SELECT: doctor → sus pacientes. admin/owner → toda la org. receptionist → toda la org (necesita ver para Seguimientos).
> INSERT: solo doctor.
> UPDATE: doctor (autor del plan) + admin/owner (solo toggle notify_patient) + receptionist (solo last_contacted_at y notify_patient).

### 3.2.2 Frontend: ReadOnlyBanner

Cuando admin accede a datos clínicos, mostrar banner: '🔒 Vista de solo lectura — Solo el médico tratante puede crear y editar notas clínicas'. Estilo: bg-blue-50 dark:bg-blue-950/20, border-l-4 border-blue-400.

# 4. Sistema de Plantillas SOAP Escalable

## 4.1 Tres niveles de escalabilidad

### Nivel 1 — Seeds iniciales

4 plantillas creadas automáticamente con cada org nueva (seed_clinical_templates RPC):

|                  | **Template**     | **Especialidad** | **Placeholder S**                                                      | **Placeholder O**                                                   |
| Consulta General | general          | Motivo de consulta, síntomas, duración, factores agravantes/atenuantes | Examen físico: estado general, piel, cabeza, cuello, tórax, abdomen |
| Dermatológica    | dermatología     | Lesión: ubicación, evolución, síntomas                                 | Tipo, tamaño, color, bordes, distribución. Fototipo                 |
| Fertilidad       | fertilidad       | Día del ciclo, medicación, efectos secundarios                         | Eco TV: útero, endometrio (mm), ovarios                             |
| Estética         | estética         | Zona, expectativas, procedimientos previos                             | Estado actual, plan, producto, unidades/ml                          |

### Nivel 2 — Editor de plantillas por organización (Fase 1)

CRUD en /admin/clinical-templates. Especialidad como texto libre (no catálogo cerrado). Campos personalizados dinámicos (custom_fields: [{label, type, options}]).

-   Nombre de la plantilla + Especialidad (texto libre con autocompletado)

-   Placeholders para cada campo SOAP

-   Toggle signos vitales + Campos custom dinámicos (text/number/select/checkbox)

-   Vista previa del formulario resultante

### Nivel 3 — Catálogo comunitario (futuro)

Marketplace de plantillas anonimizadas entre clientes. Post-MVP.

# 5. Tratamientos Recurrentes y Seguimientos

> **CONCEPTO CENTRAL**
> La recurrencia tiene dos niveles: el servicio define el intervalo sugerido por defecto,
> pero el doctor personaliza el plan real para cada paciente desde la nota clínica.
> La recepcionista NO agenda automáticamente — gestiona seguimientos y contacta al paciente.

## 5.1 Cambios en la tabla services (existente)

Agregar 3 campos opcionales para configurar recurrencia sugerida por defecto:

| **Campo nuevo**            | **Tipo**              | **Descripción**                                              |
| is_recurring              | boolean DEFAULT false | Indica si el servicio es típicamente recurrente              |
| suggested_interval_days  | integer nullable      | Cada cuántos días se sugiere repetir (ej: 14, 30, 180)       |
| suggested_total_sessions | integer nullable      | Número total sugerido. NULL = indefinido (control periódico) |

En el formulario de servicios (admin/services), agregar sección colapsable 'Recurrencia' con toggle + campos.

## 5.2 Nueva tabla: treatment_plans

Plan de tratamiento personalizado por paciente. Creado por el doctor desde la nota clínica.

| **Columna**               | **Tipo**                            | **Descripción**                                            |
| id                        | uuid PK default gen_random_uuid() |                                                            |
| organization_id          | uuid FK NOT NULL                    | Tenant (RLS)                                               |
| patient_id               | uuid FK NOT NULL                    | Paciente                                                   |
| doctor_id                | uuid FK NOT NULL                    | Doctor que creó el plan                                    |
| service_id               | uuid FK NOT NULL                    | Servicio base                                              |
| clinical_note_id        | uuid FK nullable                    | Nota clínica donde se originó                              |
| name                      | text NOT NULL                       | 'Protocolo Láser Facial', 'Monitoreo Ciclo FIV'            |
| interval_days            | integer NOT NULL                    | Cada cuántos días (puede diferir del default del servicio) |
| total_sessions           | integer nullable                    | Total sesiones. NULL = indefinido                          |
| completed_sessions       | integer DEFAULT 0                   | Auto-incrementado al completar cita vinculada              |
| status                    | text DEFAULT 'active'               | active, completed, paused, cancelled                       |
| notify_patient           | boolean DEFAULT true                | Enviar recordatorio por email                              |
| notify_before_days      | integer DEFAULT 3                   | Días de anticipación para recordatorio                     |
| next_suggested_date     | date nullable                       | Calculado: última cita completada + interval_days         |
| last_contacted_at       | timestamptz nullable                | Cuando recepcionista marcó 'contactado'                    |
| notes                     | text                                | Notas del doctor sobre el plan                             |
| started_at               | timestamptz DEFAULT now()           | Inicio del plan                                            |
| completed_at             | timestamptz nullable                | Cuando status cambia a completed                           |
| created_at / updated_at | timestamptz                         | Timestamps automáticos                                     |

## 5.3 Cambio en tabla appointments (existente)

Agregar un campo para vincular citas a planes de tratamiento:

| **Campo nuevo**     | **Tipo**                                     | **Descripción**                                                      |
| treatment_plan_id | uuid FK nullable references treatment_plans | Si la cita pertenece a un plan recurrente. NULL = cita independiente |

Cuando una cita con treatment_plan_id se marca como completada, un trigger o lógica de API incrementa completed_sessions en el plan y recalcula next_suggested_date.

## 5.4 Flujo completo de tratamientos recurrentes

> **Flujo paso a paso**
> 1. DOCTOR firma nota clínica → Botón 'Crear Plan de Tratamiento'
> 2. Modal pre-llena con servicio de la cita. Doctor define: nombre, intervalo, sesiones, notificar?
> 3. Se crea treatment_plan. La cita actual se vincula como sesión 1.
> 4. Sistema calcula next_suggested_date = fecha cita + interval_days.
> 5. Si notify_patient=true: N días antes de next_suggested_date, se envía email de recordatorio.
> 6. RECEPCIONISTA abre vista Seguimientos cada mañana. Ve pacientes pendientes de contactar.
> 7. Llama/WhatsApp al paciente, acuerdan fecha.
> 8. Click 'Agendar cita' → modal con paciente+servicio+plan pre-seleccionados, SIN fecha pre-llenada.
> 9. Recepcionista selecciona fecha acordada. Cita se crea con treatment_plan_id.
> 10. Al completar cita: completed_sessions++ y next_suggested_date se recalcula.
> 11. Si completed_sessions >= total_sessions: status cambia a 'completed' automáticamente.
> 12. Ciclo se repite hasta completar el plan.

## 5.5 Vista de Seguimientos (/scheduler/follow-ups)

Nuevo tab en sección Agenda del sidebar, junto a Calendario e Historial. Visible para recepcionista y admin/owner. El doctor NO la necesita (su flujo es desde las notas clínicas).

### 5.5.1 Layout de la vista

> **Estructura de /scheduler/follow-ups**
> HEADER: 'Seguimientos' + Badge con total de pendientes + Filtros (doctor, servicio, estado)
> SECCIÓN ROJA — Vencidos (next_suggested_date < hoy, sin cita agendada):
> Card por paciente: Nombre | Servicio | Sesión 3/6 | 'Hace 3 días' | Teléfono + 📋 | [Agendar] [Contactado]
> SECCIÓN AMARILLA — Próximos 7 días:
> Card por paciente: Nombre | Servicio | Sesión 4/6 | 'En 4 días' | Teléfono + 📋 | [Agendar] [Contactado]
> SECCIÓN VERDE — Próximos 8-30 días:
> Card por paciente: Nombre | Servicio | Sesión 2/6 | 'En 18 días' | Teléfono + 📋 | [Agendar] [Contactado]
> Cada card tiene:
> - Botón teléfono: copia número para WhatsApp
> - Botón WhatsApp: genera mensaje de recordatorio pre-formateado (usa sistema clipboard F6)
> - Botón 'Agendar': abre modal crear cita con paciente+servicio+plan pre-seleccionados, fecha VACIA
> - Botón 'Contactado': marca last_contacted_at=now(), card desaparece por 3 días
> - Toggle notificaciones: activa/desactiva notify_patient inline

### 5.5.2 Query principal

> **RPC: get_follow_up_patients**
> SELECT tp.*, p.first_name, p.last_name, p.phone, s.name as service_name,
> d.name as doctor_name,
> tp.next_suggested_date - CURRENT_DATE as days_until,
> (SELECT COUNT(*) FROM appointments a WHERE a.treatment_plan_id = tp.id AND a.date > CURRENT_DATE) as future_appointments
> FROM treatment_plans tp
> JOIN patients p ON p.id = tp.patient_id
> JOIN services s ON s.id = tp.service_id
> JOIN doctors d ON d.id = tp.doctor_id
> WHERE tp.organization_id = p_org_id
> AND tp.status = 'active'
> AND tp.next_suggested_date IS NOT NULL
> AND tp.next_suggested_date <= CURRENT_DATE + INTERVAL '30 days'
> AND (SELECT COUNT(*) FROM appointments a WHERE a.treatment_plan_id = tp.id AND a.date > CURRENT_DATE) = 0
> AND (tp.last_contacted_at IS NULL OR tp.last_contacted_at < NOW() - INTERVAL '3 days')
> ORDER BY tp.next_suggested_date ASC

### 5.5.3 Notificaciones automáticas por email

Se integra con tu sistema de email templates existente. Nuevo template 'treatment_reminder':

| **Variable**        | **Ejemplo**         | **Origen**                               |
| {{NOMBRE}}          | María García        | patients.first_name + last_name        |
| {{SERVICIO}}        | Monitoreo Folicular | services.name                            |
| {{SESION_ACTUAL}}  | 4                   | treatment_plans.completed_sessions + 1 |
| {{TOTAL_SESIONES}} | 6                   | treatment_plans.total_sessions         |
| {{CLINICA}}         | Clínica Dermosalud  | global_variables.clinic_name           |
| {{TELEFONO}}        | 01-234-5678         | global_variables.clinic_phone          |

Trigger: Cron job diario (Feature F8). Busca planes con notify_patient=true AND next_suggested_date - notify_before_days <= today AND no hay cita futura agendada. Envía UNA vez (no diariamente). Marcar con campo email_sent_at en treatment_plans.

### 5.5.4 Integración con WhatsApp clipboard (F6)

En la vista de Seguimientos, botón WhatsApp genera mensaje pre-formateado:

> **Template WhatsApp para seguimiento**
> Hola {{NOMBRE}}, te escribimos de {{CLINICA}}.
> Te recordamos que tu próxima sesión de {{SERVICIO}} está próxima (sesión {{SESION}} de {{TOTAL}}).
> Comunícate con nosotros al {{TELEFONO}} para agendar tu cita.
> ¡Te esperamos!

La recepcionista copia y pega en WhatsApp. Mismo patrón que F6 actual.

# 6. Modelo de Datos Completo

Resumen de todas las tablas nuevas y campos modificados:

| **Tabla**                 | **Estado**      | **Relación clave**                                                   |
| patient_medical_history | NUEVA           | 1:1 con patients                                                     |
| clinical_notes           | NUEVA           | 1:1 con appointments, FK doctor_id                                  |
| clinical_note_templates | NUEVA           | N:1 con organizations                                                |
| clinical_note_versions  | NUEVA           | N:1 con clinical_notes                                              |
| treatment_plans          | NUEVA           | N:1 con patients, services, doctors                                  |
| clinical_attachments     | NUEVA (Fase 2)  | N:1 con clinical_notes                                              |
| services (modificada)     | 3 campos nuevos | is_recurring, suggested_interval_days, suggested_total_sessions |
| appointments (modificada) | 1 campo nuevo   | treatment_plan_id FK nullable                                      |

Las definiciones detalladas de columnas de cada tabla están en las secciones 4.2 (templates), 5.1 (services), 5.2 (treatment_plans) y 5.3 (appointments). Las tablas patient_medical_history, clinical_notes y clinical_note_versions mantienen la misma estructura definida en v1.1.

# 7. Diseño de UI/UX

## 7.1 Principios de diseño

1. **Escritura rápida:** Tab entre campos SOAP, autocompletado CIE-10, atajos de teclado.

2. **Contexto visible:** Alergias (badge rojo), medicamentos, última nota, edad. Sidebar colapsable.

3. **Progressive disclosure:** SOAP visible, signos vitales/prescripciones/custom fields colapsables.

4. **Auto-save:** Debounce 30s, indicador visual verde/amarillo. Nunca perder trabajo.

5. **Accesibilidad:** Labels visibles, contraste dark mode, ARIA roles, mínimo 14px.

## 7.2 Mapa de componentes nuevos

| **Ubicación**                           | **Componente**                          | **Visible para**                |
| Patient Drawer > Tab HC              | PatientClinicalHistoryTab               | Doctor + Admin (admin: lectura) |
| Scheduler > Sidebar cita             | Botón Nota Clínica → ClinicalNoteEditor | Doctor (sus citas)              |
| Doctor Dashboard                        | PendingNotesWidget                      | Doctor                          |
| Admin > Plantillas Clínicas          | ClinicalTemplatesAdmin                  | Admin + Doctor                  |
| Patient Drawer > Tab HC > Sub-tab | PatientTreatmentPlansTab                | Doctor + Admin                  |
| Nota Clínica > Post-firma            | CreateTreatmentPlanModal                | Doctor                          |
| Scheduler > Tab Seguimientos         | FollowUpsDashboard                      | Recepcionista + Admin           |
| Admin > Servicios (edit)             | RecurrenceSection (colapsable)          | Admin                           |

## 7.3 ClinicalNoteEditor (actualizado)

> **Layout completo**
> HEADER: Nombre | Edad | DNI | Alergias (badges) | ReadOnlyBanner si admin | X
> LEFT SIDEBAR (~300px): Última nota | Medicamentos | Antecedentes | Plan de tratamiento activo (si existe)
> MAIN: [Selector plantilla] | S | O | Signos Vitales | A + CIE-10 | P | Campos Custom | Prescripciones | Consentimiento
> FOOTER: Auto-save | Guardar borrador | Firmar y cerrar
> POST-FIRMA: Modal '??Crear plan de tratamiento?' con pre-llenado del servicio de la cita

## 7.4 Vista de Seguimientos (/scheduler/follow-ups)

Ver sección 5.5 para layout detallado. Punto clave: la recepcionista ve esta vista como parte de su flujo diario. Se recomienda agregar badge con contador de pendientes en el sidebar item 'Seguimientos'.

# 8. Plan de Implementación por Fases

> **Estructura de fases (actualizada v1.2)**
> Fase 1: MVP Clínico (SOAP + antecedentes + plantillas + permisos)
> Fase 2: Tratamientos recurrentes + Vista de seguimientos
> Fase 3: Enriquecimiento (CIE-10, adjuntos, gráficas, exportación PDF)
> Fase 4: Diferenciación (búsqueda clínica, AI, catálogo comunitario)

## 8.1 Fase 1 — MVP Clínico

**Objetivo: documentación SOAP + antecedentes + plantillas + permisos por capas.**

1. Migración: clinical_notes, patient_medical_history, clinical_note_templates, clinical_note_versions + RLS por capas

2. Seed de 4 plantillas SOAP por defecto (seed_clinical_templates RPC)

3. Validaciones Zod + tipos TypeScript

4. API Routes: clinical-notes (CRUD + lock), patients/[id]/medical-history, clinical-templates (CRUD)

5. ClinicalNoteEditor con auto-save, signos vitales, prescripciones, campos custom, readOnly

6. ReadOnlyBanner para admin

7. PatientClinicalHistoryTab en patient-drawer

8. /admin/clinical-templates con CRUD + vista previa

9. Botón Nota Clínica en scheduler sidebar

10. PendingNotesWidget en doctor-dashboard

## 8.2 Fase 2 — Tratamientos Recurrentes + Seguimientos

**Objetivo: planes de tratamiento + vista de seguimientos + notificaciones.**

1. Migración: treatment_plans + campos en services (is_recurring, suggested_interval/sessions) + campo treatment_plan_id en appointments

2. RLS para treatment_plans (doctor: sus pacientes, admin/receptionist: toda la org para lectura)

3. Validaciones Zod + tipos para TreatmentPlan

4. API Routes: treatment-plans (CRUD), treatment-plans/[id]/contact (marcar contactado)

5. Sección Recurrencia en formulario de servicios (admin)

6. CreateTreatmentPlanModal (post-firma de nota clínica)

7. PatientTreatmentPlansTab en patient-drawer (sub-tab en HC)

8. Vista /scheduler/follow-ups con secciones rojo/amarillo/verde

9. RPC get_follow_up_patients

10. Trigger/lógica: al completar cita con treatment_plan_id → incrementar completed_sessions + recalcular next_suggested_date

11. Sidebar: agregar item 'Seguimientos' con badge en sección Agenda

12. Integración WhatsApp clipboard para recordatorio de seguimiento

13. Template email 'treatment_reminder' en seed de email templates

## 8.3 Fase 3 — Enriquecimiento

1. Búsqueda CIE-10 con Combobox

2. clinical_attachments + Storage bucket + Upload en nota

3. Gráficas de tendencia signos vitales (Recharts)

4. Resumen de última nota al crear nueva

5. Exportación PDF de historia clínica

6. Cron job para notificaciones automáticas (F8) — emails de recordatorio de tratamiento

## 8.4 Fase 4 — Diferenciación

1. Búsqueda clínica global

2. Consentimiento informado digital (F12)

3. Comparador visual fotos antes/después

4. AI: resumen automático de nota, sugerencia CIE-10

5. Catálogo comunitario de plantillas

# 9. Instrucciones para Claude Code

> **ANTES DE EMPEZAR**
> 1. PRD actualizado en el repo
> 2. git commit de trabajo actual
> 3. Ejecutar cada prompt por separado
> 4. npm run build entre cada prompt

## 9.1 Prompt 1: Migración — Historia Clínica (Fase 1)

> **Copiar completo como prompt**
> Lee el PRD.md. Crea migración SQL con tablas:
> 1. patient_medical_history: id uuid PK, organization_id uuid FK NOT NULL, patient_id uuid FK NOT NULL UNIQUE, allergies jsonb DEFAULT '[]', chronic_conditions jsonb DEFAULT '[]', surgical_history jsonb DEFAULT '[]', family_history jsonb DEFAULT '[]', medications jsonb DEFAULT '[]', blood_type text, lifestyle_notes text, reproductive_history text, additional_notes text, updated_by uuid FK, created_at/updated_at timestamptz.
> 2. clinical_note_templates: id uuid PK, organization_id uuid FK NOT NULL, name text NOT NULL, specialty text, subjective_template text, objective_template text, assessment_template text, plan_template text, default_vital_signs boolean DEFAULT true, custom_fields jsonb DEFAULT '[]' (array {label,type,options}), is_default boolean DEFAULT false, display_order int DEFAULT 0, is_active boolean DEFAULT true, created_by uuid FK, created_at/updated_at.
> 3. clinical_notes: id uuid PK, organization_id uuid FK NOT NULL, appointment_id uuid FK NOT NULL UNIQUE, patient_id uuid FK NOT NULL, doctor_id uuid FK NOT NULL, subjective text, objective text, assessment text, plan text, diagnosis_codes jsonb DEFAULT '[]', vital_signs jsonb, prescriptions jsonb DEFAULT '[]', custom_field_values jsonb DEFAULT '{}', is_locked boolean DEFAULT false, locked_at timestamptz, locked_by uuid FK, template_id uuid FK, consent_registered boolean DEFAULT false, consent_notes text, created_at/updated_at.
> 4. clinical_note_versions: id uuid PK, clinical_note_id uuid FK NOT NULL CASCADE, version_number int NOT NULL, snapshot jsonb NOT NULL, changed_by uuid FK NOT NULL, change_reason text, created_at.
> RLS POR CAPAS: clinical_notes SELECT: doctor=org match AND (doctor_id=current OR NOT restricted), admin/owner=org match, receptionist=FALSE. INSERT: doctor only. UPDATE: doctor author AND not locked. Misma lógica para patient_medical_history. clinical_note_templates: all roles except receptionist can SELECT, admin/owner/doctor can INSERT/UPDATE.
> Índices en: clinical_notes(appointment_id, patient_id, doctor_id, organization_id), patient_medical_history(patient_id), clinical_note_versions(clinical_note_id), clinical_note_templates(organization_id).
> Trigger updated_at en patient_medical_history, clinical_notes, clinical_note_templates.
> RPC seed_clinical_templates(p_org_id uuid): insertar 4 templates (General, Dermatológica, Fertilidad, Estética) con placeholders descriptivos. Llamar desde handle_new_user() después de seed_email_templates.
> Seguir convenciones de migraciones existentes.

## 9.2 Prompt 2: Tipos y Validaciones

> **Copiar completo**
> Lee PRD.md. Crear:
> 1. types/clinical.ts: ClinicalNote, PatientMedicalHistory, ClinicalNoteTemplate, ClinicalNoteVersion, VitalSigns, Prescription, DiagnosisCode, Allergy, ChronicCondition, SurgicalRecord, FamilyHistoryRecord, MedicationRecord, CustomField ({label,type,options}), CustomFieldValues (Record).
> 2. lib/validations/clinical.ts: clinicalNoteSchema, patientMedicalHistorySchema, clinicalNoteTemplateSchema, lockNoteSchema. Usar z.infer. Seguir patrón existente.

## 9.3 Prompt 3: API Routes — Historia Clínica

> **Copiar completo**
> Lee PRD.md. APIs con parseBody, generalLimiter, Zod:
> 1. /api/clinical-notes: POST (crear + version 1), GET (por patient_id, JOIN doctor+appointment+service)
> 2. /api/clinical-notes/[id]: PATCH (solo si !locked AND author, guardar snapshot antes), GET
> 3. /api/clinical-notes/[id]/lock: POST (set locked, solo author, irreversible)
> 4. /api/patients/[id]/medical-history: GET (defaults si no existe), PUT (upsert, solo doctor)
> 5. /api/clinical-templates: GET (listar org, filtro active), POST (crear)
> 6. /api/clinical-templates/[id]: PATCH, DELETE (soft: is_active=false, solo admin), GET
> generalLimiter 30 req/min en todas.

## 9.4 Prompt 4: ClinicalNoteEditor + ReadOnlyBanner

> **Copiar completo**
> Lee PRD.md. Crear:
> 1. components/clinical/read-only-banner.tsx: bg-blue-50 dark:bg-blue-950/20, border-l-4 blue-400, icono Lock, texto: "Vista de solo lectura..."
> 2. components/clinical/clinical-note-editor.tsx: Sheet side="right" ~80vw.
> Props: appointmentId, patientId, patientName, patientAge, doctorId, onClose, onSaved, readOnly.
> HEADER: nombre, edad, alergias badges, ReadOnlyBanner si readOnly. LEFT SIDEBAR: última nota, medicamentos, crónicos.
> BODY: Selector plantilla (dropdown). S/O textareas con placeholders dinámicos. Signos Vitales colapsable (grid 2 cols: peso, talla, IMC auto, PA sist/diast, FC, temp, FR, SpO2). A textarea + chips CIE-10. P textarea. Campos Custom dinámicos según template.custom_fields (text→input, number→input, select→Select shadcn, checkbox→Checkbox). Prescripciones tabla editable (+fila, X eliminar). Consentimiento checkbox+notas.
> FOOTER (oculto si readOnly): auto-save indicator | Guardar borrador | Firmar y cerrar (AlertDialog confirmación).
> Auto-save debounce 30s. IMC auto-calc. Si locked: todo disabled.
> POST-FIRMA: mostrar toast de éxito. Si el servicio de la cita tiene is_recurring=true, mostrar prompt: "Este servicio es recurrente. ??Deseas crear un plan de tratamiento?" con botón que abre CreateTreatmentPlanModal (implementar en Fase 2, por ahora solo el toast).
> React Hook Form + Zod + TanStack Query + Sonner.

## 9.5 Prompt 5: PatientClinicalHistoryTab

> **Copiar completo**
> Lee PRD.md. Crear components/patients/patient-clinical-history-tab.tsx e integrar en patient-drawer.
> Props: patientId, organizationId. readOnly = orgRole !== "doctor".
> Sub-tabs:
> 1. "Resumen": antecedentes (alergias badges rojos, crónicos, medicamentos, sangre). Botón Editar solo si !readOnly. Empty state con CTA.
> 2. "Notas": Timeline inversa. Cards: fecha|doctor+CMP|dx principal|plan truncado. Badge Firmada(green)/Borrador(yellow). Click abre editor con readOnly calculado.
> 3. "Signos Vitales": tabla últimas 10 notas. Placeholder para gráficas Fase 3.
> Tab con icono ClipboardList. Oculto para receptionist. TanStack Query.

## 9.6 Prompt 6: CRUD Plantillas Clínicas

> **Copiar completo**
> Lee PRD.md. Crear:
> 1. app/(dashboard)/admin/clinical-templates/page.tsx: RoleGate. Header + botón Nueva. TanStack Table: nombre, especialidad, campos custom (count), estado badge, orden, acciones.
> 2. components/admin/clinical-template-form-modal.tsx: Dialog/Sheet. RHF+Zod. Campos: nombre, especialidad (input con datalist autocompletado), 4 textareas SOAP, toggle signos vitales, display_order. Sección Campos Personalizados: +Agregar campo (label, tipo select, opciones chips si tipo=selección, X eliminar). Vista previa del formulario resultante.
> 3. Sidebar: agregar "Plantillas Clínicas" con FileTemplate icono debajo de Servicios.
> Seguir patrón admin/services y admin/lookups.

## 9.7 Prompt 7: Integración Scheduler + Dashboard

> **Copiar completo**
> Lee PRD.md. Integraciones:
> 1. SCHEDULER sidebar cita: botón "Nota Clínica" (FileText). Visible si: doctor + cita completada/confirmada + es su cita. Si nota existe: "Ver Nota" (locked) o "Editar Nota" (borrador). Admin: "Ver Nota" si existe (readOnly=true).
> 2. DOCTOR DASHBOARD: PendingNotesWidget. Card "Notas Pendientes" + badge. Query: appointments LEFT JOIN clinical_notes WHERE doctor=current AND status=completed AND cn.id IS NULL AND date >= now()-7d. Lista 5 max. Click abre editor. Empty: "Todas las notas al día".
> npm run build debe pasar.

## 9.8 Prompt 8: Migración — Tratamientos Recurrentes (Fase 2)

> **Copiar completo**
> Lee PRD.md. Nueva migración:
> 1. ALTER TABLE services ADD COLUMN is_recurring boolean DEFAULT false, ADD COLUMN suggested_interval_days integer, ADD COLUMN suggested_total_sessions integer;
> 2. CREATE TABLE treatment_plans: id uuid PK, organization_id uuid FK NOT NULL, patient_id uuid FK NOT NULL, doctor_id uuid FK NOT NULL, service_id uuid FK NOT NULL, clinical_note_id uuid FK nullable, name text NOT NULL, interval_days integer NOT NULL, total_sessions integer nullable, completed_sessions integer DEFAULT 0, status text DEFAULT 'active' CHECK (status IN ('active','completed','paused','cancelled')), notify_patient boolean DEFAULT true, notify_before_days integer DEFAULT 3, next_suggested_date date, last_contacted_at timestamptz, notes text, started_at timestamptz DEFAULT now(), completed_at timestamptz, email_sent_at timestamptz, created_at/updated_at timestamptz.
> 3. ALTER TABLE appointments ADD COLUMN treatment_plan_id uuid FK references treatment_plans;
> RLS treatment_plans: SELECT para doctor(sus pacientes), admin/owner(toda org), receptionist(toda org para vista seguimientos). INSERT solo doctor. UPDATE: doctor(autor, todos los campos), admin(solo notify_patient), receptionist(solo last_contacted_at y notify_patient).
> Índices: treatment_plans(patient_id, organization_id, status, next_suggested_date), appointments(treatment_plan_id).
> RPC get_follow_up_patients(p_org_id uuid): retorna planes activos con next_suggested_date <= today+30d, sin citas futuras agendadas, no contactados en últimos 3 días. JOIN patients, services, doctors. Ordenar por next_suggested_date ASC.
> Trigger updated_at en treatment_plans.
> Agregar template email treatment_reminder en seed_email_templates con variables NOMBRE, SERVICIO, SESION_ACTUAL, TOTAL_SESIONES, CLINICA, TELEFONO.

## 9.9 Prompt 9: API + Componentes Tratamientos

> **Copiar completo**
> Lee PRD.md. Crear:
> TIPOS Y VALIDACIONES:
> types/treatment.ts: TreatmentPlan, TreatmentPlanStatus, FollowUpPatient.
> lib/validations/treatment.ts: treatmentPlanSchema (name required, interval_days required min 1, total_sessions optional, notify_patient boolean, notify_before_days, notes optional), contactSchema (solo id).
> API ROUTES:
> 1. /api/treatment-plans: POST (crear, solo doctor), GET (por patient_id o listar org)
> 2. /api/treatment-plans/[id]: PATCH (actualizar), GET
> 3. /api/treatment-plans/[id]/contact: POST (set last_contacted_at=now(), doctor/admin/receptionist)
> 4. /api/follow-ups: GET (llama RPC get_follow_up_patients, para vista seguimientos)
> COMPONENTES:
> 1. components/clinical/create-treatment-plan-modal.tsx: Dialog post-firma nota. Pre-llena servicio, intervalo del servicio (suggested_interval_days). Doctor define: nombre, intervalo, total sesiones, notificar?. POST /api/treatment-plans.
> 2. Modificar ClinicalNoteEditor: después de firmar exitosamente, si servicio is_recurring=true, mostrar CreateTreatmentPlanModal automáticamente. Si no es recurring, mostrar botón sutil "Crear plan de tratamiento" (opcional).
> 3. components/patients/patient-treatment-plans-tab.tsx: sub-tab en PatientClinicalHistoryTab. Lista de planes: nombre, servicio, progreso (3/6 badge), status badge (active=green, paused=yellow, completed=blue, cancelled=gray), intervalo, próxima fecha sugerida. Click expande detalles.
> 4. Modificar admin/services form: agregar sección colapsable "Recurrencia" con toggle is_recurring + campos interval y sessions.
> 5. Lógica al completar cita: en la API/lógica que cambia status de cita a completada, si appointment.treatment_plan_id existe: incrementar completed_sessions, calcular next_suggested_date = appointment.date + interval_days. Si completed_sessions >= total_sessions, set status=completed y completed_at=now().

## 9.10 Prompt 10: Vista de Seguimientos

> **Copiar completo**
> Lee PRD.md. Crear la vista de seguimientos:
> 1. app/(dashboard)/scheduler/follow-ups/page.tsx:
> Visible para receptionist y admin/owner (NO doctor). Usar useOrgRole.
> Header: "Seguimientos" + Badge total pendientes + Filtros: doctor (Select), servicio (Select), mostrar contactados (toggle).
> Fetch GET /api/follow-ups. Separar resultados en 3 secciones por days_until:
> - VENCIDOS (days_until < 0): borde rojo, badge "Hace X días"
> - PRÓXIMOS 7 DÍAS (0 <= days_until <= 7): borde amarillo, badge "En X días"
> - PRÓXIMOS 8-30 DÍAS (8 <= days_until <= 30): borde verde, badge "En X días"
> Cada card muestra:
> - Nombre paciente (bold) + Teléfono con botón copiar
> - Servicio + "Sesión X de Y" (progress badge)
> - Doctor que creó el plan
> - Fecha sugerida + days_until badge (coloreado)
> - Botón WhatsApp: genera mensaje clipboard con template de seguimiento (integrar con lib/whatsapp-clipboard-config.ts, crear nueva función buildFollowUpMessage con variables NOMBRE, SERVICIO, SESION, TOTAL, CLINICA, TELEFONO)
> - Botón "Agendar cita": abre modal crear cita del scheduler con patient, service y treatment_plan_id pre-seleccionados. Fecha VACÍA (la recepcionista elige).
> - Botón "Contactado": POST /api/treatment-plans/[id]/contact. Card desaparece (reaparece en 3 días si no se agendó).
> - Toggle "Notificar" inline: PATCH notify_patient en treatment_plan.
> Empty state: "No hay seguimientos pendientes — ¡Todo al día!" con icono CheckCircle.
> 2. Sidebar: agregar "Seguimientos" en sección Agenda (después de Historial) con icono UserCheck de Lucide. Badge con count de vencidos (rojo). Visible para receptionist y admin/owner.
> TanStack Query para fetch + mutations. Sonner para toasts. Seguir convenciones del proyecto.

# 10. Actualización del PRD Post-Implementación

-   Sección 6 (Datos): Agregar 5 tablas nuevas + 2 tablas modificadas

-   Sección 4 (Roles): Matriz de permisos clínicos (14 acciones x 4 roles)

-   Sección 7 (Flujos): 7.8 Documentación Clínica, 7.9 Plantillas, 7.10 Tratamientos Recurrentes, 7.11 Seguimientos

-   Sección 8 (Rutas): /admin/clinical-templates, /scheduler/follow-ups, APIs nuevas

-   Sección 9 (Sidebar): Plantillas Clínicas en Admin, Seguimientos en Agenda

-   Sección 12 (Features): F9 completado, nueva feature Tratamientos Recurrentes + Seguimientos

-   Sección 13 (Hooks): usePatientMedicalHistory, useClinicalNotes, usePendingNotes, useClinicalTemplates, useTreatmentPlans, useFollowUps

# 11. Consideraciones Futuras

## 11.1 RENHICE

CIE-10 y campos estructurados preparan para integración. Considerar HL7 FHIR / IPS.

## 11.2 Firma Digital

is_locked es primer paso. Integración con proveedores certificados Perú (Thomas Signe/URUK) post-MVP.

## 11.3 Banco de Datos Personales

Ley 29733: datos clínicos = banco sensible. Cada org debe registrarse ante ANPDP. DS 016-2024-JUS: inscripción gratuita y automática.

## 11.4 Restricciones de plan

Recomendación: SOAP básico en todos los planes. Templates custom, CIE-10, adjuntos, PDF y seguimientos como features de planes pagos.

## 11.5 Cron Job (F8) — Dependencia

Las notificaciones automáticas de tratamiento dependen del Feature F8 (cron jobs). Sin F8, las notificaciones se gestionan manualmente desde la vista de Seguimientos + WhatsApp clipboard. F8 se puede implementar como Supabase Edge Function con pg_cron o como endpoint externo invocado por un cron service.
