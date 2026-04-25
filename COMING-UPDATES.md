# Coming Updates — REPLACE

> **Última actualización:** 2026-04-24 (v0.12.6)
> **Seguimiento activo de funcionalidades en desarrollo o planificadas**

---

## 🏠 Landing page — pendientes post-auditoría (v0.12.6)

Auditoría multi-agente (diseño visual + neurocopy + UX) del 2026-04-24. Lo aplicado va en el changelog del PRD v0.12.6. Lo diferido:

- [ ] **Hero mockup asymmetric + device secundario flotante** — el dashboard del Hero se ve chico y centrado ("demo", no "herramienta"). Propuesta: laptop flotante a la derecha con shadow, tablet secundaria atrás rotada 15°, whitespace 1.5x. Refactor de `hero.tsx:100-231`. Riesgo visual, mejor post-pilot con feedback real sobre qué impacta.
- [ ] **Consolidar GrowthPath + Pricing** — ambos muestran los mismos 3 tiers (Independiente/Centro/Clínica) con narrativa duplicada. Propuesta: dejar Pricing como fuente única; simplificar GrowthPath a "escalas posibles" sin precios.
- [ ] **Mobile breaks** en `role-superpowers.tsx` (sticky mockup tapa contenido <768px), `live-notifications.tsx` (hover stack no funciona en touch), `patient-cards-carousel.tsx` (width fijo `22rem` desborda en <400px).
- [ ] **CTA differentiation** — quedan varios "Empezar ahora" idénticos a `/register`. Proponer CTA secundario de "Ver demo en vivo" (sin registro) vs "Probar gratis 14 días". Actual: Hero + FinalCTA ya diferenciados, falta aplicar a Pricing (3× idénticos) y RoleSuperpowers (sin CTA).
- [ ] **Features con screenshots reales** — `features.tsx` usa placeholders vacíos en las cards. Capturar 4 screenshots del dashboard real (scheduler, historia clínica, cobros, portal).
- [ ] **Micro-interactions**: Pricing toggle sin transición de precios, Feature cards sin hover accent, LiveNotifications sin swipe mobile, ExpectedResults count-up sin highlight final.
- [ ] **Eliminar muletas copy**: "Todo lo que necesitas. Nada que no.", "Potencia administradores", "Y no para." — detectadas por neurocopy agent. Rewrites propuestos en changelog v0.12.6.

---

## ✅ Entregados

- [x] **Catálogo CIE-10 personalizable por organización** — Tabla `custom_diagnosis_codes` con RLS, API CRUD (`/api/custom-diagnosis-codes`), panel Admin → Diagnósticos CIE-10 y merge automático en el buscador de la nota clínica (códigos personalizados aparecen etiquetados). *(v0.8.2 — 2026-04-16)*
- [x] **Antecedentes del paciente en la nota clínica** — Tarjeta colapsable en el panel de nota clínica con alergias, condiciones crónicas, medicación activa y últimos 5 diagnósticos. 3 tablas normalizadas con RLS (`patient_allergies`, `patient_conditions`, `patient_medications`). *(v0.8.2 — 2026-04-16)*
- [x] **Email de activación de trial** — Plantilla `trial_welcome` con variables dinámicas. Enviado post-respuesta via `after()` de Next.js. *(v0.8.1 — 2026-04-15)*
- [x] **Estadísticas de edades en /reports** — Promedio, distribución por rangos, gráfica. Basado en `patients.birth_date`. *(commit 4ecac98 — 2026-04-12)*
- [x] **Plantillas de tratamiento** — Admin → Plantillas de Tratamiento. Pre-llena plan de tratamiento con nombre, descripción, sesiones, diagnóstico CIE-10. *(commit 4ecac98 — 2026-04-12)*
- [x] **Generador de bloques de horarios disponibles (copiar al portapapeles)** — Botón Share en scheduler header → modal lazy-loaded. API server-side computa slots libres. Selector de doctor, días, intervalo. Copiar al portapapeles para WhatsApp. *(v0.9.1 — 2026-04-19)*
- [x] **Portal del Paciente — Phase 1** — Magic link auth (sin contraseña), registro de paciente nuevo (DNI, nombre, teléfono), página Mis Citas (próximas + historial), cancelar cita con validación de antelación mínima, settings del portal en dashboard (activar/desactivar, permitir cancelar, horas mínimas, mensaje de bienvenida). Deep links `{{link_cancelar}}` y `{{link_reagendar}}` en emails de recordatorio. Link "¿Ya eres paciente?" en página de reserva pública. *(v0.10.0 — 2026-04-20)*

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

- [ ] **Reporte: Ingresos reconocidos vs Caja recibida (dual view)** — Surge con la feature de Presupuestos de Tratamiento (v0.12+). Contablemente son dos cosas distintas y hoy los reportes mezclan los conceptos:

  **Contexto**: Cuando un paciente paga un plan de tratamiento por adelantado (ej: S/ 800 para 10 sesiones), el dinero entra a caja el día del anticipo pero el "ingreso reconocido" por servicios prestados se distribuye a medida que se realizan las sesiones. Con planes activos, es posible que la clínica tenga:
  - S/ 5,000 en caja este mes (incluye anticipos)
  - Solo S/ 3,200 en servicios efectivamente prestados
  - S/ 1,800 de "ingresos diferidos" (anticipos a cumplir con sesiones futuras)

  **Implementación propuesta**:
  - **Vista 1 — Ingresos reconocidos** (lo que hoy existe): `SUM(appointments.price_snapshot WHERE status='completed')`. Mide trabajo entregado.
  - **Vista 2 — Caja recibida** (nueva): `SUM(patient_payments.amount GROUP BY payment_date)`. Mide efectivo/digital que entró, sin importar si el servicio se prestó. Incluye anticipos al plan (`treatment_plan_id IS NOT NULL, appointment_id IS NULL`).
  - **Vista 3 — Ingresos diferidos** (nueva): `SUM(patient_payments WHERE treatment_plan_id IS NOT NULL AND NOT consumed) = anticipos de planes que aún no se han consumido en sesiones completadas`.

  **UI en `/reports`**:
  - Toggle en la sección financiera: `[ Ingresos reconocidos | Caja | Diferidos ]`.
  - Dashboard admin: añadir card "Ingresos diferidos" para owners que quieran ver el pasivo contable (servicios comprometidos pendientes).
  - Export CSV de pagos separando anticipos vs pagos por cita.

  **Prioridad**: implementar **después** de que el feature de Presupuestos esté en producción y haya volumen de anticipos — sin eso, las 3 vistas dan el mismo número y no tiene sentido el trabajo. Reevaluar en 2-3 meses post-release del feature.

  **Requisitos previos**: feature de Presupuestos de Tratamiento live + columna `patient_payments.treatment_plan_id` poblada por anticipos.

---

## 🏷️ Pacientes

- [ ] **Etiqueta "Paciente Recurrente" automática** — Tag automático en DB cuando el paciente acumula 2+ citas completadas. Columna computada o trigger que actualice una bandera `is_recurring` en `patients`. Badge visible en lista de pacientes, drawer y scheduler. Permite filtrar pacientes recurrentes vs nuevos en reportes y segmentación.

---

## 👤 Portal del Paciente — Próximas fases

- [ ] **Portal Phase 2 — Reservar cita desde el portal** — Flujo de 3 pasos (servicio → doctor → fecha/hora) reutilizando lógica de `/book/[slug]` con datos del paciente pre-cargados. Preview + confirmación automática.
- [ ] **Portal Phase 3 — Reprogramar cita** — Botón reagendar en Mis Citas → flujo de selección de nueva fecha/hora sin cancelar la anterior hasta confirmar.
- [ ] **Portal Phase 4 — Mis documentos** — Recetas, órdenes de exámenes y resultados descargables (PDF). Cada tipo activable/desactivable por org.
- [ ] **Portal — Panel de Resultados médicos (lab/imágenes)** — Sección "Mis resultados" en el portal con descarga de PDFs/imágenes subidos por el staff desde la ficha del paciente. Requiere:
  - Nueva tabla `patient_files (id, organization_id, patient_id, type, title, file_url, uploaded_by, uploaded_at, visible_to_patient)` con RLS estricta.
  - Bucket de Supabase Storage con policy por `organization_id` + `patient_id`.
  - UI de upload desde panel admin (ficha del paciente → tab "Archivos") con toggle de visibilidad.
  - Listado en portal agrupado por tipo (laboratorio, imagen, receta, orden) y fecha.
  - Logs de acceso para auditoría médica.
  - Decisiones de producto pendientes: ¿firmas digitales?, ¿expiración de enlaces?, ¿retención?
- [ ] **Portal — Indicaciones / pre-consulta** — El doctor o servicio puede definir instrucciones que ve el paciente antes de su cita (ayuno, llevar documentos, medicación a suspender). Implementación:
  - Campo `pre_appointment_instructions TEXT` en `services` (instrucciones por tipo de servicio).
  - Campo opcional `custom_instructions TEXT` en `appointments` (override específico de la cita).
  - Visible en el detalle de cita del portal y enviado en email de recordatorio 24h antes.
  - Editable por el staff al crear/editar la cita.
- [ ] **Portal — WhatsApp OTP auth** — Login alternativo por OTP via WhatsApp (cuando el volumen lo justifique).
- [ ] **Portal — Dominio personalizado** — `portal.miclinica.pe` con configuración DNS.

---

## 📏 Límites y Storage

- [ ] **Límites de plan: UX de soft-wall** — ¿Qué pasa cuando la org pasa de 500, 1000 o 3000 pacientes activos? Definir mensajes de bloqueo suave (modal "Has alcanzado el límite de tu plan"), CTA de upgrade, y comportamiento: ¿bloquear creación de nuevos pacientes o solo advertir? Aplicar para cada recurso con límite (pacientes, citas/mes, miembros, doctores, consultorios, storage).

- [ ] **Storage: límites y mensajes de espacio** — Auditar dónde se pueden subir imágenes (avatares, logos, adjuntos clínicos, fotos antes/después). Al acercarse o agotar el storage del plan, mostrar alerta con uso actual vs límite y CTA de upgrade. Mensaje claro: "Has alcanzado tu límite de almacenamiento (X MB/GB). Mejora tu plan para seguir subiendo archivos."

---

## 🛠️ Technical Debt — Post-audit (estado al 2026-04-24, v0.12.5)

Items identificados en la auditoría multi-agente del 2026-04-22. Análisis completo en `docs/{security,performance,ux}-review-2026-04-22.md`. Estado verificado en código.

### ✅ Cerrados en v0.12.3 + v0.12.4 + v0.12.5

**v0.12.3 + v0.12.4:**
- [x] **F-04** — 2FA Map in-memory migrado a tabla `founder_2fa_sessions` (migración 104).
- [x] **F-06** — `/api/clinical-attachments/[id]` con ownership check explícito (defense-in-depth).
- [x] **F-10** — founder routes verifican cookie 2FA real via `requireFounder()`.
- [x] **F-11** — PHI allowlist en LLM assistant (`lib/pseudonymize-phi.ts`).
- [x] **Perf F-01** — `select("*, ...)` → columnas explícitas en scheduler hot path.
- [x] **Perf item 6** — indices O(1) pre-construidos en `day-view.tsx` (200ms → 15ms).
- [x] **Perf migración 103** — aplicada en prod.
- [x] **UX ~14/24 copy edits** — "Error de conexión", "Break Time", errores de reserva.
- [x] **UX AlertDialog system** — patrón `useConfirm()` disponible + aplicado en scheduler + clinical notes.
- [x] **Deps** — package `motion` duplicado removido (-8.5MB).

**v0.12.5 (pre-pilot tier seguro):**
- [x] **F-03 — magic-link token hash** (migración 105). SHA-256 antes de persistir; raw sigue viajando por email/URL. Tokens vivos purgados.
- [x] **11 `confirm()` nativos → `useConfirm()`** en admin CRUD. Cero `confirm()` nativos restantes en `app/(dashboard)/**`.
- [x] **Copy edits ronda 2** — 11 cadenas reescritas: errores de guardar/firmar/subir/mover cita/registrar pago, "Firmar esta nota" → "Al firmar se bloquea…", "Entra a tu portal" → "Accede…", placeholders `book/` a "Ej. María" / "Ej. Rodríguez", 3× "Error de conexión" del portal.
- [x] **6 modales hand-rolled → Radix Dialog**: `block-dialog`, `available-slots-modal`, `admin/members` (invite), `account` (addons), `patients/clinical-history-modal`, `patients/patient-form-modal`.

### 🎯 Plan pre-pilot Vitra (quedan por atacar)

- [ ] **F-19 — MP webhook prefix check** (~15 min). Validar que `data.id` empiece con `payment`/`preapproval` antes de procesar. Quick fix en `app/api/mercadopago/webhook/route.ts:55`.

### ⏸️ Diferidos post-pilot (rastreables)

Funcionan hoy, no bloquean operación clínica. Atacar tras feedback real de Vitra.

- [ ] **F-05 — rate limiter Upstash/Redis**. In-memory actual (`lib/rate-limit.ts`) basta para 1 clínica single-instance. Migrar cuando escalemos a 2-3 clientes o autoscale activo.
- [ ] **2 modales hand-rolled grandes restantes → Radix Dialog** (diferidos intencionalmente por riesgo de regresión):
  - `patients/patient-drawer.tsx` — **~1400 líneas**, es el drawer principal del paciente que recepción usa a diario. Refactor delicado: múltiples tabs anidados, estado complejo de edición inline, keyboard shortcuts. Requiere sesión dedicada con tests manuales exhaustivos post-refactor.
  - `patients/bulk-import-modal.tsx` — parsing de CSV con edge cases numerosos (duplicados, DNIs inválidos, encoding). Pasar a Radix sin probar con 4-5 archivos reales es riesgoso.
  - **Plan sugerido:** abordar uno por commit, cada uno con una sesión de QA manual (crear paciente, editar, ver historia, importar 50 pacientes de prueba). No hacer en la misma sesión que otras cosas.
- [ ] **~13 copy edits restantes** (menores):
  - Status label `"Programada"` → `"Agendada"` en `scheduler/status enum` (requiere tocar i18n + `dashboard/doctor-dashboard.tsx:112` + `portal/mis-citas/page.tsx:193`). Riesgo: strings de display que aparecen en muchos reports y emails — validar antes de cambiar.
  - `"No asistió"` → decisión de producto (quedó como está; "Inasistencia" sonó más stiff en preview).
  - Resto: `"visitas"/"visita"` en tiles del portal, copy del footer "Reserva en línea", microcopy de ayuda. Listados en `docs/ux-review-2026-04-22.md`.
- [ ] **Dual design system cleanup** — portal iOS-flavored vs dashboard shadcn-tokens vs /book variante light. Unificar radius scale, color tokens semánticos, Button source-of-truth. Refactor grande — post-feedback de Vitra para priorizar qué unificar primero.
- [ ] **Public /book safety net** — sessionStorage del form progress, validación per-field, success screen con link a `/portal`.
- [ ] **Perf F-12** — `recharts` dynamic import en dashboard y reports.
- [ ] **Perf F-05** — AppointmentSidebar 4 awaits secuenciales → `Promise.all`.
- [ ] **3 `alert()` nativos** en `founder/integrations/page.tsx` (uso interno — menor prioridad).

### Criterios para retomar deuda diferida

- **Modales grandes** (`patient-drawer`, `bulk-import`): cuando haya una ventana sin pilot activo de 1 semana sin features nuevas. QA posterior: crear/editar/ver 5 pacientes + importar CSV de 50.
- **Design system**: cuando Vitra haya reportado 2-3 pantallas donde "no entendieron el botón" o "no encontraron el link" — eso dice qué unificar primero.
- **Perf F-12**: cuando `/dashboard` o `/reports` tarden >1s en carga inicial reportado por usuario real.
- **F-05 Redis**: cuando se active autoscale en Vercel o se suba a >1 clínica activa con tráfico simultáneo.

---

## 🏥 Historia Clínica

- [ ] **Importación masiva de códigos CIE-10** — La base ya permite agregar códigos personalizados uno a uno. Falta importar lotes (CSV/Excel) por especialidad para ahorrar tiempo a clínicas con muchos diagnósticos específicos.

- [ ] **Consentimiento informado — Tier 2: Templates configurables + PDF pre-llenado** — Extiende el MVP (Tier 1, v0.12.2) con la generación automática del documento de consentimiento a partir de plantillas de la clínica. Hoy el doctor escribe el consentimiento en Word/fuera del sistema; esto lo trae dentro y reduce 10 min por procedimiento.

  **Requiere**:
  - Nueva tabla `consent_templates`: `(id, organization_id, name, title, body_template, applies_to_service_ids uuid[], applies_to_specialty text, default_risks text, default_alternatives text, revocation_clause text, is_active, created_by)`.
  - `body_template` en Markdown/HTML con variables: `{{paciente_nombre}}`, `{{paciente_dni}}`, `{{paciente_edad}}`, `{{fecha}}`, `{{doctor_nombre}}`, `{{doctor_cmp}}`, `{{clinica_nombre}}`, `{{procedimiento}}`, `{{riesgos}}`, `{{alternativas}}`, `{{revocacion}}`.
  - Nueva tabla `consent_records` para auditoría formal: `(id, clinical_note_id, template_id, attachment_id, signed_at, revoked_at, signed_by_relationship)` — distingue cuando firmó el paciente vs. un tutor/representante.
  - Admin UI en `/admin/consent-templates` (CRUD similar a `discount-codes` y `treatment-plan-templates`): editor Markdown con preview en vivo, chip-toggle de servicios aplicables, plantillas seed por especialidad (cirugía menor, odontología invasiva, dermatología estética, anestesia local, procedimientos con radiación, uso de fotos clínicas para marketing).
  - Desde la nota clínica, botón **"Generar consentimiento PDF"** que:
    - Abre modal con los templates que matchean el servicio de la cita
    - Preview del PDF con variables ya interpoladas (datos del paciente + del doctor + de la clínica + del procedimiento)
    - Descarga `.pdf` listo para imprimir
    - Después de subir el escaneado firmado como adjunto, se crea automáticamente la fila en `consent_records` vinculando template + attachment + fecha firma
  - Seed de 5-8 plantillas base traducidas/adaptadas para Perú (basadas en modelos MINSA publicados).

  **Tiering comercial propuesto**: Professional y Enterprise. Justifica upgrade desde Starter porque ahorra tiempo operativo real (escribir consentimiento en Word → usar plantilla).

  **Dependencia**: `clinical_attachments` con `category='consent'` (ya existe), Tier 1 aplicado (v0.12.2).

- [ ] **Consentimiento informado — Tier 3: Firma digital en el portal** — Permite que el paciente firme el consentimiento desde su celular sin papel ni escáner.

  **Opciones técnicas** (a evaluar antes de implementar):
  - **Opción A — Canvas de firma manuscrita**: el paciente firma con el dedo/mouse en un `<canvas>`, se exporta como PNG, se embebe en el PDF generado. Legalmente válido bajo "firma electrónica simple" de la Ley 27269.
  - **Opción B — Aceptación electrónica con hash**: el paciente lee el documento en el portal, click "Acepto" → se guarda `{ document_hash, accepted_at, ip, user_agent, patient_user_id }`. El documento debe incluir cláusula explícita "la aceptación electrónica equivale a firma". Más ligero legalmente.
  - **Opción C — E-signature provider** (DocuSign, Adobe Sign, Firmador Perú): requiere contrato comercial con proveedor, costo por firma, pero tiene respaldo notarial.

  **Requiere**:
  - Nueva ruta `/portal/[slug]/consentimientos/[id]` con el documento renderizado y el flujo de firma
  - Endpoint `POST /api/portal/consentimientos/[id]/sign` que marca el `consent_records` como firmado
  - Notificación al doctor cuando el paciente firma
  - Decisiones de producto pendientes: ¿qué opción (A/B/C)?, ¿obligar revisión del doctor antes de activar firma digital?, ¿permitir revocación post-firma?

  **Prioridad**: baja. La mayoría de clínicas peruanas del segmento target siguen usando papel + foto de móvil (cubierto por Tier 1). Reevaluar cuando haya 3+ solicitudes específicas de clientes.

  **Dependencia**: Tier 2 aplicado (templates + PDF generador).

- [ ] **Consentimiento — Badge en ficha del paciente** — Pequeña mejora UX para cierre de bucle de auditoría. En el drawer del paciente, mostrar badge "⚠ N citas con procedimiento riesgoso sin consentimiento registrado" cuando haya citas `completed` con `services.requires_consent = true` y `clinical_notes.consent_registered = false`. Facilita que owner/admin identifique casos de incumplimiento antes de auditorías externas. Implementación: query simple + componente badge en `patient-drawer.tsx` header. ~1h de trabajo.

---

## 📅 Citas / Calendario

- [ ] **Generación automática de links de reunión Zoom/Meet** — Al crear una cita virtual:
  - Genera automáticamente un link de Zoom o Google Meet
  - El link se incluye en el email de confirmación y recordatorio
  - Se muestra en el sidebar de la cita con botón para copiar/abrir
  - Requiere: integración con Zoom API o Google Calendar API

- [x] **Generador de bloques de horarios disponibles (copiar al portapapeles)** — Botón Share en scheduler header → modal lazy-loaded con selector de doctor, rango de días (3/5/7/10), intervalo (15/30/45/60 min). Slots computados server-side descontando citas, bloqueos y horarios pasados. Chips seleccionables por día, preview en vivo, copiar al portapapeles para WhatsApp. *(v0.9.1 — 2026-04-19)*

- [ ] **Bloque de hora único en vista de calendario** — Actualmente se puede visualizar la agenda con diferentes intervalos (15min, 20min, 30min). Restricción: solo se puede seleccionar UN tipo de bloque a la vez en el view del calendar. No se permite mezclar 2 o más intervalos simultáneamente.

- [ ] **Integración con Google Calendar** — Sincronización bidireccional:
  - Las citas creadas en REPLACE se crean automáticamente en el Google Calendar del doctor
  - Incluye: título (paciente + servicio), hora, consultorio, notas
  - Requiere: OAuth2 con Google Calendar API
  - Configuración por doctor en su perfil (conectar/desconectar su Google Calendar)
  - Futuro: sincronización inversa (citas creadas en Google Calendar → REPLACE)

---

## 🧾 Facturación

- [x] **Boletas y facturas electrónicas vinculadas a SUNAT (MVP)** — Generar comprobantes de pago directamente desde el sistema. **Entregado en v0.13.0 (2026-04-25)** vía integración Nubefact:
  - ✅ Wizard de conexión en `Settings → Integraciones` (RUC, razón social, ubigeo, route + token, series autorizadas)
  - ✅ Modo sandbox y producción, con prueba de conexión live
  - ✅ Boleta + Factura (doc_type 1 y 2) — auto-sugerido por tipo de doc del cliente
  - ✅ Botón "Emitir comprobante" en sidebar de cita, con datos fiscales pre-llenados desde el paciente y servicio
  - ✅ Cálculo IGV correcto: precio del catálogo se trata como **incluido** (back-out a subtotal + IGV)
  - ✅ PDF, XML y CDR descargables; envío automático del PDF al email del paciente vía Nubefact
  - ✅ Card del comprobante emitido en sidebar de cita (estado SUNAT, número, link al PDF)
  - ✅ **Pago parcial / anticipos**: si la cita tiene `amount_paid < total_price`, el modal ofrece radio "Pagado / Total" con reescalado proporcional automático y sufijo `(pago parcial)` en la descripción del item — la boleta refleja exactamente el monto cobrado
  - ✅ Confirmación post-emisión: línea explícita en SuccessPanel mostrando a qué email se envió el PDF
  - ✅ **Forma + medio de pago SUNAT (Catálogo 59)**: heurística pura en `lib/einvoice/payment-mapper.ts` que mapea cualquier label de `lookup_values` (Yape/Plin/Tunki/BIM/Visa/Mastercard/Efectivo/Transferencia/Cheque/etc.) al código SUNAT correcto. Multi-tenant friendly — labels custom caen al fallback `099 Otros`, siempre válido. Pre-lleno desde el último `patient_payments.payment_method` de la cita, editable por el user.
  - ✅ **Warning Bancarización (Ley 28194)**: si `total ≥ S/2,000` (o USD 500) y el método es Efectivo, el modal muestra warning ámbar antes de emitir — el cliente perdería derecho a deducir IGV/costo. No bloquea, advierte. Es value-add real para clínicas con tickets grandes (FIV, paquetes de fertilidad).
  - ⏳ **Deuda menor** (post-pilot Vitra, target v0.13.1):
    - Rollback automático del correlativo local en errores no-retryables del provider (hoy solo se hace en error 23 = duplicado; bug detectado emitiendo con serie no autorizada que dejó número fantasma en B001 antes de corregir a BBB1). Fix: extender el bloque de `if (errorCode === "23")` en `app/api/einvoices/emit/route.ts` para cubrir códigos no-retryables.
    - **Notas de crédito (doc_type 3)** — anular comprobantes emitidos por error. Modal con selección del comprobante original + motivo + reescalado de items.
    - **Validación backend de `customer_address` requerido en facturas** (defense-in-depth: el frontend ya bloquea, falta espejarlo en Zod del emit route).
    - **Atomic UPDATE+RETURNING en correlativo** — hoy SELECT+UPDATE separados, race condition teórica de baja probabilidad pero existente.
    - **Dashboard de comprobantes emitidos** por periodo / tipo / estado SUNAT (hoy solo se ven embebidos en cada cita).
  - ⏳ **Deuda mayor** (post-v0.14):
    - Mapeo SUNAT explícito de métodos de pago en `Settings → Catálogos` (`sunat_payment_code` per-org). Hoy heurístico cubre 95%; el override manual es para clínicas con contador estricto.
    - Tipo "Anticipo" SUNAT (catálogo 12) con referencia al comprobante final por el saldo — alternativa contablemente más fina al reescalado proporcional actual. Levantar solo si una clínica grande lo pide.
    - Webhook / cron de polling SUNAT para refrescar estados PENDIENTE → ACEPTADO automáticamente.

- [ ] **Descuentos condicionales a tratamientos** — Aplicar descuentos por condiciones configurables:
  - Por cantidad de sesiones (ej: 10% si compra 10+ sesiones)
  - Por pago adelantado (ej: 5% si paga el tratamiento completo)
  - Por combinación de servicios (ej: limpieza + blanqueamiento = -15%)
  - Por vigencia temporal (ej: promoción válida hasta cierta fecha)
  - Configurable desde Admin → Tratamientos o Servicios

---

## 🧩 Módulos / Addons por Especialidad

- [ ] **Módulo de Laboratorio (addon `lab_integration`)** — Conexión con laboratorios, recepción de resultados digitales, asociación a historias clínicas y órdenes de exámenes. El addon seed ya existe en la tabla `addons`; falta la implementación de UI y flujos:
  - Recepción de resultados vía API o carga manual (PDF/imagen)
  - Vinculación automática con orden de examen existente
  - Visualización de resultados en timeline del paciente
  - Alertas de valores fuera de rango

- [ ] **Módulo Dermatología: antes/después con optimización de imágenes** — Addon `dermatology` ya registrado. Implementar:
  - Galería de fotos comparativas (antes/después) por zona corporal
  - Compresión y resize automático (max 1200px, WebP) para no agotar storage
  - Timeline visual de evolución de lesiones
  - Anotaciones sobre la imagen (marcadores, zoom)

- [ ] **Grabación de consulta + transcripción con IA** — Grabar audio de la consulta médica desde el navegador:
  - Transcribir con Whisper/similar
  - Generar automáticamente nota SOAP pre-llenada vía LLM
  - El doctor revisa, edita y firma
  - Requiere: evaluación de privacidad médica, consentimiento del paciente, y costos de API
  - Almacenamiento del audio opcional (configurable por org)

- [ ] **Bundle Consulta + Tratamiento** — Permitir crear un "paquete" que agrupe un servicio de consulta + sesiones de tratamiento en un solo cobro:
  - Precio bundle con descuento opcional
  - Al agendar, se crean la cita inicial + las sesiones del plan de tratamiento automáticamente
  - Tracking de progreso del bundle (sesiones completadas / pendientes)
  - Configurable desde Admin → Servicios

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
| ~~2~~ | ~~Bloques de horarios (copiar)~~ | ~~Medio~~ | ~~Alto (uso diario recepcionista)~~ | ✅ Entregado |
| ~~3~~ | ~~Estadísticas de edades~~ | ~~Bajo~~ | ~~Medio~~ | ✅ Entregado |
| 4 | Bloque hora único en calendar | Bajo | Medio (UX) | 🟡 Media |
| ~~5~~ | ~~Plantillas de tratamiento~~ | ~~Medio~~ | ~~Alto~~ | ✅ Entregado |
| 6 | Notificaciones periódicas | Medio | Alto (engagement) | 🟡 Media |
| 7 | Reporte IA por paciente | Alto | Alto (diferenciador) | 🟡 Media |
| 8 | Google Calendar sync | Alto | Alto (integración clave) | 🟠 Media-baja |
| 9 | Links Zoom/Meet automáticos | Alto | Medio (teleconsulta) | 🟠 Media-baja |
| ~~10~~ | ~~Facturación SUNAT (boletas/facturas)~~ | ~~Alto~~ | ~~Alto (requisito legal Perú)~~ | ✅ Entregado (v0.13.0, MVP con Nubefact) |
| 11 | CRM multi-canal (WhatsApp + IG + FB) | Muy alto | Muy alto (diferenciador) | 🟡 Media |
| ~~12~~ | ~~Catálogo CIE-10 personalizable~~ | ~~Medio~~ | ~~Alto~~ | ✅ Entregado |
| 13 | Descuentos condicionales | Medio | Medio (billing) | 🟠 Media-baja |
| 14 | Importación masiva CIE-10 (CSV) | Bajo | Medio | 🟠 Media-baja |
| 15 | Etiqueta "Paciente Recurrente" | Bajo | Alto (segmentación) | 🔴 Alta |
| 16 | Límites de plan: soft-wall UX | Medio | Alto (monetización) | 🔴 Alta |
| 17 | Storage: límites y mensajes | Medio | Alto (monetización) | 🟡 Media |
| 18 | Módulo Laboratorio (addon) | Alto | Alto (especialidades) | 🟡 Media |
| 19 | Grabación + transcripción IA | Muy alto | Muy alto (diferenciador) | 🟡 Media |
| 20 | Dermatología: antes/después | Alto | Alto (especialidades) | 🟡 Media |
| 21 | Bundle Consulta + Tratamiento | Medio | Alto (billing + UX) | 🟡 Media |
| ~~22~~ | ~~Portal del Paciente Phase 1~~ (auth + mis citas + cancelar) | ~~Muy alto~~ | ~~Muy alto~~ | ✅ Entregado |

---

*Este archivo se actualiza continuamente. Cada feature completada se mueve al changelog del PRD.md.*
