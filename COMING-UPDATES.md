# Coming Updates — Yenda

> **Última actualización:** 2026-05-02 (v0.14.x — fertility addon entregado)
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

- [x] **Brief Ejecutivo IA — Slice C (Capa 1 mínima)** — Migración 114 (`ai_executive_briefs`), endpoint `POST /api/ai-briefs/generate` con Haiku 4.5 + comparativa periodo anterior, widget en dashboard del admin con modal (selector week/month/custom + Print/PDF). Sin cron, sin email, sin historial — eso queda para Capa 1 completa. Permite iterar el prompt con datos reales antes de automatizar. Reusa `get_report_metrics_for_ai` (migración 056) sin RPC nueva. *(v0.13.5 — 2026-04-26)*
- [x] **Botón Imprimir/PDF en Reporte IA de /reports** — Patrón estándar del proyecto: ventana nueva con HTML A4 estilizado + auto-print del navegador (que ofrece "Guardar como PDF"). El header del PDF incluye tipo de reporte, rango de fechas y timestamp. *(v0.13.5 — 2026-04-26)*
- [x] **Pricing alineado: Independiente S/129, Centro Médico S/349, Clínica S/649** — Migración 112 actualiza catálogo `plans` (precios mensual + anual con 2 meses gratis). Trial 14 días: activo en Independiente y Centro Médico, **desactivado en Clínica** (contratación directa con `403 trial_unavailable` en backend + botón "Iniciar prueba" oculto en UI). Anchor copy actualizado en `pricing.tsx`, `select-plan/page.tsx`, `dashboard/plans/page.tsx`, `growth-path.tsx`, `final-cta.tsx`, `app/layout.tsx` (meta description), `admin/members` y `admin/offices` (botones upgrade). Política: orgs en plan gratuito existentes NO se migran automáticamente (decisión del owner). Frecuencia semestral (8.3% off) en evaluación. *(v0.13.3 — 2026-04-26)*
- [x] **Reporte IA básico (todos los planes) en /reports** — Asistente conversacional con queries SQL pseudonimizadas. Propuesta de "Reporte IA avanzado" para Centro/Clínica (5 capas: brief ejecutivo automatizado, insights proactivos, forecast/predictivo, comparativo multi-doctor, benchmarking anónimo) discutida en sesión 2026-04-26 — recomendación: arrancar capas 1+2 cuando se reactive trial Clínica. *(v0.10.0 — 2026-04-20)*
- [x] **Rediseño UX del Modal de Historia Clínica** — Tokens compartidos en `lib/clinical-ui-tokens.ts` (h-9 / h-11 CTAs por dominio), modal scheduler ampliado a 1480/1680px en xl/2xl, columna derecha con tabs (Recetas/Exámenes/Tratamientos/Seguimientos) y badges numéricos en lugar de stack vertical, header sticky con CTAs globales (Guardar/Firmar/Imprimir + atajo Ctrl+S + auto-save indicator), badge "Firmada" en ámbar (estado bloqueado/atención), vitales `lg:grid-cols-8` en wide layout, `ClinicalNotePanel` con `forwardRef` + `onStateChange` (eliminado polling de 2s), estados vacíos accionables en los 4 paneles laterales, `clinical-history-modal` hermano ampliado para coherencia. *(v0.13.2 — 2026-04-26)*
- [x] **Adjuntos clínicos: dropzone real con drag-and-drop** — Botón "+ Subir archivo" del header migra a token compartido (h-9 / variante orange). Dropzone py-10 con border dashed, ícono Upload de 6×6 y 3 estados visuales (idle / drag-active naranja / file-selected esmeralda). Drag-and-drop nativo + click + Enter/Space (accesibilidad). Validación cliente de tamaño 10 MB. Estado vacío accionable: si no hay adjuntos, el dropzone se muestra automáticamente. Form de categoría/descripción aparece solo después de seleccionar archivo. *(v0.13.2 — 2026-04-26)*
- [x] **Eje Y visible en gráfico "Citas últimos 30 días"** — `admin-dashboard.tsx`: el `<AreaChart>` tenía `margin={{ left: -20 }}` que empujaba el `<YAxis>` fuera del contenedor. Cambio a `left: 0` + `width: 32` para renderizar los valores numéricos del eje completos. *(v0.13.2 — 2026-04-26)*
- [x] **Fix: doctores quedaban con horario vacío al fallar el save** — `admin/doctors/[id]/page.tsx`: el flujo `DELETE all + INSERT new` dejaba al doctor con CERO horarios si el INSERT fallaba (típicamente por `UNIQUE(doctor_id, day_of_week, start_time)`). Validación frontend antes del save (detecta duplicados y rangos `end_time <= start_time`), resaltado visual con border + ring rojos y mensaje inline en cada bloque ofensivo, snapshot + restore del horario previo si el INSERT falla por otra causa. *(v0.13.2 — 2026-04-26)*
- [x] **Consultorios autorizados por doctor (`doctor_offices`)** — Migración 111 con tabla nueva `doctor_offices(doctor_id, office_id, organization_id)`, UNIQUE composite, RLS por `is_org_admin`. Sección UI nueva "Consultorios autorizados" arriba del horario semanal con multi-select (1/2/3 columnas). El `<select>` de consultorio por bloque se filtra a los autorizados; valores antiguos no autorizados se exponen marcados para corrección. Validación al guardar: si un bloque usa un consultorio fuera del set autorizado, identifica el bloque ofensivo. Save atómico-cliente con snapshot+restore para ambas tablas. Resuelve el caso "Dra. Ángela atiende solo en 202 y 203" que antes chocaba con la constraint UNIQUE. *(v0.13.2 — 2026-04-26)*
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

## 🧠 Reporte IA Avanzado — diferenciador para Centro Médico y Clínica (aprobado v0.13.4)

> **Driver comercial:** el plan Independiente ya tiene Reporte IA básico (Asistente conversacional en `/reports`). Para justificar el upgrade Centro→Clínica (S/349 → S/649) necesitamos features que requieran *naturalmente* el volumen de datos del tier alto. Propuesta aprobada: **arrancar con Capas 1+2** (sesión 2026-04-26).

### Capa 1 — Brief Ejecutivo Automatizado por Email + Dashboard Widget

#### ✅ Slice C entregado (v0.13.5 — 2026-04-26)

Trigger manual desde el dashboard del admin/owner. Sirve para iterar el prompt y validar calidad del LLM con datos reales antes de invertir en automatización.

**Lo que ya funciona:**
- Migración 114 — tabla `ai_executive_briefs(organization_id, generated_by, period, period_start, period_end, content_markdown, metrics_snapshot JSONB, llm_model, llm_tokens_input/output, generated_at)` con RLS por org members + admin delete.
- Endpoint `POST /api/ai-briefs/generate` (admin/owner only, feature-gated por `feature_ai_assistant`):
  - Reusa `get_report_metrics_for_ai` (migración 056) que ya tiene `appointments_prev`, `revenue_prev`, `patients.new_prev_period` → comparativa periodo anterior built-in.
  - Resuelve fechas server-side: `week`=últimos 7d, `month`=últimos 30d, `custom`={date_from, date_to}.
  - Bloquea si `total_appointments < 3` (datos insuficientes).
  - Llama Anthropic Haiku 4.5 con prompt narrativo en 4 secciones (Volumen y agenda · Finanzas · Doctores y servicios · Alertas accionables), `temperature 0.3`, `max_tokens 1024`, máx 350 palabras.
  - Persiste el brief y retorna `{id, period, period_start, period_end, content_markdown, generated_at}`.
- Componente `ExecutiveBriefWidget` en `app/(dashboard)/dashboard/executive-brief-widget.tsx`:
  - Card con gradient emerald, badge "Beta", lock + badge PRO si plan no incluye IA.
  - Modal con selector de periodo (week/month/custom + date pickers), AiLoader, error con CTA upgrade, resultado en markdown renderizado, botones regenerar + Print/PDF + cerrar.
  - Renderer markdown ligero inline (h2/p/ul/strong/em) sin dependencias externas.
- Mount en `admin-dashboard.tsx` justo después del header, antes del primer grid de KPI cards.
- Schema Zod `aiBriefGenerateSchema` con refine para que `custom` requiera `date_from` y `date_to`.

#### 🔴 Resto de Capa 1 pendiente (~3-5 horas estimadas)

**Email automático:**
- Templates nuevos en `lib/email-templates/`:
  - `ai_executive_brief_weekly.html` — para Clínica, enviado los Lunes 7am hora local de la org.
  - `ai_executive_brief_monthly.html` — para Centro Médico + Clínica, enviado el día 1 de cada mes 7am.
- Variables del template: `{{org_name}}`, `{{period_label}}`, `{{period_dates}}`, `{{brief_html}}` (markdown convertido a HTML), `{{dashboard_url}}` (link al dashboard).
- Renderizar markdown del brief a HTML con el mismo helper que ya está en `executive-brief-widget.tsx` pero extraído a `lib/markdown-to-html.ts` para reuso entre cliente y servidor.
- Recipient: `email_settings.notification_emails` de la org (ya existe).
- Dedupe: usar el `UNIQUE (organization_id, period, period_start)` que vamos a agregar a `ai_executive_briefs` como segunda migración (115). Hoy no está para permitir regeneraciones manuales libres.

**Cron (Vercel Cron Jobs):**
- Nuevo endpoint `POST /api/cron/ai-briefs` autenticado por header `Authorization: Bearer <CRON_SECRET>`.
- En `vercel.json`:
  ```json
  {
    "crons": [
      { "path": "/api/cron/ai-briefs?cadence=weekly", "schedule": "0 12 * * 1" },
      { "path": "/api/cron/ai-briefs?cadence=monthly", "schedule": "0 12 1 * *" }
    ]
  }
  ```
  (Vercel cron corre en UTC; 12 UTC = 7am Lima. Si en el futuro hay orgs en otras zonas horarias, el cron filtra por `org_settings.timezone` y solo procesa las que matchean la hora local.)
- Lógica:
  1. Listar todas las orgs activas con plan que incluye `feature_ai_assistant`.
  2. Filtrar las que tienen tier correcto: `weekly` solo Clínica, `monthly` Centro Médico + Clínica.
  3. Para cada org: llamar a la lógica del endpoint `/api/ai-briefs/generate` (extraída a `lib/ai-briefs/generate.ts`).
  4. Después de generar y persistir, enviar el email vía `lib/email-sender.ts`.
  5. Logging robusto: si la generación o el email falla para una org, no rompe las demás. Loggea a `system_logs` (o tabla similar).
- Idempotencia: si la cron corre dos veces el mismo día, el `UNIQUE (org, period, period_start)` previene duplicados (devuelve 409 silenciosamente).

**Página de historial `/dashboard/briefs`:**
- Nueva ruta `app/(dashboard)/dashboard/briefs/page.tsx`.
- Lista paginada de los briefs históricos de la org (ya están en `ai_executive_briefs`).
- Filtros: por cadencia (week/month/custom), por rango de fechas.
- Cada brief en card colapsable con: dates, modelo usado, botón "Ver completo" (modal igual que el widget) + Print/PDF + Eliminar (admin only).
- Endpoint `GET /api/ai-briefs?cadence=&from=&to=&page=&limit=` con paginación cursor-based.
- Link al historial desde el widget del dashboard ("Ver historial →").

**Widget en `/reports`:**
- Card en el sidebar derecho de `/reports/page.tsx` con los **últimos 3 briefs**.
- Cada uno colapsable, click expande inline (no modal).
- Botón "Generar brief de este periodo" que toma el `dateFrom`/`dateTo` actual del filtro de `/reports` y dispara `POST /api/ai-briefs/generate` con `period: "custom"`.
- Justifica que el brief vive *también* en `/reports` para conectarlo con el flujo "estoy mirando reportes y quiero un resumen rápido".

**PHI Pseudonimization (importante por compliance):**
- Hoy el LLM ve `top_doctors[].name` real (nombres completos de doctores). Para cumplir con buenas prácticas, antes de mandar el payload al LLM:
  - Reemplazar nombres de doctores con tokens: `Dr. García` → `Doctor_001`, `Dra. López` → `Doctor_002`.
  - Mantener el mapping en memoria solo durante la generación.
  - Re-mapear los tokens en el output del LLM antes de persistirlo.
- Reusar `lib/pseudonymize-phi.ts` (v0.12.4). Actualmente solo pseudonimiza pacientes; extender para doctores.
- El `metrics_snapshot` que se persiste en BD también debe ir pseudonimizado (audit trail seguro).
- El brief en BD (`content_markdown`) puede tener nombres reales o tokens, según lo que decidas. Recomendación: tokens en BD, re-mapeo on-the-fly al renderizar.

**Decisiones pendientes para esta fase:**
- [ ] **Modelo LLM final**: ¿queda Haiku 4.5 o subimos a Sonnet 4.6? Decidir tras iterar 3-5 briefs reales con datos de Vitra y comparar.
- [ ] **Frecuencia configurable por owner**: ¿el owner del Centro Médico puede pedir brief semanal aunque no esté en su tier? Decisión comercial.
- [ ] **Almacenamiento del mapping pseudonimización**: ¿en BD cifrado (`mapping_encrypted JSONB`) o en memoria solo durante el render? La opción "en BD cifrado" permite auditar después; "memoria" es más privada pero pierde trazabilidad.
- [ ] **Tracking de apertura de email**: pixel tracking (Resend lo soporta) para medir engagement. Definir si lo activamos o no por privacidad.

**Migración 115 (a crear cuando arranquemos):**
```sql
-- Idempotencia para cron
ALTER TABLE ai_executive_briefs
  ADD CONSTRAINT ai_executive_briefs_org_period_start_unique
  UNIQUE (organization_id, period, period_start);

-- Tracking de envío de email
ALTER TABLE ai_executive_briefs
  ADD COLUMN sent_to_emails TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN email_sent_at TIMESTAMPTZ;
```

**Archivos nuevos esperados (~7):**
- `lib/markdown-to-html.ts`
- `lib/ai-briefs/generate.ts` (lógica extraída del endpoint actual)
- `lib/ai-briefs/send-email.ts`
- `lib/email-templates/ai-executive-brief-weekly.html`
- `lib/email-templates/ai-executive-brief-monthly.html`
- `app/api/cron/ai-briefs/route.ts`
- `app/api/ai-briefs/route.ts` (GET listing)
- `app/(dashboard)/dashboard/briefs/page.tsx`

**Variables de entorno nuevas:**
- `CRON_SECRET` — bearer token para autenticar las llamadas del cron de Vercel.

---

### Capa 2 — Insights Proactivos (anomalías + acciones)

**Estado:** 🔴 Pendiente · **Tier:** Centro Médico + Clínica · **Esfuerzo:** Medio (3-4 sem) · **Depende de:** Capa 1 estable

**Definición:** El sistema detecta automáticamente patrones operativos/clínicos accionables y notifica al admin/owner *sin* que pregunten. Convierte el SaaS de pasivo (consultas) a activo (te avisa).

**Tipos de insights** (mínimo viable):

| # | Insight | Detection logic | Severidad |
|---|---|---|---|
| 1 | **No-show pattern por slot** | Doctor X tiene >30% no-show en slot recurrente vs <10% promedio del doctor | media |
| 2 | **Riesgo de churn de paciente** | Paciente con 3+ citas históricas + 60+ días sin volver + sin email reactivación enviado | alta |
| 3 | **Follow-up gap** | Pacientes con `clinical_followups.is_resolved=false` y `follow_up_date < now()` | alta |
| 4 | **Caída de ingresos por servicio** | Servicio X bajó >25% MoM | media |
| 5 | **Doctor subutilizado** | Doctor con <40% de su capacidad teórica de slots ocupados | baja |
| 6 | **Plan de tratamiento sin progreso** | Plan activo con 30+ días desde última sesión completada | media |
| 7 | **Cobros pendientes >60 días** | Pacientes con saldo positivo > S/0 y última cita > 60 días | alta |
| 8 | **Bloqueo de agenda inusual** | Bloqueo creado para horario en pico histórico de demanda | baja |

**Trigger:**
- Cron diario (4am hora local de la org) que corre detectores estadísticos simples (sin LLM).
- LLM solo se invoca para generar la narrativa del insight (1-2 frases) cuando hay match.
- Throttling: máximo 5 insights nuevos/día/org para no saturar.

**Tabla nueva:**
```sql
-- migración futura ~116_ai_insights.sql
CREATE TABLE ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,  -- 'no_show_pattern' | 'churn_risk' | etc.
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,   -- narrativa generada por LLM (1-2 frases)
  action_label TEXT,           -- "Ver paciente", "Bloquear slot", etc.
  action_url TEXT,             -- deep link a la página relevante
  related_entity_type TEXT,    -- 'patient' | 'doctor' | 'service' | etc.
  related_entity_id UUID,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_ai_insights_org_active ON ai_insights(organization_id) WHERE dismissed_at IS NULL;
-- RLS: org members read, admins dismiss
```

**UI surface:**
- **Widget en `/dashboard`** (admin/owner): card "Insights IA" con badge numérico de insights activos. Top 3 visibles, "Ver todos" lleva a `/dashboard/insights`.
- **Notification dot en topbar**: badge rojo cuando hay insights `severity=high` no leídos.
- **Página `/dashboard/insights`** completa con filtros por tipo, severidad, fecha. Cada insight tiene CTAs: "Resolver" (oculta y registra acción), "Recordarme luego" (snooze 7d), "Ver detalle".
- **Email opcional**: si `notification_settings.ai_insights_email = true`, digest diario o instant para `severity=high`.

**Costo estimado:** ~10k tokens/insight (solo narrativa). 5 insights/día/org × 30 días = 150 insights/mes × ~S/0.10 = S/15/mes/org. Alto pero justifica el tier Clínica.

**Privacidad:**
- IDs y métricas sí pueden ir al LLM. Los nombres se inyectan client-side al renderizar.
- El detector estadístico corre 100% en Postgres (sin LLM) — no hay PHI saliendo del DB para esa parte.

**Métricas de éxito:**
- Tasa de "Resolver" (admin actuó sobre el insight) > 40%.
- Tasa de "Dismiss" (no aplica / ruido) < 25%.
- Reducción medible de no-shows o churn 3 meses post-release vs baseline.

**Dependencies:**
- Capa 1 funcional (mismo stack: cron + LLM wrapping).
- Definir thresholds en `org_settings.ai_insights_config` (calibrable por org).

**Riesgos:**
- **Insight fatigue**: si saturamos al admin, dejan de mirarlos. Mitigación: throttle estricto, severidad bien calibrada, snooze fácil.
- **Falsos positivos**: empezar con detectores conservadores y ampliar tras feedback.
- **Sensibilidad social** (insight #5 doctor subutilizado): visible solo para owner/director, NUNCA expuesto al doctor mismo. UI con permission check estricto.

---

### Capa 3 — Forecast / Análisis Predictivo

**Estado:** 🔴 Pendiente · **Tier:** Solo Clínica · **Esfuerzo:** Alto (6-8 sem) · **Depende de:** Capas 1+2 estables · **Activación:** cuando una org tenga >500 citas históricas (sino el modelo no es confiable)

**Definición:** ML estadístico (no LLM) que predice comportamiento futuro de la clínica. Usa Postgres + libs de ML simples (no necesita TensorFlow); tres modelos por separado.

**Sub-features:**

#### 3.1 — Predicción de demanda por servicio/doctor (4-12 semanas)
- **Input:** historial de citas agrupadas por (week, service_id, doctor_id) últimas 52 semanas.
- **Modelo:** ARIMA simple o regresión lineal con dummies estacionales (mes, día de semana). Implementable en SQL puro con `regr_slope`, `regr_intercept` o vía un job Python serverless.
- **Output:** tabla `ai_forecasts(organization_id, target_type, target_id, week_start, predicted_count, confidence_low, confidence_high, model_version, generated_at)`.
- **UI:** widget en `/dashboard/forecasts` con gráfico de línea histórica + zona sombreada de predicción + intervalo de confianza. Cada punto tiene tooltip "predicción para semana del X: Y citas (rango: A-B)".
- **Acción accionable:** "Próximas 4 semanas se proyecta caída de 15% en Cardiología — considera ajustar horario del doctor X o lanzar campaña."

#### 3.2 — No-show risk score por cita
- **Input al modelo:** features por cita = {paciente_no_show_rate_historico, dias_desde_agendamiento, hora_del_dia, dia_de_semana, doctor_id, servicio_id, es_primera_visita, telefono_validado, email_validado}.
- **Modelo:** regresión logística entrenada offline (Python/scikit-learn) sobre histórico, exportada como conjunto de coeficientes a una tabla `ai_no_show_model_weights`. La inferencia corre en SQL/JS.
- **Output:** columna nueva `appointments.no_show_risk_score NUMERIC(3,2)` (0.00 a 1.00) actualizada por trigger cuando se crea/edita cita o cuando faltan <48h.
- **UI:** flag visual en agenda y en `appointment-sidebar`: "🟡 Riesgo medio (45%)" o "🔴 Riesgo alto (78%)". Lista filtrable "Citas con alto riesgo en próximas 48h" en dashboard de recepción.
- **Acción accionable:** sugerir confirmar manualmente las citas con score > 0.6 el día anterior. Posible auto-trigger de segunda llamada de WhatsApp si > 0.75.

#### 3.3 — Churn risk score por paciente
- **Input:** features por paciente = {dias_desde_ultima_cita, citas_ultimo_año, ticket_promedio, especialidad_principal, edad, distrito, sin_seguimientos_resueltos}.
- **Modelo:** misma técnica que 3.2.
- **Output:** columna `patients.churn_risk_score NUMERIC(3,2)` recalculada nightly.
- **UI:** filtro en `/patients` "Pacientes en riesgo de churn", badge en drawer con score. Lista priorizada para campaña de reactivación.
- **Acción accionable:** integración con feature de email de reactivación (90+ días) — el cron diario que ya existe puede priorizar a los de score alto primero.

**Migraciones esperadas:**
- 117 — `ai_forecasts` table
- 118 — `appointments.no_show_risk_score` column + trigger
- 119 — `patients.churn_risk_score` column + scheduled refresh
- 120 — `ai_no_show_model_weights` y `ai_churn_model_weights` (coeficientes)

**Decisiones pendientes:**
- [ ] **Entrenamiento del modelo**: ¿corre en cloud externo (Modal, Replicate) o tenemos un Python service propio? Para 1-2 clínicas, un script offline bastaría (yo entreno y commiteo los coeficientes).
- [ ] **Versionado de modelo**: cada org puede tener sus propios coeficientes (modelo per-org cuando hay >2000 citas) o usar coeficientes globales hasta que escalemos.
- [ ] **Visualización**: ¿gráficos de Recharts con sombras de confianza o algo más simple tipo "número grande + flecha"? El primero comunica mejor la incertidumbre, el segundo es más fácil de leer.

**Riesgos:**
- **Predicción mala con poca data**: requiere mínimo 12 semanas de histórico. Mostrar "Datos insuficientes para predicción confiable" hasta llegar al threshold.
- **Sesgo en el modelo de churn**: pacientes que vienen 1 vez al año (chequeos anuales) podrían marcarse como churn falsamente. Definir threshold por especialidad.
- **Exposure de scoring a doctores**: el churn score puede sentirse invasivo si lo ven los doctores. UI restrictiva: solo owner/director.

---

### Capa 4 — Comparativo Multi-Doctor (Performance Internal)

**Estado:** 🔴 Pendiente · **Tier:** Solo Clínica con 3+ doctores activos · **Esfuerzo:** Medio (2-3 sem) · **Depende de:** Capas 1+2 · **Activación:** después de Vitra; validar sensibilidad social con el cliente antes

**Definición:** Reportes comparativos entre doctores de la misma clínica, accesibles **solo para owner/director médico**. Sirve para reuniones 1-on-1, evaluación de desempeño y detección temprana de problemas.

**Métricas comparativas:**

| Categoría | Métrica | Fuente |
|---|---|---|
| **Productividad** | Citas/semana, citas completadas, ingresos generados | `appointments` + `services.base_price` |
| **Calidad clínica (proxy)** | % notas SOAP firmadas en <48h, planes de tratamiento creados, % follow-ups resueltos | `clinical_notes`, `treatment_plans`, `clinical_followups` |
| **Continuidad** | % pacientes recurrentes, retención a 90 días | `appointments` agrupadas por `patient_id`, `doctor_id` |
| **Eficiencia** | Tiempo promedio por consulta vs duración configurada del servicio | `appointments` + `services.duration_minutes` |
| **No-shows** | % no-shows por doctor (con threshold contextual de su especialidad) | `appointments WHERE status IN ('scheduled','confirmed') AND date < CURRENT_DATE` |
| **Tendencia (vs mes anterior)** | Delta de cada métrica MoM | comparativa con periodo anterior |

**UI surface:**
- Página nueva `/dashboard/team-performance` (admin only).
- Sección "Vista trimestral" con tabla comparativa, doctores en filas, métricas en columnas. Cada celda con sparkline de las últimas 12 semanas.
- Sección "Brief individual por doctor" con un narrativo IA del trimestre del doctor X (reusa el motor de Capa 1 pero pasando filtro `doctor_id`).
- Modo "Anonimizado" con switch que reemplaza nombres por "Doctor 1, Doctor 2..." para presentaciones a juntas o cuando se quiere compartir un screenshot.
- Botones Print/PDF para exportar y llevar a la 1-on-1.
- Filtros por especialidad, tipo de doctor, periodo (último trimestre / semestre / año).

**Endpoints:**
- `GET /api/team-performance?from=&to=&specialty=` — devuelve agregado de todos los doctores con sus métricas.
- `POST /api/ai-briefs/generate` extendido con `subject_type: "doctor", subject_id: <uuid>` para generar el brief por doctor.

**Tabla nueva:**
```sql
-- migración 121 - cache de comparativos
CREATE TABLE ai_team_performance_snapshots (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payload JSONB NOT NULL,  -- todas las métricas pre-calculadas
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, period_start, period_end)
);
```

**Privacidad y permisos (CRÍTICO):**
- **NUNCA visible para los doctores mismos** sobre sus pares. Solo `role IN ('owner','admin','director_medico')`.
- Si el doctor entra a `/dashboard/team-performance`, redirect 403.
- Documento legal: agregar cláusula de "evaluación interna del desempeño" en el contrato laboral del doctor (es estándar en clínicas serias).
- Audit log: cada vez que alguien abre el comparativo, queda registro en `audit_logs(user_id, action='view_team_performance', timestamp)`.

**Decisiones pendientes:**
- [ ] **¿Métricas visibles vs ocultas en el comparativo?** Algunas pueden ser controvertidas (ej: ticket promedio por doctor → el doctor podría sentirse evaluado por dinero, no por calidad). Curar la lista con feedback de Vitra.
- [ ] **¿Top performer reconocido públicamente?** Función "compartir como reconocimiento al equipo" — por ahora NO, evita comparaciones tóxicas. Reevaluar.
- [ ] **¿Permitir que el doctor vea SUS propias métricas?** (no las de pares). Página separada `/dashboard/my-performance` con solo sus números. Esto sí es positivo, refuerza.
- [ ] **Threshold de "alerta" en métricas**: definir baseline por especialidad. Un dermatólogo y un ginecólogo no son comparables 1-a-1.

**Riesgos:**
- **Sensibilidad social**: doctores molestos si descubren que son comparados sin saberlo. Mitigación: cláusula contractual + transparencia con el equipo.
- **Métricas mal interpretadas**: "Doctor A genera más ingresos" puede ser por más tiempo en la clínica, no por mejor desempeño. El brief IA debe contextualizar (ej: "ajustado por horas trabajadas").
- **Sesgo de servicios**: un doctor que solo ve consultas estándar siempre va a tener menor ticket que uno que hace procedimientos complejos. Normalizar por mix de servicios.

---

### Capa 5 — Benchmarking Anónimo entre Clínicas

**Estado:** 🔴 Pendiente (12+ meses) · **Tier:** Solo Clínica · **Esfuerzo:** Muy Alto (8-12 sem) · **Depende de:** 10+ clínicas activas para significancia estadística + reglas legales claras

**Definición:** "Tu tasa de no-shows está 12% sobre el promedio del segmento de ginecología en Lima." Comparativa anónima de la clínica del usuario contra el promedio del segmento (especialidad + región + tamaño).

**Por qué no se puede empezar antes:** matemáticamente necesita un mínimo de 10 organizaciones similares para que el benchmark sea estadísticamente significativo y, simultáneamente, no permita identificar a una clínica individual (k-anonymity con k>=5 mínimo).

**Métricas benchmark candidatas:**

| Métrica | Por qué es útil | Sensibilidad |
|---|---|---|
| Tasa de no-shows | Punto de comparación universal | Baja |
| Tasa de cancelación | Calidad de comunicación previa | Baja |
| Tiempo promedio de espera | Eficiencia operacional | Media |
| % pacientes recurrentes a 6 meses | Calidad clínica + retención | Media |
| Ticket promedio (rangos) | Posicionamiento de pricing | **Alta** — competitiva |
| Mix de servicios más frecuentes | Posicionamiento estratégico | **Alta** |
| Días de la semana más demandados | Optimización de horarios | Baja |
| % conversión de leads (de fuentes con tracking) | Eficiencia comercial | Media |

**Segmentación del benchmark:**
- **Por especialidad principal** (`organizations.primary_specialty`): ginecología, dermatología, pediatría, etc.
- **Por región**: Lima Metropolitana, Lima Provincias, Norte, Sur, Centro, Selva. (Más granular tipo distrito sería identificable.)
- **Por tamaño**: 1 doctor, 2-5 doctores, 6+ doctores.
- **Por antigüedad**: <1 año, 1-3 años, 3+ años.

**Tabla benchmark:**
```sql
-- migración 122 - benchmarks calculados nightly
CREATE TABLE ai_benchmarks (
  id UUID PRIMARY KEY,
  segment_specialty TEXT NOT NULL,
  segment_region TEXT NOT NULL,
  segment_size_bucket TEXT NOT NULL,  -- 'solo','2-5','6+'
  metric_key TEXT NOT NULL,
  metric_value_p25 NUMERIC,
  metric_value_p50 NUMERIC,
  metric_value_p75 NUMERIC,
  metric_value_p90 NUMERIC,
  sample_size INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (segment_specialty, segment_region, segment_size_bucket, metric_key, computed_at)
);
-- Solo se exponen segmentos con sample_size >= 5 (k-anonymity)
```

**UI surface:**
- Card "Tu posición en el mercado" en `/dashboard` con 3-5 métricas principales y barra horizontal mostrando dónde está la clínica vs P25/P50/P75 del segmento.
- Página completa `/dashboard/market-position` con análisis detallado por métrica.
- Recomendaciones IA ("Estás en el P30 de no-shows — clínicas similares en P75 lo logran con confirmación 24h antes").

**Privacidad y compliance (CRÍTICO):**
- **NUNCA mostrar números absolutos del segmento** que permitan triangular qué clínica es. Solo percentiles agregados.
- **k-anonymity ≥ 5**: no exponer benchmark si hay <5 clínicas en el segmento.
- **Opt-in del cliente**: cada clínica debe aceptar explícitamente "compartir mis métricas anonimizadas para benchmarking" en T&C o setting separado. Sin opt-in, la org no aparece en el agregado pero tampoco accede al benchmark.
- **Contractual**: el benchmark puede ser un addon Pro adicional (S/50/mes) o incluido en Clínica.
- **GDPR/Ley 29733 compatible**: las métricas son agregados, no datos individuales. Sin embargo, el opt-in es buena práctica.

**Decisiones pendientes:**
- [ ] **¿Quién hace el opt-in?** El owner al firmar contrato, o un setting visible en `/settings/privacy` que el cliente puede activar/desactivar.
- [ ] **¿Mostrar segmento o percentil?** "Estás en el top 25%" vs "Tu valor: X, segmento: Y" — el primero es más diplomático, el segundo más informativo.
- [ ] **Frecuencia de cálculo**: nightly batch o weekly. Empezar weekly y subir a daily si hay demanda.
- [ ] **Bench cross-país**: si llegamos a México/Colombia, ¿benchmark internacional o por país? Por país por homogeneidad de mercado.
- [ ] **Modelo de monetización**: ¿addon separado (S/50/mes Pro) o incluido en Clínica? Argumento por ahora: incluir en Clínica como argumento de venta de "no estás solo, te comparamos con tus pares".

**Riesgos:**
- **Reverse engineering**: con suficiente data y curiosidad, una clínica grande podría intentar identificar a competidores. Mitigación: percentiles, no rankings; sample_size mínimo; segmentos amplios.
- **Métricas competitivas sensibles**: el "ticket promedio" puede ser visto como precio de mercado, lo que afecta posicionamiento. Considerar omitir o dar solo rangos amplios (P25-P75).
- **Engaño por gaming**: una clínica podría inflar métricas (ej: marcar como "completed" cosas que no lo son) para verse bien en el benchmark. Auditar las flags de calidad clínica antes de publicarlas.

---

### Roadmap sugerido

1. **Q2 2026 (in progress)** — Capa 1: Slice C entregado (v0.13.5). Resto de Capa 1 (cron + email + historial + widget en /reports + PHI pseudo) pendiente. Estimado: 3-5h.
2. **Q2-Q3 2026** — Capa 2 (Insights Proactivos) — al menos 4 tipos de detector funcionando.
3. **Q3 2026** — Reactivar trial Clínica con Capas 1+2 como argumento de venta.
4. **Q4 2026** — Capa 3 (Forecast/Predictivo) si hay >500 citas históricas en alguna org.
5. **2027 H1** — Capa 4 (Comparativo multi-doctor) si Vitra valida sensibilidad social.
6. **2027 H2 / 2028** — Capa 5 (Benchmarking anónimo) si hay 10+ clínicas activas.
4. **2027+** — Capas 3-5 según señal del mercado.

### Decisiones pendientes (cuando vayamos a implementar)

- [ ] **Idioma del brief**: ¿solo español o también inglés? (Vitra es Perú, default ES.)
- [ ] **Frecuencia configurable**: ¿el owner puede elegir semanal vs mensual o es por tier?
- [ ] **Modelo LLM**: Sonnet 4.6 (S/0.50/brief) vs Haiku 4.5 (S/0.10/brief). Probar ambos en pilot.
- [ ] **Almacenamiento del mapping de pseudonimización**: ¿en BD cifrado o en memoria solo durante el render?
- [ ] **A/B test del primer brief**: enviar a 50% de owners en periodo X y medir engagement vs grupo control.

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
- [ ] **Slug `'starter'` literal en 7 archivos — auditar y migrar al helper `isIndependientePlanSlug()`** (mig 133 ya consolidó la DB a `'independiente'`). Las comparaciones `plan.slug === 'starter'` o `!== 'starter'` en estos archivos hoy nunca matchean (porque la DB tiene `'independiente'`), generando bugs de gating silenciosos:
  - `app/api/plans/route.ts` (status / trial_ends_at de subscription)
  - `app/api/ai-assistant/route.ts` (default fallback)
  - `app/api/discount-codes/route.ts` y `apply/route.ts` (gating de discount codes — hoy NO se gatean)
  - `app/api/ai-reports/route.ts` (default fallback)
  - `app/(dashboard)/admin/discount-codes/page.tsx` (`isPro` siempre true → muestra UI Pro a Independiente)
  - `app/(dashboard)/scheduler/appointment-sidebar.tsx:98` (gating)
  - **NO tocar sin sesión dedicada de QA** — fixearlos cambia behaviors que pueden tener cascada (ej. quitar acceso a discount codes a usuarios Independiente actuales). Helper ya disponible en `lib/constants.ts` como `isIndependientePlanSlug(slug)`.

- [ ] **Cron `fertility-followup-contact` daily → hourly cuando upgrade a Vercel Pro**. Hoy schedule es `0 13 * * *` (1pm UTC = 8am Lima) por límite de Vercel Hobby (`once-per-day`). El código del cron tiene gate multi-TZ (chequea hora local de cada org) que está dormido mientras el schedule sea daily. Reactivación: upgrade a Vercel Pro ($20/mes) + cambiar schedule a `0 * * * *` en `vercel.json` + redeploy. **Trigger sugerido:** primer cliente fuera de Lima (UTC-5), o cuando se agreguen 2+ crons hourly más al sistema. Ver commit `3f7c078`.
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

- [ ] **Link receta/examen ↔ diagnóstico específico** — No hay link entre receta/examen y diagnóstico específico. Si el paciente tiene E11 + I10 y le recetas metformina, idealmente la receta debería decir "para E11". Hoy queda implícito ("para esta nota"). Para MVP es OK; para reportes farmacológicos serios faltaría.

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
  - ✅ **Hardening v0.13.1** (entregado):
    - Rollback automático del correlativo en errores no-retryables (no solo error 23). Cubre el caso "serie no autorizada" que vimos pasando de B001 a BBB1.
    - **Notas de crédito (doc_type 3)** — botón "Anular / Nota de crédito" en card de comprobante y en drawer del dashboard. Modal hereda cliente + items + totales del original; user elige motivo SUNAT (Catálogo 9: anulación, devolución total, disminución valor, corrección, etc.) con hint clínico para cada uno. Auto-marca el original como `status=cancelled` si el motivo es anulación o devolución total.
    - **Validación backend de `customer_address` para facturas / RUC** (Zod superRefine, defense-in-depth).
    - **Atomic UPDATE+RETURNING en correlativo** vía RPC `reserve_einvoice_correlative` (migración 110). Postgres lockea la row hasta commit, dos emisiones concurrentes serializan limpio.
    - **Dashboard `/facturacion`** admin-only con KPIs (monto emitido, pendientes SUNAT, rechazados/anulados), filtros (período, tipo, estado, serie, búsqueda libre), tabla con drawer de detalle y links a PDF / XML / CDR / Nubefact.
  - 🧭 **Estrategia plataforma — YendaFact** (decisión pendiente, ver `docs/yendafact-strategy.md`):
    - **Camino D recomendado para corto plazo (3-6 meses):** white-label de Nubefact bajo marca "YendaFact". Negociar pricing volumétrico + branding propio. ~1-2 semanas de dev, riesgo ~0.
    - **Camino A opcional (1 día):** spike técnico de motor SUNAT propio en sandbox `e-beta.sunat.gob.pe`. R&D, no producción. Sirve para arsenal de negociación y conocimiento.
    - **Camino B (12-18 meses):** motor propio + homologación SUNAT en paralelo (3-6 meses calendario humano). Cuando Yenda tenga 100+ clientes facturando.
    - **Camino C (24+ meses):** adquisición de PSE existente para saltar homologación. ~USD 50-150K + cartera incluida.
    - Pricing referencia Nubefact al 2026-04-25: S/70/mes con 500 docs incluidos. Punto de equilibrio para construir propio: ~300-500 clientes activos.
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

## 🔐 Seguridad y Auth

Sección transversal a toda la plataforma — aplica a todos los roles, todas las orgs, todas las especialidades. **No vinculada a addons.** Crítica para defender el modelo de negocio (anti account-sharing) y para compliance médico (Ley 29733 + NTS 139 — auditoría de quién accede a HC).

### Pendientes (orden de mi recomendación)

- [ ] **Límite de dispositivos simultáneos por user** — Anti account-sharing patrón Netflix/Kommo/Spotify. Una clínica con 8 doctores que comparte 1 cuenta de owner = pierdes 7 ventas. Diseño:
  - Tabla nueva `auth_sessions` con `user_id, organization_id, device_fingerprint (IP + UA + localStorage device_id), device_label, last_seen_at, revoked_at`.
  - Límites configurables por org (defaults: Owner 2 / Admin 2 / Doctor 2 / Recepcionista 1).
  - Enforcement en login (modal "Tienes N dispositivos activos, ¿cerrar la más antigua?") + middleware que verifica `revoked_at` en cada request (con cache 30s para no agregar latencia).
  - Página `/account/devices` con lista de sesiones activas + ubicación aproximada + botón "Cerrar".
  - Cron de limpieza diario para sesiones huérfanas (`last_seen_at` > 7 días → revoke).
  - Complicación: Supabase JWT no tiene revocación nativa — verificar contra tabla en cada request hasta que el JWT expire.
  - **Esfuerzo: Medio-Alto (~5-7 días).**
  - **Impacto: Muy alto.** Previene leak de revenue por account-sharing + auditoría real.

- [ ] **Logout from all devices** — Botón en `/account` que invalida todas las sesiones del user. Útil cuando: cambias contraseña, sospechas de acceso no autorizado, dejas un dispositivo en uso público. Reusa la tabla `auth_sessions` del punto anterior.
  - **Esfuerzo: Bajo (~1 día).** Casi gratis si el item anterior está hecho.
  - **Impacto: Medio.** Higiene de seguridad estándar.

- [ ] **Login alerts por email** — Cuando un user logea desde un dispositivo o IP nueva, email automático: "Hemos detectado un nuevo inicio de sesión desde [Lima, Chrome en Windows]. Si no fuiste tú, [cierra todas las sesiones]". Aprovecha la tabla `auth_sessions`.
  - **Esfuerzo: Bajo (~1 día).**
  - **Impacto: Medio-Alto.** Detección temprana de credenciales comprometidas.

- [ ] **2FA opcional para owner/admin** — TOTP estándar (Google Authenticator / 1Password / Authy). Hoy founder sí tiene 2FA (`founder_2fa_sessions`), pero owners/admins de clínicas no. Para clínicas con datos sensibles este es un requisito típico.
  - Setup: QR code + recovery codes + enforcement por org (admin puede forzarlo a todos los miembros).
  - **Esfuerzo: Medio (~3-4 días).**
  - **Impacto: Alto.** Vendible como feature de Plan Clínica/Enterprise.

- [ ] **Audit log de acceso a datos clínicos sensibles** — Tabla `clinical_access_log` con `user_id, organization_id, resource_type (patient|clinical_note|prescription|attachment), resource_id, action (view|edit|export|print), at, ip, user_agent`. RLS solo lectura para owner/admin. Página `/admin/audit-log` con filtros + export CSV.
  - **Compliance:** la NTS 139 exige trazabilidad de acceso a HC. RLS multi-tenant no basta — hay que loggear quién vio qué cuándo.
  - **Esfuerzo: Medio-Alto (~4-5 días).** El loggeo es liviano (insert async); la complejidad está en cubrir todos los puntos de acceso sin perder eventos.
  - **Impacto: Alto.** Diferenciador legal frente a competidores que no lo tienen + protección legal de la clínica frente a denuncias de pacientes.

- [ ] **Rate limiting + captcha en login después de N intentos fallidos** — Hoy `lib/rate-limit.ts` es in-memory básico. Falta enforcement específico en login (5 intentos fallidos → captcha o bloqueo de 15 min de la IP). Previene brute force.
  - **Esfuerzo: Bajo-Medio (~2 días).** Reusa `lib/rate-limit.ts` + Cloudflare Turnstile o reCAPTCHA v3.
  - **Impacto: Medio.** Higiene de seguridad básica. Más relevante cuando crezca el tráfico.

- [ ] **Password policy + rotación obligatoria opcional** — Settings org-level: longitud mínima (default 10), exigir mayúsculas/números/símbolos, rotación cada N días (opcional, off por default). Hoy Supabase Auth solo enforce 6 chars. Algunas clínicas grandes tienen política corporativa que pide >12 chars + rotación 90 días.
  - **Esfuerzo: Medio (~2-3 días).**
  - **Impacto: Bajo-Medio.** Importa para vender a clínicas con dpto. de seguridad maduro (corporativo, hospitales). En piloto Vitra no es prioridad.

- [ ] **Session timeout por inactividad** — Auto-logout después de N minutos sin actividad (configurable por org). Hoy las sesiones duran lo que duren los JWT (default 1h refresh). Para consultorios donde varias personas usan la misma compu, importa que se cierre solo.
  - **Esfuerzo: Bajo (~1 día).** Listener de eventos en cliente + heartbeat al backend.
  - **Impacto: Medio.** Importa para roles de recepción más que para owner/doctor.

### Cerrados

- [x] **Aceptación explícita de Términos y Privacidad en registro** (mig 116) — Checkbox obligatorio en `/register`, redirección a `/onboarding/accept-terms` para Google OAuth, persistencia en `user_profiles.accepted_terms_at` + version. *(v0.14.1)*
- [x] **Bloqueo de sesión para miembros desactivados** (mig 118) — Si todas las membresías del user están `is_active=false`, redirige a `/account-suspended`. *(v0.14.1)*
- [x] **Hardening Ley 29733** en `/terms` y `/privacy` — Yenda como Encargado del Tratamiento, sub-encargados completos, retención específica, breach notification 72h, plazo ARCO 20d. *(v0.14.0)*
- [x] **2FA founders** — Tabla `founder_2fa_sessions` (mig 104) con cookie verificada en `requireFounder()`. *(v0.12.4)*
- [x] **Magic-link token hash** — SHA-256 antes de persistir, raw solo viaja por email/URL (mig 105). *(v0.12.5)*

### Diferidos / dependencias

- **F-05 Redis rate limiter** (de Technical Debt) — depende de migrar in-memory a Upstash. Solo necesario cuando escalemos a >1 clínica con tráfico simultáneo o autoscale activo.
- **Captcha en /register** — esperar a tener señal de spam real antes de meter friction al signup.

---



## 🔜 Prioridad sugerida

> **Re-rankeada al 2026-05-02** integrando seguridad transversal y nuevos verticales. Criterios: defensa de modelo de negocio (account sharing, monetización), compliance legal Perú (Ley 29733, NTS 139), esfuerzo realista, leverage cruzado entre features.
>
> **Items que defienden el modelo de negocio van primero** — sin esos, el resto de features pierde valor económico cuando una clínica con 10 doctores comparte 1 cuenta y pagás solo 1 plan.

### 🔴 Alta — defienden modelo o son compliance

| # | Feature | Esfuerzo | Impacto | Razón estratégica |
|---|---|---|---|---|
| 1 | **Límite de dispositivos simultáneos** (sec. 🔐 Seguridad) | Medio-Alto | Muy alto | Anti account-sharing. Sin esto el ARPU se diluye en cuanto vendamos a clínicas medianas. **Bloqueante para piloto Vitra escalado.** |
| 2 | **Audit log de acceso a HC** (sec. 🔐 Seguridad) | Medio-Alto | Alto | Compliance NTS 139 — exigible legalmente. Diferenciador frente a Doctoralia/Helisa. |
| 3 | **Límites de plan: soft-wall UX** | Medio | Alto | Sin enforcement de límites, el upgrade de plan no se gatilla. Monetización rota silenciosa. |
| 4 | **2FA opcional para owner/admin** (sec. 🔐 Seguridad) | Medio | Alto | Vendible como feature Plan Clínica. Estándar de mercado en SaaS médico. |

### 🟡 Media — diferencia y crece producto

| # | Feature | Esfuerzo | Impacto | Razón |
|---|---|---|---|---|
| 5 | **Notificaciones periódicas (correos)** | Medio | Alto | Engagement del owner — sin emails de resumen, baja recurrencia de uso del producto. |
| 6 | **Reporte IA Avanzado capa 1+2** (Brief Ejecutivo + Insights proactivos) | Alto | Alto | Diferenciador Plan Centro Médico/Clínica. Capa 1 mínima ya entregada en v0.13.5. |
| 7 | **Storage: límites y mensajes** | Medio | Alto | Necesario antes de Dermatología antes/después (que sube fotos pesadas). |
| 8 | **CRM multi-canal Fase 1** (WhatsApp bidireccional) | Alto | Muy alto | Diferenciador real frente a Doctoralia/Helisa. Empezar solo con WhatsApp; IG y FB en fase 2. |
| 9 | **Login alerts por email + Logout from all devices** (sec. 🔐 Seguridad) | Bajo | Medio-Alto | Casi gratis si #1 está hecho. Higiene de seguridad estándar. |
| 10 | **Consentimiento informado Tier 2** (templates + PDF pre-llenado) | Medio | Alto | Ahorra ~10 min/procedimiento. Vendible Professional/Enterprise. |
| 11 | **Módulo Dermatología antes/después** | Alto | Alto | Vertical clave junto con Fertilidad. Esperar feedback Dermosalud para definir scope final. |
| 12 | **Bundle Consulta + Tratamiento** | Medio | Alto | Billing + UX. Útil para fertilidad/estética. |

### 🟠 Media-baja — útiles pero no urgentes

| # | Feature | Esfuerzo | Impacto | Razón |
|---|---|---|---|---|
| 13 | **Google Calendar sync** | Alto | Alto | Integración clave pero usuarios viven feliz sin ella. Reactivar cuando 3+ clientes la pidan. |
| 14 | **Session timeout por inactividad** (sec. 🔐 Seguridad) | Bajo | Medio | Para roles de recepción (varias personas misma compu). |
| 15 | **Rate limit + captcha en login** (sec. 🔐 Seguridad) | Bajo-Medio | Medio | Higiene básica. Más relevante cuando crezca el tráfico. |
| 16 | **Bloque hora único en calendar** | Bajo | Medio | UX. |
| 17 | **Módulo Laboratorio (addon)** | Alto | Alto | Vertical post-Vitra. Esperar feedback de qué clínica lo pide. |
| 18 | **Grabación + transcripción IA** | Muy alto | Muy alto | Diferenciador grande pero requiere evaluación de privacidad médica + costo API. |
| 19 | **Importación masiva CIE-10 (CSV)** | Bajo | Medio | Útil para clínicas con códigos específicos por especialidad. |
| 20 | **Descuentos condicionales** | Medio | Medio | Billing avanzado. |
| 21 | **Links Zoom/Meet automáticos** | Alto | Medio | Teleconsulta — uso aún limitado en Perú. |
| 22 | **Reporte IA Avanzado capa 3-5** (Forecast + Multi-Doctor + Benchmark) | Muy alto | Alto | Roadmap largo. Reactivar cuando Plan Clínica tenga >3 clientes. |
| 23 | **Password policy + rotación** (sec. 🔐 Seguridad) | Medio | Bajo-Medio | Vendible solo a clínicas corporativas grandes. No urgente para piloto. |

### ✅ Entregados (referencia)

| Feature | Versión |
|---|---|
| ~~Email activación trial~~ | ✅ v0.8.1 |
| ~~Bloques de horarios (copiar)~~ | ✅ v0.9.1 |
| ~~Estadísticas de edades~~ | ✅ |
| ~~Plantillas de tratamiento~~ | ✅ |
| ~~Catálogo CIE-10 personalizable~~ | ✅ v0.8.2 |
| ~~Etiqueta "Paciente Recurrente"~~ | ✅ v0.11.0 |
| ~~Portal del Paciente Phase 1~~ (auth + mis citas + cancelar) | ✅ v0.10.0 |
| ~~Pricing alineado~~ | ✅ v0.13.3 |
| ~~Brief Ejecutivo IA Slice C~~ | ✅ v0.13.5 |
| ~~Facturación SUNAT (boletas/facturas)~~ | ✅ v0.13.0 (MVP Nubefact) |
| ~~Aceptación explícita Terms+Privacy en registro~~ (sec. 🔐) | ✅ v0.14.1 |
| ~~Bloqueo sesión miembros desactivados~~ (sec. 🔐) | ✅ v0.14.1 |
| ~~Hardening Ley 29733 + rediseño /terms /privacy~~ | ✅ v0.14.0 |
| ~~Addon `fertility_basic` MVP — seguimientos automatizados~~ | ✅ v0.14.x (rama claude/add-terms-privacy-fH9H7) |

---

*Este archivo se actualiza continuamente. Cada feature completada se mueve al changelog del PRD.md.*
