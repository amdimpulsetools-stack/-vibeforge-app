# Coming Updates — REPLACE

> **Última actualización:** 2026-04-14
> **Seguimiento activo de funcionalidades en desarrollo o planificadas**

---

## 📧 Correos

- [ ] **Email de activación de trial** — Cuando el usuario inicia su periodo de prueba de 14 días, recibe un email de bienvenida con: pasos para empezar, link al dashboard, link a la guía de inicio rápido, y fecha de vencimiento del trial.

- [ ] **Notificaciones periódicas de reportes (admin/owner)** — Activar envío automático de resumen de métricas por email:
  - Diario: citas del día anterior, ingresos, no-shows
  - Semanal: resumen de la semana (pacientes nuevos, ingresos, ocupación)
  - Mensual: reporte completo del mes (financiero, retención, marketing)
  - Configurable por el owner en Settings → Correos (activar/desactivar cada frecuencia)

---

## 📊 Reportes

- [ ] **Estadísticas de edades en /reports** — Agregar al reporte de marketing o general:
  - Promedio de edad de pacientes
  - Distribución por rangos de edad (0-17, 18-30, 31-45, 46-60, 60+)
  - Gráfica de barras o donut con porcentajes
  - Basado en `patients.birth_date` (solo pacientes con fecha registrada)

---

## 👥 Pacientes

- [ ] **Reporte IA por paciente (timeline cronológico)** — Botón "Reporte IA" en la ficha expandida del paciente que genera:
  - Resumen cronológico con lenguaje fluido (narrativo, no bullets)
  - Mecánica similar al Asistente IA de /reports pero enfocado en un solo paciente
  - Incluye: historial de citas, diagnósticos, tratamientos, prescripciones, exámenes, pagos
  - Formato timeline visual con fechas y descripciones
  - Ejemplo de output: *"María López ha sido paciente desde el 15 de enero de 2026. En su primera consulta fue diagnosticada con SOP (E28.2) por la Dra. García. Se le prescribió metformina 850mg y se solicitó ecografía pélvica. En su control del 12 de febrero, los resultados de la ecografía mostraron..."*
  - Útil para: referencias a otros especialistas, auditorías, continuidad del cuidado

---

## 📅 Citas / Calendario

- [ ] **Generación automática de links de reunión Zoom/Meet** — Al crear una cita virtual:
  - Genera automáticamente un link de Zoom o Google Meet
  - El link se incluye en el email de confirmación y recordatorio
  - Se muestra en el sidebar de la cita con botón para copiar/abrir
  - Requiere: integración con Zoom API o Google Calendar API

- [ ] **Generador de bloques de horarios disponibles (copiar al portapapeles)** — Para que el equipo pueda compartir horarios rápidamente:
  - Botón/ícono en la agenda que abre un modal
  - Seleccionar doctor
  - Seleccionar días que desea ofrecer (checkboxes por día)
  - Click en "Generar"
  - El sistema consulta la disponibilidad real del doctor (excluyendo citas ocupadas, bloqueos)
  - Genera texto formateado en un textbox con botón "Copiar":
    ```
    El Dr. Juan tiene citas disponibles:
    📅 Lunes 13 de abril: 9:00am, 5:00pm, 5:30pm
    📅 Martes 14 de abril: 8:30am, 10:00am, 11:30am
    📅 Miércoles 15 de abril: 9:00am, 9:30am
    ```
  - Los bloques se generan en base a la duración del intervalo configurado (15min, 20min, 30min, etc.)
  - Ideal para copiar y pegar en WhatsApp o email al paciente

- [ ] **Bloque de hora único en vista de calendario** — Actualmente se puede visualizar la agenda con diferentes intervalos (15min, 20min, 30min). Restricción: solo se puede seleccionar UN tipo de bloque a la vez en el view del calendar. No se permite mezclar 2 o más intervalos simultáneamente.

- [ ] **Integración con Google Calendar** — Sincronización bidireccional:
  - Las citas creadas en REPLACE se crean automáticamente en el Google Calendar del doctor
  - Incluye: título (paciente + servicio), hora, consultorio, notas
  - Requiere: OAuth2 con Google Calendar API
  - Configuración por doctor en su perfil (conectar/desconectar su Google Calendar)
  - Futuro: sincronización inversa (citas creadas en Google Calendar → REPLACE)

- [ ] **Plantillas de tratamiento** — Similar a las plantillas SOAP pero para planes de tratamiento:
  - El doctor puede seleccionar una plantilla predefinida o crear una personalizada
  - Plantilla incluye: nombre del tratamiento, descripción, número de sesiones, duración estimada, diagnóstico asociado
  - Ejemplos: "Ortodoncia fase 1 (12 sesiones)", "Fisioterapia lumbar (10 sesiones)", "Control prenatal (9 meses)"
  - Al seleccionar la plantilla, se pre-llena el formulario de plan de tratamiento
  - El doctor puede personalizar cualquier campo antes de guardar
  - Las plantillas se gestionan en Admin → Plantillas de Tratamiento (o dentro de la misma sección de plantillas clínicas)

---

## 🧾 Facturación

- [ ] **Boletas y facturas electrónicas vinculadas a SUNAT** — Generar comprobantes de pago directamente desde el sistema:
  - Al registrar un pago, opción de generar boleta (persona natural) o factura (empresa con RUC)
  - Integración con SUNAT vía API (Nubefact, Efact, o similar como proveedor de facturación electrónica)
  - Datos del comprobante: RUC/DNI del paciente, monto, tipo de servicio, IGV, serie y correlativo
  - PDF del comprobante generado automáticamente y enviado por email al paciente
  - Dashboard de comprobantes emitidos (por periodo, tipo, estado)
  - Requisitos: cuenta con proveedor de facturación electrónica autorizado por SUNAT, certificado digital
  - Ideal para clínicas que actualmente emiten comprobantes manuales o en sistemas separados

- [ ] **Descuentos condicionales a tratamientos según servicios** — Aplicar descuentos automáticos o sugeridos al registrar pagos de planes de tratamiento, condicionados por el/los servicio(s) incluidos:
  - Reglas de descuento configurables en Admin → Servicios (o sección dedicada de "Descuentos y Promociones")
  - Condiciones soportadas:
    - Descuento aplicable solo a ciertos servicios (ej: "Fisioterapia", "Ortodoncia fase 2")
    - Por cantidad de sesiones (ej: 10% al comprar 10+ sesiones del mismo servicio)
    - Por pago adelantado del plan completo (ej: 15% si paga todas las sesiones por adelantado)
    - Por combinación de servicios (ej: 20% si contrata Fisioterapia + Masajes)
    - Vigencia temporal (fechas de inicio/fin de promoción)
  - Tipo de descuento: porcentaje (%) o monto fijo (S/.)
  - Al registrar el pago del tratamiento, el sistema:
    - Detecta si el plan/servicio califica para algún descuento activo
    - Muestra badge "Descuento disponible: 10%" junto al total
    - Opción de aplicar con un click o ignorar
    - Registra el descuento aplicado en el comprobante y en reportes
  - Auditoría: log de descuentos aplicados (quién, cuándo, a qué paciente, monto original vs final)
  - Reporte de impacto de descuentos (cuánto se ha descontado por período/servicio)
  - Permisos: solo admin/owner puede crear/editar reglas; doctores/recepción solo aplicar

---

## 💬 CRM Multi-canal

- [ ] **CRM con WhatsApp API, Instagram API Messages y Facebook Messenger** — Bandeja de mensajes unificada tipo Kommo/Leadsales:
  - Chat en tiempo real desde el panel de REPLACE
  - Bandeja unificada: todos los mensajes de WhatsApp, Instagram DMs y Facebook Messenger en un solo lugar
  - Vinculación automática de mensajes con la ficha del paciente (match por teléfono o nombre)
  - Historial de conversaciones por paciente (visible en el drawer del paciente)
  - Envío de mensajes directos desde la ficha del paciente
  - Plantillas de respuesta rápida para preguntas frecuentes
  - Asignación de conversaciones a miembros del equipo
  - Estados: nueva, en proceso, resuelta
  - Notificaciones de nuevos mensajes en el topbar
  - Integraciones requeridas:
    - WhatsApp Business API (Meta) — ya tenemos la base con recordatorios
    - Instagram Messaging API (Meta) — requiere aprobación de la app
    - Facebook Messenger API (Meta) — requiere Facebook Page vinculada
  - Fases de implementación:
    1. **Fase 1:** WhatsApp chat bidireccional (recibir + responder)
    2. **Fase 2:** Instagram DMs + Facebook Messenger
    3. **Fase 3:** Automatizaciones (respuestas automáticas, bots, flujos)

---

## 🔜 Prioridad sugerida

| # | Feature | Esfuerzo | Impacto | Prioridad |
|---|---|---|---|---|
| 1 | Email activación trial | Bajo | Alto (primera impresión) | 🔴 Alta |
| 2 | Bloques de horarios (copiar) | Medio | Alto (uso diario recepcionista) | 🔴 Alta |
| 3 | Estadísticas de edades | Bajo | Medio | 🟡 Media |
| 4 | Bloque hora único en calendar | Bajo | Medio (UX) | 🟡 Media |
| 5 | Plantillas de tratamiento | Medio | Alto (ahorra tiempo doctor) | 🟡 Media |
| 6 | Notificaciones periódicas | Medio | Alto (engagement) | 🟡 Media |
| 7 | Reporte IA por paciente | Alto | Alto (diferenciador) | 🟡 Media |
| 8 | Google Calendar sync | Alto | Alto (integración clave) | 🟠 Media-baja |
| 9 | Links Zoom/Meet automáticos | Alto | Medio (teleconsulta) | 🟠 Media-baja |
| 10 | Facturación SUNAT (boletas/facturas) | Alto | Alto (requisito legal Perú) | 🟡 Media |
| 11 | CRM multi-canal (WhatsApp + IG + FB) | Muy alto | Muy alto (diferenciador) | 🟡 Media |
| 12 | Descuentos condicionales a tratamientos | Medio | Alto (conversión/fidelización) | 🟡 Media |

---

*Este archivo se actualiza continuamente. Cada feature completada se mueve al changelog del PRD.md.*
