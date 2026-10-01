# Conversaciones: Flows (automatizaciones con nodos) y Ajustes a pantalla completa

**Documento de diseño.** Captación F4. Corte: 1-oct-2026.
**Lectores:** el fundador, que decide producto, y el ingeniero que lo implementa.
**Base:** tres investigaciones en paralelo (competencia, técnica, inventario del código). Los datos externos llevan su enlace; lo que no se pudo comprobar va marcado **[NO VERIFICADO]**. Las cifras nuestras van marcadas *(estimación)*.
**Pedido del fundador (1-oct):** "hay que hacer una sección de flows como los de Kommo para conversaciones, que están hechos con nodos" y "los settings de conversaciones deben abrir la configuración en toda la pantalla para que se sienta más robusto".

> Nota de método: el proxy de salida bloqueó la lectura directa de kommo.com, respond.io, wati.io, manychat, developers.facebook.com y otros. Los datos de competencia salieron de fragmentos de buscador sobre las páginas oficiales de soporte (redacción cercana, no literal). Los límites de Meta coinciden entre la documentación oficial y dos fuentes secundarias.

---

## Índice

0. [Resumen ejecutivo y decisiones que faltan](#0-resumen-ejecutivo-y-decisiones-que-faltan)
1. [Lo que ya existe en Yenda](#1-lo-que-ya-existe-en-yenda)
2. [Benchmark](#2-benchmark)
3. [Propuesta V1: disparadores, nodos y reglas duras](#3-propuesta-v1-disparadores-nodos-y-reglas-duras)
4. [Arquitectura](#4-arquitectura)
5. [Editor de nodos](#5-editor-de-nodos)
6. [Ajustes a pantalla completa](#6-ajustes-a-pantalla-completa)
7. [Seguridad y cumplimiento](#7-seguridad-y-cumplimiento)
8. [Plan por fases y esfuerzo](#8-plan-por-fases-y-esfuerzo)
9. [Riesgos, preguntas abiertas y hallazgos colaterales](#9-riesgos-preguntas-abiertas-y-hallazgos-colaterales)
10. [Fuentes](#10-fuentes)

---

## 0. Resumen ejecutivo y decisiones que faltan

**Qué es.** Una sección **Flows** dentro de Conversaciones: la clínica dibuja con nodos qué hace Yenda sola cuando una paciente escribe (bienvenida con menú, respuestas por palabra clave, aviso fuera de horario, "nadie respondió en 30 min → etiqueta y aviso a recepción"), y el motor lo ejecuta sobre la misma bandeja, las mismas etiquetas, plantillas y respuestas rápidas que ya existen.

**Qué encontramos.**
- Todos los competidores (Kommo, Respond.io, WATI, ManyChat, Trengo, Zenvia) hacen lo mismo: **lista de flows → editor a pantalla completa**, nunca un modal. Nadie expone historial de versiones; la estadística más barata y útil es un contador por nodo (Kommo).
- Los dolores conocidos son dos y hay que diseñarlos desde el día 1: **bots que se interrumpen entre sí** (Kommo tuvo que sacar un fix y un *cooldown*) y **automatizaciones que no se pausan cuando una persona responde** (hueco conocido de ManyChat).
- **React Flow ya está instalado en Yenda** (`@xyflow/react` 12.11, mapa de arquitectura del founder) y corre en React 19 / Next 15: el canvas no suma dependencias. ≈105 KB gz aislados a la ruta del editor *(medido en local)*.
- El motor cabe en lo que ya hay: el punto idempotente "llegó un mensaje nuevo" (`mirrorInboundToInbox`), el envío único (`sendFromInbox`) y el **tick por minuto** que ya mueve los mensajes programados (pg_cron → `/api/cron/inbox-dispatch`). Cero funciones nuevas en Vercel.
- Lo que falta en el código y es imprescindible: **enviar botones y listas** (la API de Meta lo permite, Yenda hoy solo envía texto y plantillas) y **guardar el `id` del botón que la paciente tocó** (hoy se guarda solo el título).

**Recomendación.** Construir en cuatro entregas (§8): primero los Ajustes a pantalla completa (1 día, sin migración), luego la base de datos + el motor sin pantalla (8 días), después el editor (6 días) y por último el modo "Probar" y las estadísticas (4 días). ≈19 días de un desarrollador *(estimación ±30 %)*.

**Decisiones que necesito del fundador antes de construir:**

| # | Decisión | Recomendación |
|---|----------|---------------|
| 1 | ¿La IA puede **enviar sola** dentro de un flow (nodo "Respuesta de Yendy") en V1? | **No en V1.** Dejarlo para V1.5 con los candados de §7. Meta prohíbe asistentes de propósito general desde el 15-ene-2026 (los bots acotados a una tarea siguen permitidos), y el BAA con Anthropic aún no está. En V1 Yendy sigue siendo borrador. |
| 2 | Cuando una persona del equipo responde, ¿cuánto se pausa el bot? | **Hasta que se archive la conversación o 12 h**, lo que pase primero; configurable en Ajustes. Botón "Pausar / Reanudar bot" en el panel de la conversación. |
| 3 | ¿Quién crea y publica flows? | **Owner/admin.** Recepción los ve, los prueba y pausa el bot por conversación. |
| 4 | ¿Flows va incluido en "CRM WhatsApp + Captación" o se cobra aparte? | **Incluido**, con tope de 10 flows activos por clínica. Kommo lo gatea a Advanced (US$35/usuario) y WATI a Pro; para Yenda es el argumento de venta del addon. |
| 5 | ¿Disparadores por **eventos de cita** (recordatorio −24 h con botones Confirmar / Reagendar) en V1? | **V2.** No hay bus de eventos central y el cron de recordatorios tiene dos bugs que hay que arreglar antes (§9.3). V1 trae disparadores de conversación. |
| 6 | ¿Canvas con nodos (opción A) o constructor lineal tipo Leadsales/Trengo (opción B, ≈60 % del esfuerzo)? | **Opción A.** El fundador pidió nodos, React Flow ya está, y las ramas (botones, condición) se dibujan mal en una lista. |

---

## 1. Lo que ya existe en Yenda

Inventario hecho sobre el código al 1-oct-2026 (rutas con línea).

### 1.1 Entrada de mensajes
- `app/api/whatsapp/webhook/route.ts:59` recibe el webhook de Meta y, en el mismo request, parsea (`lib/whatsapp/capture.ts:49`), resuelve la org por `whatsapp_config.phone_number_id` activo, hace upsert de `wa_conversations` y `wa_inbound_messages`, y copia a la bandeja con `mirrorInboundToInbox` (`lib/inbox/ingest.ts:13`). **Solo una fila realmente nueva** (`inserted`) toca contadores: ese es el punto idempotente donde enganchar el motor (los reintentos de Meta no disparan nada dos veces).
- `CapturedInbound` trae `type`, `body`, `inboxBody` (título del botón o fila de lista, emoji de reacción), media, `replyToWamid` (= `context.id`). **No se persiste** `interactive.button_reply.id` / `list_reply.id` ni `button.payload`: hoy solo queda el título. Flows necesita el `id`.

### 1.2 Salida
- `lib/inbox/send.ts:50` `sendFromInbox`: texto solo dentro de la ventana de 24 h (`window_closed`), plantillas solo `APPROVED`, reserva previa en `wa_messages` con `client_msg_id` único por org (un reintento devuelve la fila existente), `biz_opaque_callback_data` = id de fila, estados por webhook. `source` admite `agent|scheduler`; el CHECK de la tabla ya acepta `ai_agent`, `history_sync`, `business_app_echo` (falta `flow`).
- **No existe envío de botones ni listas.** `lib/whatsapp/client.ts:114` tiene un `sendMessage(payload)` genérico que aceptaría un payload `interactive`, pero no hay constructores ni tipos (`MetaSendMessagePayload` solo `template`).

### 1.3 Tick por minuto
- `lib/inbox/dispatch.ts:17` + RPC `wa_claim_due_scheduled` (mig 275:330, `FOR UPDATE SKIP LOCKED`, retoma `sending` > 10 min). Lo dispara pg_cron + pg_net cada minuto contra `/api/cron/inbox-dispatch` (Bearer `CRON_SECRET`), y como respaldo la pestaña abierta de Conversaciones cada 60 s (`/api/inbox/dispatch`). Es el mismo mecanismo que necesitan las esperas y los *timeouts* de un flow.

### 1.4 Eventos que ya existen (para disparadores futuros)
- Campanita: `booking_created`, `appointment_created`, `appointment_cancelled`, `appointment_no_show`, `payment_registered`, `patient_created`, `prescription_issued` (`lib/live-notifications/catalog.ts:82-281`). Se emiten desde el cliente (sidebar de la cita, modal de cita) y desde algunos servidores (reserva online, portal, recetas).
- Notificaciones a la paciente por slug (`/api/notifications/send`): `appointment_confirmation`, `_rescheduled`, `_cancelled`, `appointment_reminder_24h/_2h`, `patient_post_consultation`, `patient_review_request`…
- Seguimientos: `followup_rules.trigger_event` ∈ `appointment_completed`, `appointment_no_show`, `treatment_session_missed`, `budget_accepted`… (mig 186). "Por reprogramar" (mig 273) y pre-reserva (mig 274) son triggers SQL.
- **No hay bus de eventos central**: los cambios de estado de la cita se escriben desde el navegador. Por eso los disparadores por cita van en V2 (§8).

### 1.5 Hora de la clínica y horario
- `organizations.timezone` (mig 240), `lib/org-time.ts` (`zonedNow`, `todayInTz`), `scheduler_settings.start_hour/end_hour/start_minute/end_minute/disabled_weekdays/break_time` con helpers en `lib/scheduler-config.ts`. Suficiente para "fuera de horario" sin tablas nuevas.

### 1.6 Yendy IA
- `generateSuggestion` (`lib/inbox/ai.ts:145`) devuelve `reply`, `sources`, `needs_human`, `gap_question` e **`intent`** (`precio|agendar|reprogramar|informacion|resultado|queja|saludo|otro`): ese `intent` sirve para enrutar dentro de un flow sin que la IA escriba nada. `detectAlarm`, validador de precios y `ai_rules` / `ai_hidden_service_ids` ya existen.

### 1.7 Acceso y RLS
- `requireInbox` (sesión → membresía activa en `?org=` → addon `captacion` → doctor solo con toggle) y `wa_inbox_can_access` en la base. Las tablas de la 275 tienen lectura por `wa_inbox_can_access` y escritura solo admin o solo API (service role). Flows sigue el mismo molde.

### 1.8 Patrón de pantalla
- Las páginas "tipo app" usan el shell full-bleed `-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 …` (historial, seguimientos, reportes, pacientes, conversaciones). La página de Ajustes general (`settings/page.tsx`) tiene *deep links* `?tab=`, carga cada pestaña con `dynamic()` y tira de tabs con scroll en móvil. No existe un componente compartido de cabecera ni de "volver". Los Ajustes de Conversaciones hoy son un `Dialog` (`inbox-settings.tsx`) con 7 pestañas sin props que leen la org de `useOrganization()`: se pueden mover a una ruta tal cual.

## 2. Benchmark

| Producto | Disparadores | Nodos | 24 h / plantillas | Humano | IA | Dónde vive | Precio |
|---|---|---|---|---|---|---|---|
| **Kommo Salesbot** | mensaje entrante/saliente/cualquiera; sin respuesta tras N; lead entra a etapa (ya / 5 m / 10 m / 1 d). Keyword solo como Condición | Mensaje (texto o plantilla, botones ramifican), Lista (solo en ventana), Condición, Validación, Pausa (espera o timer), Acción (tarea, etiquetas, round-robin), Webhook, Stop | Lista solo dentro de ventana; plantilla como mensaje | Asignación; stop | Add-on pago aparte | Chats › ⚙ › Templates & Bots: lista (nombre, triggers, conversión, lanzamientos, sesiones) → Visual Builder con stats por paso y "Bot preview" | Advanced, US$35/usuario desde sep-2026 |
| Respond.io | conversación abierta/cerrada, etiqueta, atajo, webhook, lifecycle, manual; **sin keyword** (feature request) | Send, Ask (≤10 opciones de 20 chars), Branch, Date & Time (horario), Wait, Jump, Comment, Tag, Assign, Open/Close, HTTP, Trigger Workflow, AI Agent | Send acepta plantilla | "Takeover" corta la IA al instante; "Stop workflow for contact" desde el inbox | AI Agent | Módulo Workflows: Draft / Published / Stopped | Growth US$159 **[NO VERIFICADO]** |
| WATI | Keyword (exact/contains), Default Action (1 vez / 30 min), botones de plantilla | Send, Ask (texto / botones ≤3 / lista ≤10), Condición; Pro: Delay, Assign, integraciones. Pro = 25 flows × 200 nodos | avisa a la hora 23 de la ventana | Assign termina el bot | aparte | Chatbot builder | Pro |
| ManyChat | keyword, inicio, etc. | mensaje, botones, Condición, Smart Delay, Acciones, AI Step (+US$29), Live Chat | nodo "Send outside 24-hour window" → plantilla; **Smart Delay > 24 h descarta el siguiente mensaje en silencio** | hueco conocido: no se pausa solo cuando un humano responde | AI Step | Automation tab; Set Live / Preview | Pro US$29 |
| Leadsales (MX) | — | **No es canvas**: menú numérico 1-2-3 hasta 3 niveles; cada opción responde y mueve el lead | — | — | Lead Agent aparte | — | Cloud API desde US$133 |
| Trengo | Flowbot | pasos lineales con contenido + botones + acciones (equipo, etiqueta, cerrar, saltar) | — | assign | AI Journeys (trigger inmutable) | Settings › Automation › Flowbots | desde US$110 + add-on |
| Zenvia (ex-Sirena) | — | texto, Menú, Feedback, decisión, Timer, SMS, URL, Lead, Ticket | — | bloque transferir + atención + fin | — | constructor ZCC | — |

**Lecciones que adoptamos**
1. Lista + editor a pantalla completa; estados Borrador / Publicado / Pausado; contador por nodo.
2. **Un disparador por flow**, inmutable al publicar, y *cooldown* por contacto: evita el choque de bots de Kommo.
3. **Regla dura de la ventana de 24 h en el motor**, nunca descartar en silencio (lección ManyChat): fuera de ventana solo pasa un nodo Plantilla; cualquier otro envío falla a la vista.
4. **Cualquier mensaje de una persona pausa el bot** (lo contrario del hueco de ManyChat), con "Pausar / Reanudar" visible en el chat (Respond.io).
5. Botones ≤ 3 de 20 caracteres y listas ≤ 10 filas: límites de Meta, no nuestros.

## 3. Propuesta V1: disparadores, nodos y reglas duras

Un flow = **un disparador** + un grafo de nodos. Todo reutiliza lo que ya existe: etiquetas (`org_tags`), plantillas aprobadas (`whatsapp_templates`), respuestas rápidas, miembros, horario de la agenda y la base de conocimientos de Yendy.

### 3.1 Disparadores (5)

| Disparador | Cuándo | Notas |
|---|---|---|
| **Conversación nueva** | primer mensaje de un número, o mensaje tras N días de silencio (N configurable, default 30) | El de bienvenida. |
| **Palabra clave** | el mensaje contiene / es exactamente una de las palabras (normalizado: minúsculas, sin tildes) | "precio", "cita", "horario", "resultados". |
| **Sin respuesta del equipo** | la paciente escribió hace N minutos, nadie respondió y la conversación no tiene bot activo | Lo evalúa el tick por minuto. Solo en horario de atención si así se marca. |
| **Botón de plantilla** | la paciente tocó un botón de respuesta rápida de una plantilla (payload) | Permite "Confirmar / Reagendar" cuando llegue el recordatorio con botones (V2 lo dispara desde la cita; en V1 se usa con plantillas enviadas a mano o programadas). |
| **Manual** | recepción pulsa "Iniciar flow" en la conversación | Para probar y para flows de oferta. |

Prioridad cuando varios coinciden: palabra clave > botón de plantilla > conversación nueva > sin respuesta. Un flow no se vuelve a disparar para la misma conversación hasta pasado su *cooldown* (default 4 h).

### 3.2 Nodos (11)

| Nodo | Qué hace | Salidas | Límites (Meta) |
|---|---|---|---|
| **Disparador** | inicio; uno por flow | siguiente | |
| **Enviar mensaje** | texto con `{{nombre}}` / `{{clinica}}` (mismas variables de las respuestas rápidas) | siguiente | ≤ 4096; solo dentro de 24 h |
| **Pregunta con botones** | texto + 1–3 botones; guarda la respuesta | una salida por botón + "otra respuesta" + "sin respuesta (tiempo)" | 3 botones, títulos ≤ 20 chars |
| **Pregunta con lista** | texto + botón "Ver opciones" + hasta 10 filas | una salida por fila + "otra respuesta" + "tiempo" | ≤ 10 filas en ≤ 10 secciones, título ≤ 24, descripción ≤ 72 |
| **Esperar** | un tiempo fijo, o hasta que la paciente escriba (con tiempo máximo) | siguiente / "respondió" / "tiempo" | se ejecuta con el tick por minuto |
| **Condición** | palabra clave en la última respuesta · tiene etiqueta · tiene ficha de paciente · ventana de 24 h abierta · dentro del horario de la clínica | sí / no | horario en la zona de la org |
| **Enviar plantilla** | plantilla aprobada con variables | siguiente | **único nodo permitido fuera de la ventana** (utility ≈ US$0.03 tras 1 000/mes) |
| **Etiqueta** | poner / quitar etiqueta | siguiente | |
| **Avisar y asignar** | notifica (campanita) a un miembro o a "recepción" y lo asigna; **pausa el bot** | siguiente | |
| **Pasar a una persona** | termina el bot y pausa; nota opcional | — | obligatorio que todo flow pueda llegar a uno (política de Meta) |
| **Fin** | termina sin pausar | — | |

Queda **fuera de V1**: nodo "Respuesta de Yendy" que envía sola (decisión 1), expresiones regulares, sub-flows / "ir a", nodos de media, webhook HTTP, nodo "Agendar cita" (V1.5: proponer huecos con `get_free_slots`), auto-layout, edición colaborativa, diff de versiones, edición en celular, Instagram/Messenger.

### 3.3 Reglas duras del motor (no configurables)
1. **Un bot activo por conversación.** Índice único parcial en la base; un segundo flow que coincide no arranca.
2. **Una persona manda.** Cualquier mensaje enviado por un miembro desde Yenda o desde la app del celular (eco de coexistencia) pausa el bot `N` horas (decisión 2) y cierra el flow en curso como "pasó a persona". Las notas internas no pausan.
3. **Fuera de la ventana de 24 h solo Plantilla.** Un nodo de texto / botones / lista fuera de ventana termina el flow con motivo visible ("ventana cerrada"), o salta si el nodo lo permite. Nunca se descarta en silencio.
4. **STOP / BAJA / CANCELAR / "no me escribas"** (normalizado) → la conversación queda `opted_out`, etiqueta "No contactar", el bot nunca más escribe ahí y recepción lo ve en el panel. Se revisa antes de cada envío.
5. **Alarma** (sangrado, dolor de pecho…, `detectAlarm` existente) → el bot deja de responder, pasa a persona y avisa a recepción. Nunca contesta una alarma con un menú.
6. **Horario silencioso** (opcional por clínica, hora de la org): los envíos del bot esperan a la próxima apertura; las esperas no se pierden.
7. **Tope de pasos** (200 por ejecución) y máximo 12 nodos por invocación: un ciclo mal dibujado no cuelga nada.
8. **Primer mensaje de un bot** lleva una línea de aviso ("Soy el asistente virtual de …; escribe *persona* para hablar con alguien"), editable pero no desactivable **[obligación legal en Perú: NO VERIFICADO; lo exige la política de Meta]**.

### 3.4 Tres flows de fábrica (plantillas al crear)

**A · Bienvenida + menú + fuera de horario**
Disparador *Conversación nueva* → Condición *¿dentro del horario?* → [no] Enviar "Hola, gracias por escribir a {{clinica}}. Atendemos de L–V 9:00 a 18:00; mañana te respondemos." → Etiqueta `fuera_horario` → Fin · [sí] Pregunta con lista "¿En qué te ayudo?" (Agendar cita / Precios / Resultados / Hablar con alguien) → *Agendar* → Enviar "Cuéntame qué servicio y qué día te acomoda" → Avisar y asignar (recepción) · *Precios* → Enviar (texto con precios copiados del catálogo) → Pregunta con botones "¿Quieres agendar?" Sí → Avisar / No → Fin · *Resultados* → Enviar "Los resultados los entrega el consultorio; recepción te escribe" → Avisar · *Hablar* → Pasar a una persona.

**B · Nadie respondió en 30 min**
Disparador *Sin respuesta del equipo, 30 min, solo en horario* → Etiqueta `sin_respuesta` → Avisar y asignar (recepción) → Enviar "Ya vimos tu mensaje, en breve te respondemos 🙂" → Fin. Cooldown 4 h.

**C · Confirmación por botones** (se dispara desde un botón de plantilla)
Disparador *Botón de plantilla* `confirmar` → Etiqueta `confirmada` → Enviar "¡Listo! Te esperamos." → Fin · `reagendar` → Etiqueta `por_reprogramar` → Avisar y asignar → Pasar a una persona. (En V2 la propia cita envía la plantilla −24 h y marca la cita confirmada.)

## 4. Arquitectura

### 4.1 Datos (mig 276, aditiva; rollback y pruebas como la 275)

| Tabla / objeto | Columnas clave | RLS |
|---|---|---|
| `wa_flows` | id, organization_id, name, status `draft\|active\|paused\|archived`, priority, trigger jsonb, definition jsonb (borrador), version, published_version_id uuid **sin FK**, created_by / updated_by **sin FK**, timestamps | SELECT `wa_inbox_can_access`; escritura `is_org_admin` |
| `wa_flow_versions` | id, flow_id FK, version, trigger, definition, published_by **sin FK**, published_at | SELECT `wa_inbox_can_access`; escritura admin (inmutable: solo INSERT) |
| `wa_flow_runs` | id, organization_id, conversation_id FK, flow_id **sin FK**, flow_version_id **sin FK**, status `running\|waiting_reply\|waiting_delay\|handed_off\|done\|failed`, current_node_id, context jsonb, wake_at, steps, last_inbound_wamid, last_sent_message_id **sin FK**, claimed_at, started_at, ended_at, end_reason. **Índice único parcial `(conversation_id) WHERE status IN (running, waiting_reply, waiting_delay)`** | SELECT `wa_inbox_can_access` (para la insignia "Bot activo" en el chat); **sin políticas de escritura** (solo service role) |
| `wa_flow_run_events` | run_id FK, node_id, kind, payload jsonb, created_at | SELECT `wa_inbox_can_access`; sin escritura |
| `wa_conversations` + | `bot_paused_until timestamptz`, `bot_opted_out boolean` | las de hoy |
| `wa_inbox_settings` + | `flows_enabled`, `flows_pause_hours` (default 12), `flows_quiet_start/end time`, `flows_disclosure text` | las de hoy |
| `wa_messages` | CHECK de `source` + `'flow'`; columna `interactive jsonb` (botones / lista enviados y la respuesta con su id) | las de hoy |
| RPC `wa_flow_claim_due(p_limit)` | toma runs con `wake_at <= now()` o `running` colgados > 2 min, `FOR UPDATE SKIP LOCKED` | solo `service_role` |
| RPC `wa_flow_claim_for_inbound(p_conversation, p_wamid)` | `UPDATE … WHERE status='waiting_reply' RETURNING` (atómico: dos entrantes en el mismo segundo no avanzan dos veces) | solo `service_role` |

Cumple la regla anti-PGRST201 de `CLAUDE.md`: una sola FK por par de tablas; los rastros van como uuid sin FK. Antes y después: Consulta 1 de `supabase/checks/multi_fk_pairs.sql`, `npm run check:embeds`, `/api/health/schema`.

### 4.2 Motor
- **Núcleo puro** `lib/inbox/flows/engine.ts`: `step(definition, state, event, env) → { state, effects[] }` sin I/O. `effects.ts` aplica los efectos (enviar, etiquetar, avisar, pausar). Así las pruebas unitarias y el modo "Probar" usan exactamente el mismo código que producción.
- **Al llegar un mensaje** (`mirrorInboundToInbox`, solo filas nuevas): si la conversación está pausada u `opted_out` → nada. Si hay un run `waiting_reply` → se reclama atómicamente y avanza. Si no → se evalúan los flows activos por prioridad y arranca uno. Se corre dentro de `after()` de Next 15 para que el webhook responda a Meta en < 1 s, con presupuesto de 8 s por paso; si se acaba el tiempo, `wake_at = now()` y el tick continúa.
- **Esperas y tiempos** por `wake_at`: **el mismo `/api/cron/inbox-dispatch` de hoy** llama además a `tickFlowRuns({limit: 25})` (mismo `CRON_SECRET`, mismo job de pg_cron: cero configuración y cero invocaciones nuevas); `/api/inbox/dispatch` hace lo propio para su org mientras la pestaña está abierta. Nunca se duerme dentro de un request.
- **Envíos idempotentes**: `client_msg_id = uuidv5(run.id + node.id + steps)` a través de `sendFromInbox` con `source='flow'`: el UNIQUE de `wa_messages` impide un doble envío aunque el tick repita.
- **Toma humana**: `sendFromInbox` con `source='agent'` y los ecos del celular ponen `bot_paused_until` y cierran el run como `handed_off`. Tras la pausa, un nuevo mensaje vuelve a evaluar disparadores (run nuevo; no se "reanuda" a mitad).
- **Horario**: `zonedNow(org.timezone)`; la condición *dentro del horario* reutiliza `scheduler_settings` (horas, minutos, días cerrados, break).

### 4.3 Botones y listas (API de Meta)
- Botones: `type: "interactive"`, `interactive.type: "button"`, `body.text ≤ 1024`, `footer ≤ 60`, `action.buttons[{type: "reply", reply: {id ≤ 256, title ≤ 20}}]`, **máx. 3**, títulos únicos.
- Lista: `interactive.type: "list"`, `body ≤ 4096`, `action.button ≤ 20`, `sections[{title ≤ 24, rows[{id ≤ 200, title ≤ 24, description ≤ 72}]}]`, **≤ 10 secciones y ≤ 10 filas en total**.
- La respuesta llega como `messages[].type: "interactive"` con `interactive.button_reply.id/title` o `list_reply.id/title/description`, y `context.id` = wamid de nuestro mensaje interactivo. Convención: `id = "<nodo>:<botón>"` → arista `btn:<botón>`; si `context.id` no es el último interactivo del run, se ignora (la paciente tocó un menú viejo).
- Cambios en el código existente, todos aditivos: `CapturedInbound` + `interactiveId` / `interactiveType`; `sendFromInbox` + `kind: "interactive"` y `source: "flow"`; constructores en `lib/inbox/flows/wa-payloads.ts`; el chat muestra el texto y los botones enviados.

### 4.4 Costo de operación *(estimación)*
- Invocaciones: 0 nuevas (el paso corre en el webhook; el tick viaja en el cron que ya existe).
- Meta: dentro de la ventana, texto/botones/listas son mensajes de servicio: gratis hasta 1 000/mes y luego US$0.03; fuera de ventana solo plantillas (utility US$0.03, marketing US$0.0703 en Perú).
- Vercel Hobby: el diseño no depende de funciones largas. El riesgo real sigue siendo la cláusula de uso no comercial del plan Hobby (ya anotado en `whatsapp-inbox-crm-2026-09.md`): Pro resuelve además el cron por minuto.

## 5. Editor de nodos

- **Dónde**: `/conversaciones/flows` (lista: nombre, disparador, estado, ejecuciones, última vez) y `/conversaciones/flows/[id]` (editor a **pantalla completa**, shell full-bleed). Enlace desde Ajustes → sección "Flows" y desde la lista de conversaciones. Owner/admin editan; recepción ve la lista y el detalle en solo lectura.
- **Librería**: React Flow 12 (ya instalado, MIT). Cargado con `dynamic(..., { ssr: false })` como el mapa de arquitectura; `nodeTypes` fuera del componente; nodos propios en Tailwind con un `<Handle>` por salida (`next`, `yes`, `no`, `reply`, `timeout`, `fallback`, `btn:<id>`, `row:<id>`); `MiniMap`, `Controls`, `Background` incluidos; `colorMode` según el tema. **Sin plan Pro**: deshacer/rehacer es una pila propia sobre `{nodes, edges}`; auto-layout no va en V1 (Kommo también coloca a mano).
- **Edición**: paleta a la izquierda (arrastrar o clic para añadir), panel a la derecha con el formulario del nodo seleccionado (zod en vivo), barra superior con nombre, estado, **Guardar borrador**, **Publicar**, **Probar**, "Pausar". Guardar nunca afecta a los runs en curso: publican una versión nueva y los runs quedan fijados a la suya.
- **Validación** (misma función en el editor y al publicar): exactamente un disparador; todos los nodos alcanzables; cada salida obligatoria conectada; sin aristas a nodos que no existen; ciclos solo si pasan por *Esperar* o *Pregunta*; al menos un camino a *Pasar a una persona*; etiquetas, plantillas y miembros pertenecen a la org; longitudes de Meta.
- **Celular**: la lista y el detalle se ven; el canvas se edita en escritorio o tablet (arrastrar conexiones con el dedo funciona mal en cualquier librería).
- **Probar**: cajón lateral con burbujas estilo WhatsApp; se escribe texto o se tocan los botones y el motor puro responde; botón "saltar tiempo" para los *timeouts*. No envía nada ni escribe en la base (o, si se quiere historial, un run marcado `is_test` sobre una conversación sintética).
- **Estadísticas V1**: contador de ejecuciones por flow y por nodo (lo que Kommo muestra), última ejecución y motivo de fin. Sin embudos.

## 6. Ajustes a pantalla completa

Independiente de Flows; se puede entregar primero (1 día, sin migración).

- **Ruta** `app/(dashboard)/conversaciones/ajustes/page.tsx` (cliente), mismo shell full-bleed que `/conversaciones`. Cabecera con "← Conversaciones", título "Ajustes de Conversaciones" y subtítulo; gate `isAdmin` + addon `captacion` con el estado "sin acceso" inline, igual que `settings/page.tsx`.
- **Navegación**: en ≥ lg, columna izquierda fija de 240 px con las secciones (patrón `grid lg:grid-cols-[240px_1fr]` que ya usa `clinical-templates-tab.tsx`); en móvil, la tira horizontal con scroll que sangra al borde (`-mx-4 px-4 overflow-x-auto`, receta de `settings/page.tsx`). Secciones: General · Reglas de Yendy · Probar Yendy · Base de conocimientos · Brechas · Respuestas rápidas · Etiquetas · **Flows** (enlace a `/conversaciones/flows`; hasta que exista, "próximamente").
- **Deep link** `?tab=` con `history.replaceState` (patrón de `almacen/page.tsx`, evita el `Suspense` de `useSearchParams`). Cada sección con `dynamic()` y `TabLoader`, como la página de Ajustes general.
- **Reutilización**: las 7 pestañas actuales no reciben props y leen la org de `useOrganization()`: se mueven tal cual a `conversaciones/ajustes/sections/*.tsx`. La página llama a `setInboxOrg(organizationId)` (hoy lo hace `conversaciones/page.tsx`; sin esto "Probar Yendy" da 400 a un usuario con dos clínicas). El `Dialog` desaparece y el botón ⚙ de la lista pasa a ser un `Link`. El sidebar sigue resaltando Conversaciones porque `isPathActive` es por prefijo.
- Ancho de contenido: `max-w-4xl` dentro de la columna derecha, para que los formularios no se estiren en pantallas grandes.

## 7. Seguridad y cumplimiento

- **Política de Meta** (Business Messaging Policy): la automatización dentro de la ventana está permitida si hay "caminos de escalación rápidos, claros y directos a una persona". El validador no deja publicar un flow sin un camino a *Pasar a una persona*, y la palabra *persona / humano / asesor* siempre corta el bot. Desde el **15-ene-2026** Meta prohíbe en la API los asistentes de IA de propósito general; un bot acotado a la tarea de la clínica sigue permitido. Por eso la IA no envía sola en V1.
- **Datos de salud**: el bot nunca pide ni repite datos clínicos; las alarmas van a una persona. Si en V1.5 se activa el nodo de Yendy, hereda los candados actuales (texto de la paciente como dato, validador de precios, `needs_human` → no enviar y pasar a persona, `max_turns ≤ 5`) y requiere el BAA con Anthropic.
- **RLS**: flows y versiones los escribe solo admin; runs y eventos solo el servidor. Al publicar se valida que `tag_id`, `template_id` y `user_id` sean de la org (en runtime el service role no pasa por RLS).
- **Idempotencia** en tres capas: `wamid` único al entrar, claim atómico del run, `client_msg_id` determinista al salir.
- **Opt-out** antes de cada envío (regla 4 de §3.3) y registro con fecha.
- **Ritmo**: ~1 mensaje cada 6 s por destinatario y 80 msg/s por número (errores 130429 / 131056) **[fuente secundaria]**: el motor envía como máximo un mensaje por nodo y nunca ráfagas.

## 8. Plan por fases y esfuerzo

Cada fase es un PR aditivo; las migraciones siguen el checklist de `docs/migraciones-checklist.md`.

| Fase | Entrega | Días *(estimación)* |
|---|---|---|
| **0 · Ajustes a pantalla completa** | ruta `/conversaciones/ajustes` con nav lateral, las 7 secciones movidas, sección "Flows (próximamente)", botón ⚙ → enlace. Sin migración. | 1 |
| **1 · Base + motor (sin pantalla)** | mig 276 + rollback + pruebas SQL; `CapturedInbound` con id de botón; envío de botones/listas y `source='flow'`; esquema zod + validador + motor puro + pruebas unitarias; runtime (hook en entrante, tick en el cron, toma humana, ventana, horario, opt-out, alarma); API de flows; los 3 flows de fábrica sembrados como borrador. Verificable desde el modo Probar vía API. | 8 |
| **2 · Editor** | lista, editor React Flow (11 nodos), panel de propiedades, paleta, deshacer, Guardar / Publicar / Pausar, validación en vivo. | 6 |
| **3 · Probar, estadísticas y chat** | cajón "Probar", vista de ejecuciones por flow, insignia "Bot activo" y "Pausar / Reanudar bot" en el panel de la conversación, contadores por nodo, guía en `docs/conversaciones-setup.md`, QA con el número de prueba. | 4 |
| **Total** | | **≈ 19 (±30 %)** |

**Opción B (si se quiere algo antes):** constructor **lineal** tipo Trengo/Leadsales (lista de pasos con ramas solo en Pregunta y Condición, sin canvas). Reutiliza las fases 1 y 3 íntegras y reemplaza la fase 2 por ≈ 2 días. Se puede migrar a canvas después porque el modelo de datos es el mismo grafo. No lo recomendamos como destino final: el fundador pidió nodos y la librería ya está.

**V1.5 (después de usarlo un mes):** nodo "Respuesta de Yendy" con candados; nodo "Proponer huecos" (`get_free_slots`); importar/exportar flows entre clínicas (plugins por org).
**V2:** disparadores por eventos de cita (recordatorio −24 h con botones que confirman la cita, post-consulta +1 d, reactivación a 90 d) sobre un bus de eventos del servidor; requiere arreglar primero el cron de recordatorios (§9.3).

## 9. Riesgos, preguntas abiertas y hallazgos colaterales

### 9.1 Riesgos
- **Choque de bots** (Kommo): mitigado por un run activo por conversación, un disparador por flow y cooldown. Queda el caso de dos flows con la misma palabra clave: el validador avisa al publicar.
- **Silencio accidental fuera de ventana** (ManyChat): mitigado por la regla 3; además la lista de ejecuciones muestra "terminó: ventana cerrada".
- **Bot que responde cuando no debe**: toda escritura humana pausa; opt-out global; alarma → persona.
- **Carga en el webhook**: `after()` y presupuesto de 8 s; si Hobby lo limita en la práctica, el paso se delega al tick (un minuto de latencia). Verificar en el primer deploy.
- **Hobby**: cláusula no comercial y cron 1×/día. Pro (US$20/mes) elimina el workaround de pg_cron y el riesgo contractual.

### 9.2 Preguntas abiertas
- Las seis decisiones de §0.
- ¿Aviso de "asistente virtual" obligatorio en Perú? (Indecopi / Ley 29733: **NO VERIFICADO**). Lo ponemos igual por la política de Meta.
- ¿Las estadísticas por flow cuentan como "Captación" en el dashboard? Propuesta: no en V1.

### 9.3 Hallazgos colaterales (fuera de este diseño, conviene corregir aparte)
- **Cron de recordatorios**: `vercel.json` lo programa **una vez al día** (`0 13 * * *`) mientras el código (`app/api/cron/reminders/route.ts:40`) está pensado para correr cada 30 min con ventanas de 23–25 h y 1,5–2,5 h. Corriendo una vez al día, solo reciben recordatorio las citas cuya hora cae dentro de esas ventanas a las 13:00 UTC. Además arma la fecha-hora en UTC (`:166`) y no en la zona de la org. Esto ya estaba anotado como pendiente en la v0.15.44 ("recordatorios automáticos que nunca se enviaron") y es prerrequisito de los disparadores por cita (V2). Con pg_cron cada 30 min se arregla igual que los programados.
- `lib/inbox/kb.ts` lee el horario sin minutos ni break: Yendy puede decir "hasta las 18:00" cuando la agenda cierra 18:30. Una línea.
- `SendParams.source` en `send.ts` no incluye `ai_agent` aunque la base ya lo acepta.

## 10. Fuentes

Competencia (fragmentos de buscador sobre páginas oficiales; ver nota de método):
- Kommo: https://www.kommo.com/support/crm/salesbot-triggers/ · https://www.kommo.com/support/crm/salesbot-step-and-action-types/ · https://www.kommo.com/support/crm/salesbot-analytics/ · https://support.kommo.com/docs/manage-salesbot-interruptions · https://support.kommo.com/docs/create-a-list-message-in-whatsapp-business · https://www.kommo.com/blog/kommo-pricing-update/ · reseñas: https://www.trustpilot.com/review/kommo.com, https://www.g2.com/products/kommo/reviews
- Respond.io: https://respond.io/help/workflows/workflow-triggers · https://respond.io/help/workflows/workflow-steps · https://respond.io/help/workflows/workflows-overview · https://respond.canny.io/feature-request/p/workflows-trigger-workflow-based-on-keywords-phrases
- WATI: https://support.wati.io/en/articles/11463029-understanding-nodes-in-chatbot-builder · https://support.wati.io/en/articles/11463176-understanding-keyword-actions · https://support.wati.io/en/articles/11463189-configuring-default-action-in-wati
- ManyChat: https://help.manychat.com/hc/en-us/articles/14281326740124-How-to-use-WhatsApp-Messages-Templates-in-Manychat · https://community.manychat.com/general-q-a-43/smart-delay-3299 · https://community.manychat.com/general-q-a-43/pausing-automations-automatically-when-human-support-is-required-2254
- Leadsales: https://leadsales.io/blog/el-futuro-de-las-ventas-en-whatsapp-leadsales-lanza-primer-chatbot-no-code-en-latam/ · Trengo: https://help.trengo.com/article/configuring-your-flowbot · Zenvia: https://support.zenvia.com/kb/article/486385/transferindo-atendimento-chatbot-fluxos-humanos-zcc

Meta:
- Botones de respuesta: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
- Listas: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages
- Webhook de respuestas interactivas: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/interactive/
- Precios: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Política: https://business.whatsapp.com/policy · prohibición de asistentes generales (15-ene-2026): https://respond.io/blog/whatsapp-general-purpose-chatbots-ban

Técnica:
- React Flow: https://github.com/xyflow/xyflow (package.json, CHANGELOG, issues React 19) · ejemplos Pro vs libres: https://reactflow.dev/pro/examples **[reactflow.dev bloqueado desde el sandbox]**
- Supabase Cron: https://supabase.com/modules/cron
- Vercel Hobby (fuentes secundarias): https://deploywise.dev/blog/vercel-free-tier-limits-2026 · https://crontap.com/blog/vercel-cron-hourly-limit-and-how-to-beat-it

Repo (inventario al 1-oct-2026): `lib/whatsapp/capture.ts`, `lib/inbox/{ingest,send,dispatch,ai,kb,server,shared}.ts`, `app/api/whatsapp/webhook/route.ts`, `app/api/cron/inbox-dispatch/route.ts`, `supabase/migrations/275_whatsapp_inbox.sql`, `components/architecture/architecture-map.tsx`, `app/(dashboard)/settings/page.tsx`, `app/(dashboard)/almacen/page.tsx`, `app/(dashboard)/conversaciones/inbox-settings.tsx`, `lib/live-notifications/catalog.ts`, `app/api/cron/reminders/route.ts`, `vercel.json`.
