# VibeForge — Evaluacion Objetiva y Roadmap de Mejoras

**Fecha:** 2026-03-15
**Evaluador:** Analisis tecnico integral del producto

---

## PARTE 1: OPINION OBJETIVA DEL ESTADO ACTUAL

### Lo que esta BIEN (y es competitivo)

1. **Multi-tenancy solido**: El esquema de organizaciones con RLS por tenant esta bien implementado. Esto es infraestructura correcta desde dia uno — muchos SaaS peruanos no lo hacen.

2. **Sistema de roles granular**: owner/admin/receptionist/doctor con permisos diferenciados. El redirect segun rol (receptionist → scheduler, doctor → su dashboard) es buena UX.

3. **Scheduler con drag & drop**: Vista dia/semana, bloques de horario, break time, deteccion de conflictos, filtro por consultorio. Esto es el core y esta funcional.

4. **CRM de pacientes robusto**: Busqueda, tags, filtros avanzados (deuda, servicio, origen, rango de fecha), perfil 360. Para el mercado peruano esto esta por encima del promedio.

5. **Sistema de planes bien pensado**: 3 tiers (Independiente/Centro Medico/Clinica) con precios en Soles, Mercado Pago integrado, addons por consultorio/miembro. Muy bien adaptado al mercado local.

6. **Dashboard analitico completo**: Metricas por periodo (hoy/semana/mes), heatmap de demanda, top tratamientos, tasa de ocupacion, no-shows, revenue. Mejor que el 90% de competidores locales.

7. **AI Assistant con SQL read-only**: Consultas en lenguaje natural sobre datos de la clinica. Feature diferenciador real.

8. **Teleconsulta**: Soporte para citas virtuales con meeting URL — relevante post-pandemia.

9. **Templates de email configurables**: Confirmacion, recordatorios, marketing, por plan. Buen sistema de notificaciones.

10. **Internacionalizacion**: Sistema de idiomas implementado (useLanguage). Poca gente lo hace desde el inicio.

### Lo que esta MAL o FALTA (problemas reales)

1. **Sin WhatsApp integration real**: En Peru, el 95% de comunicacion clinica es por WhatsApp. Tienes `whatsapp_phone` en profiles pero NO hay envio de mensajes WhatsApp. Solo email. **Esto es critico** — las clinicas peruanas no usan email para recordatorios.

2. **Sin agenda publica / booking online**: Los pacientes no pueden agendar solos. Todo depende de la recepcionista. En 2026 esto es un must-have.

3. **Sin historial clinico**: No hay tabla de notas clinicas, diagnosticos, recetas. El paciente tiene `notes` pero no hay historial medico por cita. Un doctor necesita ver el historial al atender.

4. **Sin recordatorios automaticos**: Los templates de email existen pero NO hay un cron/scheduler que los envie automaticamente (24h antes, 2h antes). Son templates muertos.

5. **Sin exportacion real**: `feature_export` existe como flag pero no vi implementacion de exportar a CSV/Excel/PDF en reportes o pacientes.

6. **Sin landing page / onboarding fuerte**: La pagina de registro existe pero no hay un funnel de conversion con landing page que venda el producto.

7. **Sin metricas de retencion de pacientes**: Sabes cuantos pacientes tienes pero no cuantos regresan, frecuencia de visita, lifetime value.

8. **Sin notificaciones push/in-app**: No hay sistema de notificaciones en tiempo real dentro de la app.

9. **Dashboard del doctor limitado**: Tiene stats basicas pero no puede ver su agenda completa ni gestionar sus propias notas clinicas.

10. **Sin consentimiento informado digital**: En Peru es obligatorio. Las clinicas lo hacen en papel.

### Calificacion General: 6.5/10

Tienes una **base tecnica solida** (mejor que la mayoria de SaaS peruanos de salud), pero le faltan features que para el usuario final peruano son **deal-breakers**: WhatsApp y booking online. Sin esos dos, vas a perder contra competidores que si los tienen, aunque tu producto sea tecnicmente superior.

---

## PARTE 2: FEATURES NUEVAS POR DIFICULTAD

### DIFICULTAD: FACIL (1-2 dias cada una)

#### F1. Exportacion CSV/Excel de Datos ✅ IMPLEMENTADO
**Que es:** Boton para descargar pacientes, citas, y reportes financieros en CSV.
**Implementado:** `lib/export.ts` (utilidad reutilizable), boton CSV en `patients/page.tsx` (exporta lista filtrada con datos financieros), CSV en `reports/financial-report.tsx`, `reports/marketing-report.tsx`, `reports/operational-report.tsx`.

#### F2. Indicador de Deuda Visible en Citas ✅ IMPLEMENTADO
**Que es:** En el scheduler y sidebar de cita, mostrar si el paciente tiene saldo pendiente con un badge rojo.
**Implementado:** Badge rojo con monto de deuda en `scheduler/day-view.tsx` (en cada tarjeta de cita), badge de deuda total del paciente en `scheduler/appointment-sidebar.tsx` (junto al nombre del paciente).

#### F3. Impresion de Recibo/Comprobante
**Que es:** Boton "Imprimir recibo" en el detalle de pago del paciente con formato para impresora termica o A4.
**Por que:** Las clinicas peruanas necesitan dar comprobante fisico. Es ley (SUNAT).
**Archivos a tocar:** Nuevo componente `components/print/receipt-template.tsx`, integration en patient-drawer.
**Impacto:** Alto — requisito legal en Peru.

#### F4. Confirmar Cita desde Email (1-click)
**Que es:** Link en el email de confirmacion que cambia status de "scheduled" a "confirmed" sin login.
**Por que:** Reduce no-shows. El paciente confirma con un click.
**Archivos a tocar:** Nuevo `app/api/appointments/confirm/route.ts`, token seguro temporal.
**Impacto:** Alto — reduce no-shows directamente.

#### F5. Campo de Fecha de Nacimiento en Pacientes ✅ IMPLEMENTADO
**Que es:** Agregar `birth_date` a patients. Mostrar edad automatica. Habilitar template de cumpleanos.
**Implementado:** Campo `birth_date` ya existia en DB (migracion 019) y formularios. Se agrego calculo automatico de edad (`lib/export.ts: calculateAge`) visible en: lista de pacientes (con icono de torta), header del drawer del paciente, campo de fecha de nacimiento en tab Info. Falta template de email de cumpleanos (requiere F8 cron para envio automatico).

---

### DIFICULTAD: MEDIA (3-5 dias cada una)

#### F6. Integracion WhatsApp via API (Click-to-Chat + Templates)
**Que es:** Fase 1: Botones "Enviar por WhatsApp" que abren wa.me/ con mensaje pre-llenado para confirmacion, recordatorio, etc. Fase 2: WhatsApp Business API con Twilio/360dialog para envio automatico.
**Por que:** **EL feature mas importante que falta.** En Peru, nadie lee emails de clinicas. Todo es WhatsApp.
**Archivos a tocar:** Nuevo `lib/whatsapp.ts`, botones en appointment-sidebar, patient-drawer, nuevo `app/api/whatsapp/send/route.ts`.
**Impacto:** CRITICO — sin esto pierdes el mercado peruano.

#### F7. Booking Online (Agenda Publica)
**Que es:** Pagina publica `/book/[org-slug]` donde pacientes ven disponibilidad y agendan solos. Seleccionan servicio → doctor → fecha/hora → llenan datos → confirman.
**Por que:** Reduce carga de la recepcionista 40-60%. Los pacientes pueden agendar 24/7.
**Archivos a tocar:** Nuevo `app/(public)/book/[slug]/page.tsx`, API para disponibilidad publica, integracion con scheduler.
**Impacto:** CRITICO — feature diferenciador y generador de leads.

#### F8. Recordatorios Automaticos (Cron Job)
**Que es:** Tarea programada que envia recordatorio 24h y 2h antes de la cita por email (y WhatsApp si F6 esta implementado).
**Por que:** Tienes los templates pero no el motor de envio. Reduce no-shows 30-50%.
**Archivos a tocar:** Nuevo `app/api/cron/reminders/route.ts`, Supabase Edge Function o Vercel Cron, query de citas proximas.
**Impacto:** Alto — reduce no-shows y ya tienes los templates.

#### F9. Notas Clinicas por Cita (Historia Clinica Basica)
**Que es:** Tabla `clinical_notes` (appointment_id, doctor_id, subjective, objective, assessment, plan — formato SOAP). Vista en el perfil del paciente.
**Por que:** Los doctores necesitan registrar lo que hicieron en cada cita. Hoy no hay donde hacerlo.
**Archivos a tocar:** Nueva migracion, nuevo componente en patient-drawer, tab en doctor-dashboard.
**Impacto:** Alto — convierte el producto de "agenda" a "sistema clinico".

#### F10. Dashboard de Retencion de Pacientes
**Que es:** Metricas de: pacientes que regresaron vs nuevos, frecuencia promedio de visita, pacientes en riesgo de abandono (no vienen hace X meses), LTV por paciente.
**Por que:** Las clinicas no saben cuantos pacientes retienen. Esto es data accionable para marketing.
**Archivos a tocar:** Nuevo tab en reports o seccion en dashboard, RPCs de retencion.
**Impacto:** Alto — insight unico que ningun competidor local ofrece.

#### F11. Notificaciones In-App en Tiempo Real
**Que es:** Icono de campana con contador de notificaciones no leidas. Supabase Realtime para nuevas citas, cancelaciones, pagos.
**Por que:** El admin necesita saber al instante cuando algo pasa sin refrescar la pagina.
**Archivos a tocar:** Nueva tabla `notifications`, Supabase Realtime subscription, componente en topbar.
**Impacto:** Medio — mejora la experiencia operativa.

---

### DIFICULTAD: ALTA (1-2 semanas cada una)

#### F12. Consentimiento Informado Digital
**Que es:** Templates de consentimiento informado por servicio. El paciente firma digitalmente (canvas de firma) antes del procedimiento. Se guarda como PDF en Supabase Storage.
**Por que:** Requisito legal en Peru (Ley 29414). Las clinicas pierden tiempo con papel y tienen riesgo legal.
**Archivos a tocar:** Nueva migracion para `consent_forms` y `patient_consents`, componente de firma digital, generacion de PDF, storage bucket.
**Impacto:** CRITICO para clinicas — diferenciador legal real.

#### F13. Modulo de Inventario Basico
**Que es:** Control de insumos medicos: productos, stock, alertas de stock bajo, asociar consumo a citas/servicios.
**Por que:** Las clinicas gastan mucho en insumos y no controlan el stock. Esto cierra el ciclo operativo.
**Archivos a tocar:** Nuevas tablas `products`, `inventory_movements`, nueva seccion en dashboard.
**Impacto:** Medio-Alto — valor agregado unico.

#### F14. Portal del Paciente
**Que es:** Login separado para pacientes donde ven sus citas, resultados, pagos, pueden reagendar, y descargar documentos.
**Por que:** Reduce llamadas/WhatsApp a la clinica. El paciente se autogestiona.
**Archivos a tocar:** Nuevo layout `app/(patient-portal)/`, auth separada o magic link, vistas de lectura.
**Impacto:** Alto — out of the box para el mercado peruano.

#### F15. Reportes con IA Generativa
**Que es:** Boton "Generar resumen inteligente" que analiza las metricas del periodo y genera un resumen ejecutivo con insights y recomendaciones.
**Por que:** Los duenos de clinica no saben interpretar graficos. Un resumen en texto con recomendaciones concretas ("Tu tasa de cancelacion subio 15% esta semana, considera enviar recordatorios 48h antes") es revolucionario.
**Archivos a tocar:** Nuevo endpoint AI, integracion en reports page.
**Impacto:** Alto — WOW factor, diferenciador real.

---

## PARTE 3: PRIORIDAD DE IMPLEMENTACION RECOMENDADA

### Sprint 1 — "Lo que ya deberias tener" (Semana 1-2)
1. ✅ **F1** - Exportacion CSV — COMPLETADO
2. ✅ **F2** - Indicador de deuda en citas — COMPLETADO
3. ✅ **F5** - Fecha de nacimiento + edad automatica — COMPLETADO
4. 🔍 **F3** - Impresion de recibos — PENDIENTE (requiere evaluar formato legal Peru/SUNAT)
5. 🔍 **F4** - Confirmacion 1-click — PENDIENTE (requiere evaluar formato email legal Peru)
6. **F6 Fase 1** - WhatsApp click-to-chat (3 dias)

### Sprint 2 — "Lo que te hace competitivo" (Semana 3-4)
7. **F7** - Booking online (5 dias)
8. **F8** - Recordatorios automaticos (3 dias)

### Sprint 3 — "Lo que te diferencia" (Semana 5-7)
9. **F9** - Notas clinicas (4 dias)
10. **F10** - Dashboard de retencion (3 dias)
11. **F11** - Notificaciones in-app (3 dias)
12. **F12** - Consentimiento informado digital (5 dias)

### Sprint 4 — "Lo que te hace premium" (Semana 8-10)
13. **F15** - Reportes con IA generativa (4 dias)
14. **F14** - Portal del paciente (7 dias)
15. **F13** - Inventario basico (5 dias)

---

## PARTE 4: COSAS QUE ARREGLARIA DEL PRODUCTO ACTUAL

### Bugs / Deuda Tecnica

1. **Migraciones SQL con numeracion duplicada**: Hay `003_offices.sql` y `003_plans_and_subscriptions.sql`, `004_organizations.sql` y `004_service_categories_and_services.sql`, `005_fix_rls_recursion.sql` y `005_doctors.sql`. Esto puede causar problemas de orden de ejecucion.

2. **Campos en espanol mezclados con ingles**: `viene_desde`, `adicional_1`, `adicional_2` en la tabla patients. Deberian ser `referral_source`, `custom_field_1`, `custom_field_2` para consistencia.

3. **patient_name redundante en appointments**: Las citas tienen `patient_name` como texto libre Y `patient_id` como FK. Esto crea inconsistencia. Se deberia usar solo `patient_id` y resolver el nombre via join.

4. **AI Assistant sin historial de conversacion**: Cada pregunta es independiente. Deberia mantener contexto (al menos las ultimas 3 preguntas) para follow-ups tipo "y el mes pasado?".

5. **Scheduler carga todos los pagos**: En `fetchAppointments()` se hace `select("appointment_id, amount").not("appointment_id", "is", null)` SIN filtro de fecha. Esto carga TODOS los pagos de la historia. Con volumen, esto sera un problema de performance.

6. **Dashboard server component hace 17 queries en paralelo**: Funciona ahora, pero a escala sera lento. Considerar un RPC consolidado que retorne todas las stats en una sola llamada.

### UX que Mejorar

1. **No hay onboarding guiado**: Despues del registro, el usuario cae al dashboard vacio. Deberia haber un wizard: "Agrega tu primer doctor → Crea un consultorio → Define tus servicios → Agenda tu primera cita".

2. **Mobile experience**: El scheduler parece optimizado para desktop. Las recepcionistas peruanas frecuentemente usan celular o tablet.

3. **Sin search global**: No hay una barra de busqueda global para encontrar pacientes, citas, o doctores desde cualquier pagina.

---

## RESUMEN EJECUTIVO

**VibeForge es un SaaS de gestion clinica con base tecnica superior al promedio del mercado peruano**, pero con gaps criticos en los canales de comunicacion que el mercado realmente usa (WhatsApp > Email).

Las 3 acciones que mayor impacto tendrian:
1. WhatsApp integration (F6) — sin esto, el producto no encaja en el mercado peruano
2. Booking online (F7) — esto solo justifica el precio del plan pagado
3. Recordatorios automaticos (F8) — esto reduce no-shows y se paga solo

Con estos 3 features, el producto sube de 6.5/10 a 8.5/10 y esta listo para escalar en el mercado peruano. Los demas features son diferenciadores que te ponen por encima de la competencia.
