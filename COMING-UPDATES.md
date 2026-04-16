# Coming Updates — REPLACE

> **Última actualización:** 2026-04-16
> **Seguimiento activo de funcionalidades en desarrollo o planificadas**

---

## ✅ Entregados

- [x] **Catálogo CIE-10 personalizable por organización** — Tabla `custom_diagnosis_codes` con RLS, API CRUD (`/api/custom-diagnosis-codes`), panel Admin → Diagnósticos CIE-10 y merge automático en el buscador de la nota clínica (códigos personalizados aparecen etiquetados). *(v0.8.2 — 2026-04-16)*
- [x] **Antecedentes del paciente en la nota clínica** — Tarjeta colapsable en el panel de nota clínica con alergias, condiciones crónicas, medicación activa y últimos 5 diagnósticos. 3 tablas normalizadas con RLS (`patient_allergies`, `patient_conditions`, `patient_medications`). *(v0.8.2 — 2026-04-16)*
- [x] **Email de activación de trial** — Plantilla `trial_welcome` con variables dinámicas. Enviado post-respuesta via `after()` de Next.js. *(v0.8.1 — 2026-04-15)*
- [x] **Estadísticas de edades en /reports** — Promedio, distribución por rangos, gráfica. Basado en `patients.birth_date`. *(commit 4ecac98 — 2026-04-12)*
- [x] **Plantillas de tratamiento** — Admin → Plantillas de Tratamiento. Pre-llena plan de tratamiento con nombre, descripción, sesiones, diagnóstico CIE-10. *(commit 4ecac98 — 2026-04-12)*

---

## 📧 Correos

- [ ] **Notificaciones periódicas de reportes (admin/owner)** — Activar envío automático de resumen de métricas por email:
  - Diario: citas del día anterior, ingresos, no-shows
  - Semanal: resumen de la semana (pacientes nuevos, ingresos, ocupación)
  - Mensual: reporte completo del mes (financiero, retención, marketing)
  - Configurable por el owner en Settings → Correos (activar/desactivar cada frecuencia)

---

## 🤖 Asistente IA

- [ ] **Persistencia de conversación por día (sesiones de chat IA)** — Actualmente el contexto vive solo en memoria del navegador (últimas 10 interacciones + SQL previo embebido) lo cual es ligero y rápido. Próxima iteración:
  - Tabla `ai_chat_sessions (id, organization_id, user_id, started_at, ended_at)` y `ai_chat_messages (id, session_id, role, content, sql, data_snapshot, created_at)` con RLS.
  - Agrupación automática por día (1 sesión por usuario por día).
  - Sidebar con historial: "Hoy", "Ayer", "Esta semana".
  - Permite retomar conversaciones, exportar reportes y auditar uso.
  - Ventaja: análisis posterior de qué preguntan los usuarios, mejora del prompt.

---

## 📊 Reportes

- [ ] **Reporte IA por paciente (timeline cronológico)** — Botón "Reporte IA" en la ficha expandida del paciente que genera:
  - Resumen cronológico con lenguaje fluido (narrativo, no bullets)
  - Mecánica similar al Asistente IA de /reports pero enfocado en un solo paciente
  - Incluye: historial de citas, diagnósticos, tratamientos, prescripciones, exámenes, pagos
  - Formato timeline visual con fechas y descripciones
  - Ejemplo de output: *"María López ha sido paciente desde el 15 de enero de 2026. En su primera consulta fue diagnosticada con SOP (E28.2) por la Dra. García. Se le prescribió metformina 850mg y se solicitó ecografía pélvica. En su control del 12 de febrero, los resultados de la ecografía mostraron..."*
  - Útil para: referencias a otros especialistas, auditorías, continuidad del cuidado

---

## 🏥 Historia Clínica

- [ ] **Importación masiva de códigos CIE-10** — La base ya permite agregar códigos personalizados uno a uno. Falta importar lotes (CSV/Excel) por especialidad para ahorrar tiempo a clínicas con muchos diagnósticos específicos.

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

- [ ] **Descuentos condicionales a tratamientos** — Aplicar descuentos por condiciones configurables:
  - Por cantidad de sesiones (ej: 10% si compra 10+ sesiones)
  - Por pago adelantado (ej: 5% si paga el tratamiento completo)
  - Por combinación de servicios (ej: limpieza + blanqueamiento = -15%)
  - Por vigencia temporal (ej: promoción válida hasta cierta fecha)
  - Configurable desde Admin → Tratamientos o Servicios

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
| ~~1~~ | ~~Email activación trial~~ | ~~Bajo~~ | ~~Alto~~ | ✅ Entregado |
| 2 | Bloques de horarios (copiar) | Medio | Alto (uso diario recepcionista) | 🔴 Alta |
| ~~3~~ | ~~Estadísticas de edades~~ | ~~Bajo~~ | ~~Medio~~ | ✅ Entregado |
| 4 | Bloque hora único en calendar | Bajo | Medio (UX) | 🟡 Media |
| ~~5~~ | ~~Plantillas de tratamiento~~ | ~~Medio~~ | ~~Alto~~ | ✅ Entregado |
| 6 | Notificaciones periódicas | Medio | Alto (engagement) | 🟡 Media |
| 7 | Reporte IA por paciente | Alto | Alto (diferenciador) | 🟡 Media |
| 8 | Google Calendar sync | Alto | Alto (integración clave) | 🟠 Media-baja |
| 9 | Links Zoom/Meet automáticos | Alto | Medio (teleconsulta) | 🟠 Media-baja |
| 10 | Facturación SUNAT (boletas/facturas) | Alto | Alto (requisito legal Perú) | 🟡 Media |
| 11 | CRM multi-canal (WhatsApp + IG + FB) | Muy alto | Muy alto (diferenciador) | 🟡 Media |
| ~~12~~ | ~~Catálogo CIE-10 personalizable~~ | ~~Medio~~ | ~~Alto~~ | ✅ Entregado |
| 13 | Descuentos condicionales | Medio | Medio (billing) | 🟠 Media-baja |
| 14 | Importación masiva CIE-10 (CSV) | Bajo | Medio | 🟠 Media-baja |

---

*Este archivo se actualiza continuamente. Cada feature completada se mueve al changelog del PRD.md.*
