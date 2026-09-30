# Conversaciones: bandeja de WhatsApp con agenda, programados y copiloto IA

**Documento de diseño.** Captación F3 + Copiloto IA V1. Corte: 30-sep-2026.
**Lectores:** el fundador, que toma las decisiones de producto, y el ingeniero que lo implementa.
**Base:** seis investigaciones hechas en paralelo (código, Meta, competencia, arquitectura, seguridad e IA). Los datos externos llevan su enlace. Lo que no se pudo comprobar va marcado **[NO VERIFICADO]**. Las cifras que calculamos nosotros van marcadas *(estimación)*.
**Revisión:** el 30-sep-2026 dos verificadores adversariales (hechos externos y arquitectura contra el código) encontraron 40 problemas. Todos están corregidos en el texto; el detalle está en la [§12](#12-registro-de-verificación-30-sep-2026).

> Nota de método: el proxy de salida bloqueó la lectura directa de developers.facebook.com, gob.pe, supabase.com y otros sitios. Los datos de Meta se leyeron con el buscador oficial de documentación de Meta (fragmentos literales). Lo demás salió de búsquedas web en los dominios oficiales o de fuentes secundarias que coinciden entre sí. Cada dato indica su nivel de evidencia.

---

## Índice

0. [Resumen ejecutivo](#0-resumen-ejecutivo)
1. [Lo que ya existe en Yenda](#1-lo-que-ya-existe-en-yenda)
2. [Benchmark](#2-benchmark)
3. [Experiencia de usuario](#3-experiencia-de-usuario)
4. [Reglas de Meta y costos desde el 1-oct-2026](#4-reglas-de-meta-y-costos-desde-el-1-oct-2026)
5. [Arquitectura](#5-arquitectura)
6. [Seguridad y cumplimiento](#6-seguridad-y-cumplimiento)
7. [Storage](#7-storage)
8. [Copiloto IA "Generar respuesta"](#8-copiloto-ia-generar-respuesta)
9. [Plan por fases](#9-plan-por-fases)
10. [Riesgos y preguntas abiertas](#10-riesgos-y-preguntas-abiertas)
11. [Fuentes](#11-fuentes)
12. [Registro de verificación (30-sep-2026)](#12-registro-de-verificación-30-sep-2026)

---

## 0. Resumen ejecutivo

**Qué es.** "Conversaciones" es una bandeja de WhatsApp dentro de Yenda. La pantalla tiene tres columnas: lista de chats, chat y panel derecho. Desde ahí la recepción atiende a las pacientes y agenda la cita en el mismo lugar, con el formulario real de la agenda. En el panel derecho completa la ficha, etiqueta a la paciente y ve su próxima cita, su deuda, sus presupuestos y sus seguimientos. Desde el cuadro de texto puede programar mensajes y plantillas para una fecha concreta. Encima de todo eso va un copiloto IA con el botón **"Generar respuesta"**. El copiloto responde a partir de la base de conocimientos de la clínica, muestra una vista previa y, si la recepcionista lo acepta, pasa el texto al cuadro para que lo edite y lo envíe. **La IA nunca envía nada por su cuenta.**

Es la fase F3 de Captación que ya estaba planificada (`COMING-UPDATES.md:281`), más el Copiloto IA V1 (`COMING-UPDATES.md:287-310`). No se parte de cero: el webhook, la captura de mensajes entrantes (migs 206/207), el alta con Coexistence, las plantillas y la pre-reserva ya existen.

**Por qué ahora:**
1. Yenda es Tech Provider aprobado (15-sep-2026) y ya tiene Coexistence conectado. La objeción número uno de venta ("no quiero perder mi app de WhatsApp") ya está resuelta.
2. **Desde el 1-oct-2026 Meta cobra los mensajes de servicio** a partir de 1.000 gratis por número al mes, y también las utility dentro de la ventana de 24 h. Ningún CRM le muestra a la clínica cuánto le cuesta cada mensaje, y Yenda puede hacerlo.
3. Hay plazos de Meta que obligan a tocar el código de WhatsApp de todas formas: el 15-oct-2026 se deprecan Embedded Signup v2 y v3 (la mayoría se migra sola a v4, pero una configuración v2 con featureType `coex` caería al flujo estándar, **sin Coexistence**); los usernames/BSUID llegan al resto del mundo "desde sep-2026" (con ellos el capturador actual **pierde mensajes**); el 27-oct-2026 dejan de funcionar parámetros heredados de Graph en todas las versiones, y Graph v21.0 caduca el 21-ene-2027.
4. Ningún CRM genérico agenda contra la agenda real, cobra con caja ni cierra el circuito "anuncio → paciente → S/ cobrados". Ese es el hueco de Yenda.

**Recomendación.** Construirlo en cinco bloques. Cada uno se puede entregar por separado y **ninguno cambia el comportamiento de la agenda**: 0 triggers en sus tablas, 0 consultas nuevas en `/scheduler` para orgs sin el addon, y para orgs con addon un presupuesto medible (badge ≤ 2 KB gzip cargado en diferido, 1 consulta de conteo; diferencia de bundle de `/scheduler` ≤ 1 KB gzip por un cambio aditivo en el formulario de cita). Detalle en §5.1.

| Bloque | Qué entrega | Criterio de salida |
|---|---|---|
| **F0: endurecimiento** | Arreglos de seguridad y de Meta que ya son deuda (RLS, secretos, REVOKE de RPCs, BSUID, Coexistence completo, Graph v26, token de 60 días) y **migración a Vercel Pro** | Checklist de la sección 6.7 en verde |
| **F3a: MVP "reemplaza a Leadsales"** | Bandeja en tiempo real, media, notas, etiquetas, respuestas rápidas, panel con Agendar, programados, costo visible, ARCO y borrado de media | Durante 5 días hábiles, **≥ 90 % de las conversaciones con mensaje entrante se atienden en Yenda** (ver criterios medibles en §9) |
| **F3b: operación fina** | Plantillas relativas a la cita, métricas, búsqueda en el contenido, push | % de leads agendados medible por campaña |
| **F4: Copiloto IA V1** | "Generar respuesta" con base de conocimientos, guardrails y bandeja de brechas | 100 % de exactitud en precios y 100 % de recall en señales de alarma sobre el set de evaluación; requisitos del D.S. 115-2025-PCM cumplidos |
| **F5-F6** | IA proactiva y autopiloto con derivación, difusión segmentada, Instagram/Messenger | Solo tras 60 días de F4 sin incidentes (incidente definido en §9) |

**Costo mensual aproximado para una clínica mediana** (1.500 conversaciones al mes, sin campañas de marketing; tipo de cambio S/ 3,40) *(estimación)*:

| Rubro | Quién lo paga | USD/mes | S/ mes |
|---|---|---|---|
| Meta (servicio + recordatorios utility) | **La clínica, directo a Meta** (modelo Tech Provider) | ≈ 246 (≈ 150 si se aplican las palancas de ahorro de §4.5) | ≈ 836 (≈ 510) |
| IA: 3.000 sugerencias al mes | Yenda (se traslada en el precio) | Haiku 4.5: 11 · Sonnet 5.5: 35-44 · Opus 5.5: 60-78 (piso sin / con ~300 tokens de pensamiento, §8.6) | 39 · 119-149 · 202-264 |
| Infraestructura adicional (Supabase + Vercel) | Yenda | < 1 (variable; el plan Vercel Pro es un costo fijo aparte) | < 3,4 |

Clínica chica (300 conversaciones): Meta ≈ US$ 22,50 (S/ 77), casi todo dentro de la franquicia gratuita; IA US$ 4,5-28. El costo que puede sorprender a la clínica es el de Meta, no la infraestructura. Por eso el producto muestra el costo antes de cada envío. Con Opus, el costo de IA supera los S/ 99 del addon desde ~450-500 conversaciones al mes (~350 contando el pensamiento).

**Decisiones que te tocan a ti (detalle en cada sección):**
1. **Empaquetado y precio.** ¿La bandeja entra en el addon Captación (hoy S/ 99/mes, oculto) o sale como addon propio? ¿El copiloto IA se incluye con una cuota o se vende aparte? (§8.6)
2. **Modelo de IA del copiloto:** Opus 5.5, Sonnet 5.5 o Haiku 4.5 (costo relativo ≈ 100 / 60 / 20 como piso; ≈ 100 / 57 / 15 si se suman ~300 tokens de pensamiento, que en Opus 5.5 no se pueden desactivar). (§8.6)
3. **Motor de mensajes programados:** `pg_cron` + `pg_net` en Supabase (recomendado, US$ 0), con Vercel Cron por minuto como respaldo una vez en Pro, o Upstash QStash. (§5.6)
4. **Retención y cuotas de storage.** El plan de 100 MB no aguanta un chat con fotos y audios. Opciones: exigir el plan de 2 GB, o retener la media 30 días en ese plan. Por defecto, 180 días de media y 24 meses de texto. (§7)
5. **Coexistence.** ¿Importamos el historial de la app (solo se puede **una vez** y dentro de las **24 h** posteriores al alta)? ¿Cuántos días hacia atrás: 90 recomendados o hasta 6 meses? (§4.6)
6. **Quién ve qué.** ¿El doctor ve solo sus conversaciones asignadas o las de sus pacientes? ¿El rol `member` queda sin acceso? (§6.3)
7. **Lo legal, antes de la IA.** Activar HIPAA readiness con Anthropic (BAA estándar autoactivable en Console > Settings > Privacy, que Anthropic declara alternativa a ZDR) o firmar ZDR con ventas, y en cualquier caso corregir la política de privacidad, que hoy dice "zero-data-retention" sin contrato. Publicar el contrato de encargo Yenda–clínica y el opt-in de WhatsApp. (§6.5)

**Requisitos previos que debes conocer (no son opcionales):**
1. **Migrar a Vercel Pro antes del piloto.** El repo confirma que hoy se usa el plan Hobby (`.github/workflows/cron-bridge.yml` existe "mientras el plan de Vercel (Hobby) no los ejecute"). Vercel define Hobby como uso personal no comercial, y el uso comercial es causa frecuente de pausa de la cuenta. Una pausa apaga la agenda, el webhook de Meta y el dispatcher de programados a la vez. Pro también habilita Cron por minuto como respaldo del `pg_cron` ([Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines)). (§5.6, §5.11)
2. **El plazo de la ley de IA peruana puede estar ya vencido.** Según varias fuentes secundarias, el plazo de adecuación al D.S. 115-2025-PCM para implementadores privados de salud fue de 1 año desde la publicación y venció el **10-sep-2026**; una fuente dice 2 años [NO VERIFICADO en el texto oficial]. Si rige 1 año, la transparencia, la supervisión humana, el registro del sistema de IA y la evaluación de riesgo ya aplican hoy al asistente de reportes y al futuro copiloto. Un abogado debe confirmarlo y ver si Yenda califica como MYPE. (§6.5 fila 11)
3. **HIPAA readiness / BAA de Anthropic antes de mandar PHI al copiloto.** La página oficial de retención dice que, fuera de los "Covered Models" (Opus 5.5, Sonnet 5.5 y Haiku 4.5 no lo son), prompts y salidas no se retienen por defecto; la política comercial habla de borrado dentro de 30 días. Hay que confirmar con Anthropic qué rige para la organización de Yenda y activar el BAA desde la Console. (§6.5 fila 6, §8.6)

---

## 1. Lo que ya existe en Yenda

### 1.1 Antecedentes documentados

| Documento | Qué dice | Relación con este diseño |
|---|---|---|
| `COMING-UPDATES.md:274-285`, "Módulo Captación, fases pendientes" | F1 (capturador silencioso, mig 206) y F2 (addon beta y panel de campañas, mig 207) **entregadas**. **F3, "Chat con panel de acciones": bandeja, botón Agendar con teléfono precargado, programar mensaje con la regla de 24 h, estados del lead. Pendiente.** F5: IA de no-conversión. | **Este documento es F3.** |
| `COMING-UPDATES.md:287-310`, "Copiloto IA de recepción" | Escalera V1 copiloto → V2 proactivo → V3 autopiloto. Base automática + capa blanda editable + voz de la clínica + bandeja de brechas. **"El precio se cita textual del catálogo o no se cita."** Secuencia acordada: primero F3 y después el copiloto. | Sección 8. Único cambio: en V1 el botón "Copiar" (portapapeles) pasa a ser **"Usar"**, que inserta el texto en el cuadro de la bandeja. |
| `COMING-UPDATES.md:1297-1318`, "CRM Multi-canal" | Bandeja unificada tipo Kommo/Leadsales. Fase 1 solo WhatsApp; después Instagram y Messenger; después automatizaciones. | F6. |
| `CHANGELOG.md:537` | Roadmap: "V1.1: WhatsApp CRM (chat directo, tipo Leadsales)"; "V1.3: mensajes masivos". | Masivos: F5, con tope de gasto. |
| `CHANGELOG.md:4327` | "Se vende por el resultado (nunca 'CRM de WhatsApp')". | Nombre comercial "Conversaciones"; el pitch es "leads agendados y S/ cobrados por campaña". |
| `PRD.md:262` | Declara `ai_conversations` y `ai_messages`, que **no existen** en ninguna migración. | El PRD está desfasado; conviene corregirlo cuando se implemente. |
| `docs/meta-app-review.md` §2, §4 | Se le declaró a Meta "no enviamos campañas de marketing" y que los datos "no se comparten con terceros ni se usan para entrenar modelos". | Los masivos y la IA exigen actualizar las declaraciones y la política de privacidad (§6.5). |

### 1.2 Qué se reutiliza del código

| Pieza | Dónde | Cómo se reutiliza |
|---|---|---|
| Webhook con HMAC `timingSafeEqual`, sobre el cuerpo crudo | `app/api/whatsapp/webhook/route.ts:143-190` | Se mantiene; se reemplaza lo que hace después de validar (§5.3) |
| Captura de entrantes idempotente por `wamid` | `lib/whatsapp/capture.ts:85-195`, mig 206 | La lógica pasa a un RPC `wa_ingest` |
| `wa_conversations` (una por teléfono y org, `patient_id`, `lead_status`, referral congelado) | `206_wa_capture.sql:20-42` | **Se amplía, no se duplica** (§5.2) |
| Número → org por `phone_number_id` activo (índice único) | mig 262 | Se mantiene |
| Tokens AES-256-GCM, un solo camino de escritura | `lib/whatsapp/config-store.ts` | Se mantiene; se mueven los secretos fuera del alcance de `authenticated` (§6.2) |
| Plantillas Meta (CRUD, envío, sincronización, validación previa) | `app/api/whatsapp/templates/*`, `lib/whatsapp/templates.ts`, `lib/whatsapp/send.ts` | Selector de plantillas del cuadro de texto |
| Reserva anti-duplicado (`sending` + índice único parcial) | mig 249, `app/api/notifications/send/route.ts:299-400` (solo esta ruta; el cron de recordatorios **no** la usa, ver D18) | Patrón para todo envío del chat (`client_msg_id`) |
| Plantillas de portapapeles (6 tipos) | mig 139/274, `lib/whatsapp-clipboard-config.ts` | Semilla de las respuestas rápidas |
| Formulario de cita | `app/(dashboard)/scheduler/appointment-form-modal.tsx` (props `:203-259`) | Botón **Agendar** del panel, cargado con `dynamic()` |
| Enlace profundo `/scheduler?new=1&patient_id=…` | `scheduler/page.tsx:273-309` | Alternativa de respaldo para Agendar |
| Huecos libres | `GET /api/scheduler/available-slots` (exige `doctor_id`) | "Ver huecos" y "Copiar huecos al chat"; el panel pide servicio → doctor (`doctor_services`) antes de consultar |
| Pre-reserva con cuenta regresiva | mig 274, `prereserva-button.tsx` | "Le separo el horario mientras paga" |
| Tarjeta de contexto clínico | `scheduler/patient-context-card.tsx` | Tal cual, en el panel (solo roles que ya la ven) |
| Deuda y dinero de tratamientos | `lib/patient-debt.ts`, `lib/treatments/money.ts` | **Se importan, nunca se reescriben** |
| Seguimientos (origen polimórfico sin FK) | `clinical_followups` (mig 184) | Se agrega `'wa_conversation'` al CHECK de `source_type` |
| Hoy civil | `lib/org-time.ts`, `useOrgToday()` | Programados; falta el helper `zonedLocalToUtc` |
| Addons y roles | `hooks/use-org-addons.ts`, helpers de mig 235 | Gating por addon y RLS con `is_active` |
| Auditoría clínica con `after()` | `lib/audit/clinical-access.ts` | Se extienden los tipos a `wa_*` |
| Aviso de error de carga | `app/(dashboard)/scheduler/data-load-error.tsx` | Toda lectura de la bandeja **lanza** su error |

### 1.3 Deuda actual que la bandeja hereda y debe cerrar primero (F0)

| # | Problema | Evidencia | Efecto si no se arregla |
|---|---|---|---|
| D1 | La RLS de `wa_*` no filtra `is_active` ni rol | `206_wa_capture.sql:67-80` | Un exmiembro desactivado sigue leyendo chats; el doctor ve todos los leads |
| D2 | Cualquier miembro puede leer (SELECT) `access_token` y `register_pin`, aunque estén cifrados | `048:25-32` | Amplía la superficie de ataque del canal |
| D3 | El estado de una plantilla se actualiza **por nombre en todas las orgs** | `webhook/route.ts:120-123` | Escritura cruzada entre orgs |
| D4 | El webhook es síncrono y en serie (3-4 consultas por mensaje, un UPDATE por estado) antes de devolver el 200 | `route.ts:58-136`, `capture.ts:117-185` | Incumple la latencia que pide Meta (mediana ≤ 250 ms) cuando hay chat |
| D5 | `if (!msg.from) continue` y `phone_normalized NOT NULL` | `capture.ts:59` | Con usernames/BSUID se **descartan mensajes en silencio** |
| D6 | Coexistence incompleto: no hay `smb_message_echoes`, `history`, `smb_app_state_sync` ni `account_update`; nunca se llama a `smb_app_data`; se llama a `/register` | `embedded-signup/route.ts:213-235` | Lo que la recepción escribe desde el celular no aparece; la desconexión no se detecta |
| D7 | Solo se pueden enviar plantillas; `/api/whatsapp/send` no tiene rate limit ni reserva previa y lo usa cualquier rol | `send/route.ts`, `lib/whatsapp/types.ts:124-133` | Envíos duplicados; abuso = costo real desde el 1-oct |
| D8 | `.single()` sobre `organization_members` sin filtrar la org | `send/route.ts:41-46`, `config/route.ts` | Un usuario con dos orgs recibe 403 o actúa sobre la org equivocada |
| D9 | No se guarda la caducidad del token de 60 días | `docs/meta-app-review.md` §6 | La bandeja queda muda de golpe el día 60 |
| D10 | Graph `v21.0` fijo | `lib/whatsapp/client.ts:11` | Caduca el 21-ene-2027 (confirmado en el changelog de v26, §4.7) |
| D11 | `last_message_at` se asigna sin `GREATEST` | `capture.ts:128` | Un reintento tardío desordena la bandeja y la ventana de 24 h |
| D12 | Ningún camino de borrado para `wa_*`; `/data-deletion` promete borrar por teléfono | `149_account_deletion.sql`, `app/(public)/data-deletion/page.tsx:98-105` | Promesa pública incumplida (Ley 29733, Meta) |
| D13 | No hay planificador con precisión de minutos (los crons de Vercel son diarios) | `vercel.json`, `.github/workflows/cron-bridge.yml` | Los programados necesitan otro motor |
| D14 | El cruce teléfono ↔ paciente no tiene índice | `207:107`, `262:131` | Cada apertura del panel recorre toda la tabla `patients` de la org |
| D15 | Rate limiter en memoria; la IA registra `tokens_used: 0` | `lib/rate-limit.ts:11`, `ai-assistant/route.ts:802` | No hay tope real de costo |
| D16 | La pseudonimización trabaja por nombre de columna, no por texto libre | `lib/pseudonymize-phi.ts` | Un "soy Ana, DNI 4…" llegaría intacto al LLM |
| D17 | El webhook no usa Sentry (solo `console.error`) | — | Los fallos de captura no se ven |
| D18 | El cron de recordatorios envía y **después** inserta en `whatsapp_message_logs` con `status='sent'`, sin reserva previa (solo `/api/notifications/send` usa el claim de la mig 249) | `app/api/cron/reminders/route.ts:505-535` | Riesgo de recordatorio duplicado si el cron se reintenta el mismo día |
| D19 | El verify token del webhook tiene fallback a la BD | `app/api/whatsapp/webhook/route.ts:26-40` | Superficie innecesaria: debe salir solo del entorno |

---

## 2. Benchmark

Los precios que solo aparecen en comparadores llevan "(3.º)". Detalle y fuentes en §11.

| Producto | Precio típico para 3-4 recepcionistas, API oficial | Agenda nativa desde el chat | IA que sugiere con base de conocimientos | Programar 1:1 | Queja principal |
|---|---|---|---|---|---|
| **Leadsales** | US$ 133/mes (Profesional, 4 usuarios) (3.º); el plan Básico usa QR **no oficial** | No | No | Sí (texto, audio) | "Sin chatbot real"; riesgo de bloqueo con QR; cobros después de cancelar |
| **Kommo** | US$ 25-45 por usuario al mes (Base 25, Advanced 35, Pro 45), compra mínima de 6 meses [SECUNDARIA] | No (requiere integración) | Sí (URL/PDF/texto; se revisa y se envía) | Solo difusión programada | Soporte lento; curva de aprendizaje dura |
| **Respond.io** | US$ 159+ (Starter no sirve) + cobro por contacto activo | No | Sí (AI Assist, usa Snippets) | ? | Caro; el cobro por contacto activo |
| **Wati** | Desde US$ 39-79/mes (5 usuarios; Growth 39-59, Pro 79-119, Business 229-279) + **recargo de alrededor del 20 % sobre las tarifas de Meta** [SECUNDARIA] | No | (Sí) [NO VERIFICADO] | Campañas | "Todo se cobra aparte"; el recargo sobre Meta |
| **Callbell** | US$ 15-20 por usuario (mínimo 3) + US$ 54 de WhatsApp | No | Solo en Enterprise | Sí (recordatorios) | Latencia; dos agentes responden a la vez |
| **Chatwoot** (OSS) | US$ 19-99 por agente; self-host gratis | No | Sí (Copilot) + autopiloto (Captain) | Campañas | App móvil inestable; bug de Coexistence con plantillas |
| **Doctocliq** (salud, Perú) | Gratis a US$ 49 + paquetes de WhatsApp | Sí, **mediante IA autónoma** (Soyla) | — | — | — |
| **Doctoralia** | [NO VERIFICADO] | Sí, **mediante IA de voz** (Noa) | — | — | Sin bandeja humana |
| **Yenda (propuesto)** | Addon (hoy S/ 99/mes), **sin cobro por usuario** | **Sí: formulario real, huecos y pre-reserva** | V1 con precio textual del catálogo | Sí, con regla de ventana y plantilla de respaldo | — |

**Lectura del mercado.** Los CRM genéricos tienen buena bandeja y no tienen agenda. Los SaaS de salud que agendan lo hacen con IA autónoma y sin una buena bandeja humana. **La posición de Yenda es la bandeja humana excelente, con agenda, caja y campaña integradas, y la IA como copiloto.**

### 2.1 Imprescindibles: sin esto la recepción vuelve a la app de WhatsApp Business
1. Tiempo real (< 2 s), sonido, no leídos en el sidebar y en el título de la pestaña.
2. Estados ✓ / ✓✓ / ✓✓ azul / ⚠, **que nunca retroceden** (la carrera de estados está documentada como bug en Chatwoot, issue #14529).
3. Media entrante completa: fotos, notas de voz con velocidad, PDF, video, ubicación, contactos, stickers, reacciones. **Se descarga al llegar** (el id caduca a los 7 días).
4. Enviar texto, imagen y PDF; responder citando un mensaje.
5. **Ecos de Coexistence**: lo que se escribe desde el celular aparece en el hilo.
6. Respuestas rápidas con `/`.
7. Etiquetas con color y filtro.
8. Notas internas.
9. Asignación simple ("Mías" / "Sin asignar").
10. Búsqueda.
11. Marcar como no leído, fijar, resolver.
12. Ventana de 24 h visible y plantillas cuando está cerrada.
13. Celular usable.
14. **Borradores por conversación** (su ausencia es una queja explícita contra Trengo).
15. **Anticolisión con guarda en el servidor**, no solo Presence: dos recepcionistas no pueden mandar dos respuestas distintas (y cobradas) a la misma paciente sin verlo (la queja documentada contra Callbell). Ver §3.10 y §5.12.

### 2.2 Diferenciadores de Yenda (Leadsales y Kommo no los pueden copiar)
| Diferenciador | Por qué gana |
|---|---|
| **Agendar en 2 clics** con el formulario real, huecos reales y pre-reserva | Los CRM obligan a copiar y pegar entre herramientas |
| La confirmación de la cita **se envía al mismo hilo** | Se cierra el ciclo sin portapapeles |
| Ficha con próxima cita, deuda clínica, presupuestos, seguimientos y tratamientos | Contexto que un CRM de ventas no tiene |
| **Circuito anuncio → paciente → caja** (F1/F2 ya capturan el referral) | "Esta campaña generó S/ X cobrados", no "leads" |
| **Costo del próximo mensaje** y "servicio gratis: ≈ 812/1.000 este mes" (estimación intradía, §4.5) | Nadie lo muestra, y desde el 1-oct es plata real |
| Plantillas **relativas a eventos clínicos** ("control 30 días después de la cita; se cancela si ya agendó") | Kommo y Wati solo programan por fecha fija |
| IA que **cita el precio textual del catálogo** y registra brechas | Los demás generan desde documentos sueltos |
| Estado del lead **derivado de la agenda** (agendado, asistió, pagó) con **una sola función** `wa_lead_outcome(conv_id)`, la misma que usa Captación (§5.2) | Cero mantenimiento del embudo y la misma cifra en la bandeja y en Captación |
| Sin costo por usuario | Frente a US$ 13-99 por usuario de la competencia (Chatwoot Enterprise cobra US$ 99 por agente) |

### 2.3 Trampas: complejidad que no le sirve a una clínica
| No hacer | Alternativa de Yenda |
|---|---|
| Pipelines Kanban configurables (Kommo) | Estado del lead **derivado al leer** con `wa_lead_outcome` (agendado, asistió, facturado clínico; §5.2) y `lead_status` manual solo para "perdido" y "no_interesado". El Kanban puede existir como **vista** |
| Constructor de chatbots por árbol | Copiloto sobre la base de conocimientos |
| Difusión masiva de marketing en el MVP | F5, con opt-in registrado y tope de gasto |
| Round-robin, capacidad por agente, SLAs de varios niveles | "Mías / Sin asignar" más el tiempo de espera coloreado |
| Tabla "contactos" paralela a pacientes | La conversación tiene `patient_id` opcional; un lead no es un segundo paciente |
| Instagram y Facebook en el MVP | F6 |
| Autopiloto IA desde el día 1 | Escalera V1 → V3 |
| Grabar notas de voz desde el navegador | F3b; en el MVP se escuchan, no se graban |

---

## 3. Experiencia de usuario

### 3.1 Ruta y carga
- Ruta propia **`app/(dashboard)/inbox/`**, con la etiqueta "Conversaciones" en el sidebar y visible solo con el grant del addon (`requiresAnyAddon`). APIs bajo `app/api/inbox/*`.
- **Nada del chat se monta en la agenda.** El sidebar solo recibe el número de no leídos, y el badge se monta únicamente si la org tiene el addon y el rol tiene acceso, cargado con `dynamic()` después de `requestIdleCallback` (presupuesto en §5.1).
- El panel derecho y sus secciones se cargan en diferido, al abrirse. `patient-drawer.tsx` (2.516 líneas) no se importa entero: se extraen subcomponentes (datos básicos, etiquetas, próximas citas, deuda).

### 3.2 Escritorio (≥ 1280 px): tres columnas

```
┌──────────┬───────────────────────────┬───────────────────────────────────────────┬────────────────────────────┐
│ SIDEBAR  │ LISTA (340 px)            │ CHAT (flexible)                           │ PANEL DERECHO (360 px)  [x]│
│          │ [Buscar nombre/tel/DNI]   │ María Quispe · +51 987… · [Paciente]      │ MARÍA QUISPE  [Paciente]   │
│ Agenda   │ [Sin responder 4][Mías]   │ Asignada: Ana v  Estado: Conversando v    │ DNI 4xxxxxxx · 32 años     │
│ Pacientes│ [Sin asignar][Todas]      │ #fertilidad  #ads-sep       [Resolver][..]│ [Editar] [Abrir ficha ->]  │
│ Conver-  │ [Etiquetas v][Más filtros]│ ─────────────── Hoy ───────────────       │ ── Etiquetas ──            │
│ saciones │───────────────────────────│ ┌───────────────────────────────┐         │ #fertilidad #vip  [+]      │
│   (4)    │ * María Quispe  12m (!) 2 │ │Hola, ¿cuánto cuesta la eco    │ 10:02   │ ── Estado del lead ──      │
│ Captación│   ¿cuánto cuesta la eco…  │ │transvaginal? ¿atienden sáb?   │ [IA]    │ Conversando v              │
│ Caja     │   Ads-sep · ventana 21h   │ └───────────────────────────────┘         │ ── Próxima cita ──         │
│ …        │   Asig: Ana               │   ┌─ NOTA INTERNA · Ana ────────────────┐ │ Ninguna                    │
│          │───────────────────────────│   │ Es hermana de la Sra. Rosa, priori- │ │ [Agendar] [Ver huecos]     │
│          │   Lead +51 955…   3m    1 │   │ dad (fondo amarillo, solo equipo)   │ │ [Pre-reservar]             │
│          │   Buenas tardes, quería…  │   └─────────────────────────────────────┘ │ ── Cuenta (según rol) ──   │
│          │   Ads-sep · ventana 23h   │          ┌──────────────────────────────┐ │ Deuda clínica: S/ 120      │
│          │───────────────────────────│          │Sí atendemos sábados 8-13 h   │ │ Presupuesto #214 pendiente │
│          │   Rosa T.  Cita mañ 9:00  │          └──────────── 10:05 ✓✓ · Ana ──┘ │ ── Seguimientos (1) ──     │
│          │   Gracias doctora  [prog] │   ── enviado desde el celular ✓✓ ──       │ ── Historial: 3 citas > ── │
│          │                           │ ┌───────────────────────────────────────┐ │ ── Campaña ──              │
│          │ (lista virtualizada,      │ │ VENTANA ABIERTA · cierra 15:42 (5h12m)│ │ "Eco sep" · 1er contacto   │
│          │  scroll por cursor)       │ │ Próx.: servicio · gratis (≈ 812/1.000)│ │ 28-sep · 2 días sin agendar│
│          │                           │ │ 1 programado >                        │ │ ── Archivos del chat (4) ──│
│          │                           │ ├───────────────────────────────────────┤ │ ── Notas ──                │
│          │                           │ │ [Responder | Nota interna]            │ │                            │
│          │                           │ │ Escribe…  ( / atajos · IA )           │ │                            │
│          │                           │ │ [emoji][adjuntar][Plantilla][Generar] │ │                            │
│          │                           │ │               Ana está viendo  [Enviar v]│                          │
│          │                           │ └───────────────────────────────────────┘ │                            │
└──────────┴───────────────────────────┴───────────────────────────────────────────┴────────────────────────────┘
```

**Tablet (768-1279 px):** dos columnas (lista de 300 px | chat). El panel derecho se abre como `Sheet` encima del chat, con el botón (i) o la tecla `]`, y se cierra con Esc.

### 3.3 Celular (< 768 px)

```
 LISTA                        CHAT                            PANEL (pantalla completa)
┌──────────────────────┐     ┌──────────────────────┐        ┌──────────────────────┐
│ Conversaciones  [Q]  │     │< María Q. [Pac]  (i) │        │< Ficha       [Editar]│
│[Sin resp 4][Mías][v] │     │ Conversando v #fert  │        │ MARÍA QUISPE         │
│* María Q. 12m(!) (2) │ ->  │ ┌────────────────┐   │  (i)-> │ #fertilidad #vip [+] │
│  ¿cuánto cuesta…     │     │ │¿cuánto cuesta…?│IA │        │ Próxima cita: —      │
│  ventana 21h · Ads   │     │ └────────────────┘   │        │ [Agendar]            │
│  +51 955…  3m  (1)   │     │      ┌───────────┐   │        │ [Ver huecos]         │
│  Buenas tardes…      │     │      │Sí, sábados│✓✓ │        │ Deuda: S/ 120 (rol)  │
│  Rosa T. Cita mañ    │     │      └───────────┘   │        │ Seguimientos (1) >   │
│                      │     │ Abierta · cierra 15:42│       │ Historial >          │
│                      │     │ [Resp | Nota]        │        │ Campaña >            │
│ [+ Nuevo (plantilla)]│     │ [emoji][Escribe…][>] │        │ Archivos >           │
└──────────────────────┘     │ [IA][Plantilla][Prog]│        └──────────────────────┘
                             └──────────────────────┘
                (el cuadro de texto queda pegado al teclado: hooks/use-visual-viewport.ts)
```

- En el celular, Enter es salto de línea y el botón de enviar envía. Una pulsación larga sobre el botón abre "Programar…".
- "+ Nuevo (plantilla)" crea una conversación con `origin='outbound'`: no cuenta como contacto entrante ni como lead en las cohortes de Captación (§5.2).
- "Agendar" abre el formulario de cita a pantalla completa. Al guardar, vuelve al chat con la confirmación lista para enviar.
- Push web en iOS: exige instalar la PWA [NO VERIFICADO: requisito iOS 16.4+]. En el MVP bastan el sonido y el contador con la pestaña abierta.

### 3.4 Lista de conversaciones
- **Filtros rápidos:** Sin responder (el último mensaje es entrante) · Mías · Sin asignar · Todas.
- **Más filtros:**
  - etiquetas (y/o);
  - ventana: abierta / vence en < 2 h / vencida;
  - cita: con cita futura / sin cita / sin cita y lead de más de 48 h. **Se calcula solo para las 30 filas visibles** (índice `idx_appointments_patient`) o con un campo `next_appointment_at` refrescado de forma perezosa; **nunca** con trigger en `appointments` ni con joins a la agenda sobre toda la bandeja;
  - campaña o anuncio (`first_referral_*`, `captacion_ad_labels` de la mig 263);
  - estado del lead;
  - paciente vinculado / solo lead;
  - con programados.

  **Sin filtro "con deuda" en el MVP:** filtrar toda la bandeja por deuda exigiría leer `appointments` y `patient_payments` (tablas calientes de la agenda, en el mismo Postgres Micro) en cada carga y cada refresco por Realtime. La deuda se ve en el panel de cada conversación (§3.7).

  La última vista se recuerda en `localStorage` (con try/catch).
- **Orden:** última actividad. En "Sin responder", **la espera más larga primero**, para que el lead no se enfríe.
- **Indicadores por fila:**
  - no leídos;
  - tiempo de espera: verde < 5 min, ámbar 5-30, rojo > 30; configurable y solo en horario de atención;
  - horas restantes de la ventana de 24 h y, aparte, "gratis hasta …" si hay una FEP abierta (72 h **desde la 1.ª respuesta de la clínica**, solo si esa respuesta salió dentro de las 24 h del mensaje por anuncio; ver §4.1). Un lead de anuncio aún sin responder muestra "anuncio · responde antes de HH:MM para abrir 72 h gratis";
  - próxima cita;
  - programados;
  - campaña;
  - persona asignada;
  - "Paciente" o "Lead";
  - opt-out.
- **Búsqueda:** nombre, teléfono normalizado y DNI (si hay ficha vinculada). La búsqueda en el texto de los mensajes llega en F3b.

### 3.5 Chat
- **Burbujas:**
  - entrantes a la izquierda, salientes a la derecha;
  - el pie indica el autor: "Ana", "desde el celular" (eco de Coexistence), "Automático · recordatorio" o "Programado por Ana";
  - separadores de día, divisor "Nuevos" y botón "↓ 3 nuevos".
- **Estados:**
  - reloj = en cola (envío optimista);
  - ✓ enviado, ✓✓ entregado, ✓✓ azul leído;
  - ⚠ fallido, con el motivo en lenguaje humano y una acción: "Reintentar" o, si falló porque la ventana estaba cerrada, "Enviar como plantilla" (código 131047 [NO VERIFICADO: código exacto]).
- **Media:**
  - miniatura WebP con carga diferida y lightbox;
  - audio con velocidad 1×/1,5×/2×;
  - documento con icono, nombre y tamaño;
  - ubicación con enlace al mapa;
  - reacciones bajo la burbuja;
  - "mensaje eliminado" o "mensaje editado" (ecos);
  - tipo no soportado → "Abrir en WhatsApp".
- **Responder citando:** con hover o deslizando, "Responder". El mensaje citado queda encima del cuadro de texto.

### 3.6 Cuadro de texto (composer)
- **Barra de ventana y costo, fija encima del cuadro:**

| Estado | Texto |
|---|---|
| Ventana abierta | "Ventana abierta · cierra 15:42 (5 h 12 min)" (verde) |
| Quedan < 2 h | Igual, en ámbar |
| Entró por anuncio, sin responder aún | Dos indicadores separados: "Ventana 24 h · cierra mar 10:02" y "Anuncio · si respondes antes de mar 10:02, gratis 72 h desde tu 1.ª respuesta" (solo si la paciente escribió desde Android o iOS; escritorio y web no abren FEP) |
| FEP abierta | "Ventana 24 h · cierra …" y, aparte, "Gratis hasta vie 10:40 (72 h desde tu 1.ª respuesta)". La hora sale de `entry_point_expires_at`, fijada al enviar la 1.ª respuesta por API (un eco desde el celular no la fija, §5.3) y confirmada con `pricing`/`conversation` del webhook de estado |
| Ventana cerrada | "Ventana cerrada · solo plantillas". El campo de texto se reemplaza por [Elegir plantilla] |
| Costo dentro de la ventana | "Servicio · gratis (≈ 812/1.000 este mes)"; pasada la franquicia, "Servicio · ≈ US$ 0,030". El contador es una estimación intradía (la cifra oficial sale de `pricing_analytics`, §4.5) y no cuenta las reacciones, que son gratis |
| Costo de plantilla | "Utility ≈ US$ 0,030 · Marketing ≈ US$ 0,0703". Se muestra **aunque la ventana esté abierta**, porque desde el 1-oct la utility dentro de la ventana también se cobra |

Las tarifas se guardan en configuración, no en el código (tabla `wa_pricing(country, category, usd, valid_from)`), y se corrigen contra el CSV oficial de Meta.
- **Modos:** [Responder | Nota interna]. En el modo nota **todo el cuadro se vuelve amarillo** y el botón dice "Guardar nota", para que nunca se le envíe algo interno a la paciente.
- **Teclas:** Enter envía y Shift+Enter hace salto de línea (escritorio).
- **`/` respuestas rápidas:**
  - búsqueda por atajo y variables `{nombre}`, `{doctor}`, `{fecha_cita}`, `{sede}`, resueltas con `resolveVariableValues` (`lib/whatsapp/send.ts:16`);
  - si falta un dato, la variable se marca en rojo y no deja enviar.
- **Adjuntar:** imagen, PDF o documento, arrastrando o pegando. Se validan los límites de Meta (§4.4).
- **Plantilla:**
  - solo las APROBADAS, agrupadas por categoría y con su costo;
  - formulario de variables precargado y vista previa como burbuja.
- **Enviar ▾** (botón dividido): "Enviar ahora" | "Programar…".
- **Generar (IA):** ver §8.5.
- **Deshacer 5 s:** el envío se retiene 5 s en el navegador antes de llamar a la API. Es diseño propio: no se confirmó si la Cloud API permite borrar un mensaje ya enviado.
- **Leído y escribiendo:** al abrir el chat se marca como leído. Opcionalmente, la paciente ve "escribiendo…" mientras la recepcionista escribe (dura ~25 s o hasta que se envía). Ojo: eso **marca como leído** (✓✓ azul para la paciente). Es configurable por org.
- **Borrador por conversación:** contiene PHI (síntomas, precios de fertilidad), así que no puede quedar en PCs compartidas de recepción. En el MVP va en `sessionStorage`, o en `localStorage` con clave `draft:{user_id}:{conv_id}`, TTL de 24 h y borrado de todo `draft:*` al cerrar sesión y al cambiar de org; siempre con try/catch. La fila muestra "Borrador". En F3b, borrador en el servidor (RLS por autor) para pasar de la PC al celular.

### 3.7 Panel derecho (acordeón, cada sección carga al abrirse)
1. **Identidad.**
   - *Sin vincular:* "Número no asociado a un paciente", con [Buscar paciente] (sugerencias solo si el teléfono normalizado coincide exactamente; **nunca se fusiona automáticamente por nombre**) y [Crear paciente] (`patient-form-modal.tsx` con teléfono y nombre de perfil precargados, y origen = campaña).
   - *Vinculado:* nombre, DNI, edad, distintivo "Recurrente", [Editar], [Desvincular], [Abrir ficha completa].
2. **Datos editables mínimos:** nombres, apellidos, DNI, fecha de nacimiento, email, origen y los campos personalizados de la org marcados como "visibles en chat" (`patients.custom_fields`, mig 159). Se guardan al salir del campo y muestran un toast.
3. **Etiquetas:**
   - chips de color; `+` con autocompletado; "crear etiqueta" solo para owner/admin;
   - un clic en una etiqueta filtra la lista;
   - la etiqueta vive **siempre** en la conversación (`wa_conversation_tags`); al vincular un paciente se **copia** a `patient_tags` para `/patients`, sin moverla (§5.2).
4. **Estado del lead:**
   - los 5 estados de la mig 206;
   - "Agendado", "Asistió" y "Pagó" **se derivan al leer** con `wa_lead_outcome(conv_id)`, la misma función que usa Captación, así que también cuentan las citas creadas desde la agenda y dejan de contar las canceladas o las pre-reservas liberadas;
   - solo "Perdido" y "No interesado" se marcan a mano y piden un motivo (alimenta F5).
5. **Próxima cita y acciones:** [Agendar], [Ver huecos] (primero se elige servicio → doctor según `doctor_services`, porque `available-slots` exige `doctor_id`) con "Copiar huecos al chat" (inserta "Tenemos: sáb 4/10 9:00, 10:30…"), [Pre-reservar] con cuenta regresiva y la tarjeta "Enviar confirmación", que manda la plantilla **al hilo**.
6. **Historial:** últimas 5 citas y "Ver todo".
7. **Cuenta (según rol):**
   - deuda clínica obtenida con el RPC existente `get_patient_summary(patient_id)`, como hace `PatientDrawer`, o con `lib/patient-debt.ts` en el cliente; ningún RPC nuevo hace sus propias sumas (sería una tercera fórmula);
   - las ventas del POS van aparte y nunca dentro de "pagado/pendiente";
   - presupuestos pendientes con [Enviar PDF por WhatsApp], que registra `budget_records.sent_via='whatsapp'`;
   - si la lectura falla, se muestra el aviso de `data-load-error.tsx`, **nunca "S/ 0"**.
8. **Seguimientos:** los de `clinical_followups` y [+ Seguimiento] (`source_type='wa_conversation'`).
9. **Tratamientos:** activos, con su dinero de `lib/treatments/money.ts`.
10. **Notas administrativas** de la paciente. No es la historia clínica: la recepción no ve HC.
11. **Archivos del chat:** galería, con [Adjuntar a historia clínica] solo por acción explícita y solo para roles clínicos.
12. **Atribución:** anuncio, fecha del primer contacto, días hasta agendar y "Cerrado: S/ X cobrados" (solo pagos `COALESCE(source,'clinical')='clinical'`, igual que la mig 262).

### 3.8 Mensajes programados y plantillas en fecha
- **Crear:** atajos "Mañana 9:00", "Lunes 9:00", "En 3 días", "En 30 días", o fecha y hora **en la zona de la org** con la etiqueta "(hora Lima)". Nunca `new Date()`.
- **Regla de ventana al programar:** si la hora elegida cae después del cierre de la ventana, aparece el aviso "A esa hora la ventana estará cerrada: debe ser plantilla" y el cuadro pasa al selector de plantillas. Se puede guardar texto libre con una **plantilla de respaldo**.
- **Horario silencioso** por defecto de 21:00 a 8:00 (configurable): propone "mañana 8:00".
- **Plantilla relativa** (F3b): "Enviar `control_ginecologico` **30 días después de** [cita del 28-sep ▾]". Condiciones: ☑ cancelar si agenda antes · ☑ cancelar si hace opt-out · ☑ cancelar si se cancela la cita de origen. Las variables se resuelven **al enviar**.
- **Tira por conversación** encima del cuadro de texto:

```
┌ Programados (2) ───────────────────────────────────────────────────┐
│ mar 01-oct 09:00 · Texto · Ana · "¿Pudo revisar el presupuesto?"   │
│   Programado · respaldo: plantilla seguimiento_presupuesto          │
│   [Editar] [Enviar ahora] [Cancelar]                                │
│ lun 28-oct 09:00 · Plantilla control_30d (Utility ≈ US$ 0,03) · Ana │
│   Programado · se cancela si agenda   [Editar] [Cancelar]           │
└────────────────────────────────────────────────────────────────────┘
```

- **Estados visibles:** Programado · Enviando · Enviado · Fallido (con motivo) · Cancelado (quién y cuándo) · Omitido (ya agendó, opt-out, ventana cerrada sin plantilla, plantilla pausada) · Necesita plantilla. Si falla o se omite, se avisa al autor.
- **Vista global** (F3b): filtro "Con programados" y una tabla en Captación con fecha, paciente, tipo, autor, estado y costo estimado del mes.

### 3.9 Flujo "de mensaje a cita" (caso típico: lead de anuncio sin ficha)
1. Llega "Hola, ¿cuánto cuesta la eco? ¿atienden sábado?". El webhook la guarda en < 250 ms. La fila sube en "Sin responder" con el anuncio "Eco sep", "ventana 24 h" y el aviso "responde antes de 24 h para abrir 72 h gratis" (la conversación queda marcada como **elegible** para la FEP; la ventana gratis aún no está abierta).
2. Ana abre el chat. Se marca como leída y el Presence muestra "Ana está viendo" a sus compañeras. Opcionalmente, la paciente ve ✓✓ azul.
3. Ana pulsa **Generar** (F4) o escribe `/precio-eco`. El precio sale textual del catálogo con el sufijo según `igv_affectation`: "S/ 150.00 (incluye IGV)" si el servicio es gravado; sin ese sufijo si es exonerado o inafecto. Ana ajusta y envía. Como es la 1.ª respuesta y sale dentro de las 24 h, **abre la FEP**: este mensaje y todo lo de las 72 h siguientes es gratis (si la paciente escribió desde Android o iOS).
4. Ana pulsa **Ver huecos** → "Copiar huecos al chat" → envía "Tenemos sáb 4/10 9:00 o 10:30". Idealmente va en un solo mensaje, o en una lista interactiva en F3b.
5. La paciente elige 10:30. Ana pulsa **Agendar**: se abre `AppointmentFormModal` (cargado con `dynamic()`) con el teléfono y el nombre del perfil precargados.
   - **Choques de horario:** el modal detecta choques de consultorio y doctor **solo en el cliente**, con la prop `existingAppointments` (`appointment-form-modal.tsx:1270-1293`), y la base no tiene constraint de solapamiento. `/inbox` carga las citas (`appointment_date`, `office_id`, `doctor_id`, `start_time`, `end_time`) y los bloqueos del día y consultorio elegidos, y los vuelve a pedir al cambiar de fecha. Mejor aún: un RPC `appointment_conflicts(org, date, office, doctor, start, end)` que el guardado valide en el servidor. Nunca se pasa `[]`.
   - **Si no hay DNI**, Ana no lo pide por chat (la política de Meta desaconseja pedir identificadores completos). Envía el **enlace de pre-registro** de Yenda, o guarda la cita sin ficha y la conversación queda "por vincular". Ver la decisión pendiente en §10.
6. Al guardar:
   - la cita se inserta por el mismo camino que usa la agenda;
   - el modal devuelve el id con un cambio aditivo y compatible hacia atrás, `onSaved(result?: { appointmentId: string })` (hoy `onSaved: () => void` no lo devuelve);
   - `onSaved` llama a `POST /api/inbox/link` (`{conversation_id, appointment_id}`), que valida auth, membresía activa de esa org, addon y rol, y con service role invoca el RPC `wa_link_appointment(p_conv, p_appointment, p_actor)` (`p_actor` = usuario ya validado; el RPC comprueba que la cita y la conversación sean de la misma org). El RPC no es ejecutable por `authenticated` (§5.12). La misma ruta, con `patient_id`, invoca `wa_link_patient(p_conv, p_patient, p_actor)`. `wa_link_appointment` guarda `booked_appointment_id` (sin FK, **solo como rastro de atribución**) y registra el evento. No escribe "agendado": ese estado se deriva al leer con `wa_lead_outcome`, que valida la cita con LEFT JOIN a `appointments` y `status <> 'cancelled'` (una pre-reserva liberada se borra con DELETE, mig 274, y deja de contar sola);
   - **no se usa ningún trigger en `appointments`.**
7. Aparece la tarjeta "Enviar confirmación" con la plantilla y las variables resueltas. Ana pulsa Enviar y la confirmación sale **al hilo**.
8. Opcional: **Pre-reservar** en lugar de confirmar. El horario queda retenido con cuenta regresiva y el pago clínico confirma la cita (trigger ya existente en `patient_payments`, mig 274).
9. En Captación, el anuncio "Eco sep" suma 1 agendado. Cuando paga, suma "S/ 150 cobrados".

### 3.10 Microinteracciones
| Interacción | Diseño |
|---|---|
| Anticolisión | Presence por conversación: "Ana está viendo" y "Ana está escribiendo…". Si está asignada a otra persona: "Asignada a Ana · [Tomarla]" (bloqueo suave). Todo eso es del cliente y best-effort (Presence se cae con la reconexión y no ve lo que se responde desde el celular), así que **la guarda real está en el servidor**: `wa_claim_outbound` recibe `p_expected_last_msg_id` y, si desde ahí entró un mensaje o salió uno de otro autor (incluidos los ecos), devuelve 409 `stale_thread` con los mensajes nuevos. La UI los muestra y ofrece "Enviar igual" (`p_force=true`, registrado en `wa_conversation_events`). Ver §5.4 |
| Envío optimista | La burbuja aparece al instante con el reloj. Si falla, queda ⚠ en su sitio con "Reintentar" (mismo `client_msg_id`) |
| Resolver | Sale de "Sin responder" y vuelve sola si la paciente escribe |
| Atajos | `Ctrl/⌘+K` buscar · `Alt+↑/↓` conversación anterior/siguiente · `/` atajos · `Ctrl+Shift+N` nota · `Ctrl+Shift+G` IA · `Ctrl+Shift+A` asignarme · `Ctrl+Shift+E` resolver · `]` panel · `Esc` cerrar |
| Toasts (Sonner) | Solo para acciones con efecto real: cita creada, plantilla programada, paciente vinculado |
| Estados vacíos útiles | "Sin conversaciones pendientes"; para un lead: "Aún no es paciente · [Crear] [Agendar]" |

---

## 4. Reglas de Meta y costos desde el 1-oct-2026

Niveles de evidencia: **[OFICIAL]** (fragmento literal de developers.facebook.com), **[SECUNDARIA]** (varias fuentes de terceros coinciden) y [NO VERIFICADO].

> Aviso: la página oficial de precios indexada todavía muestra las tarifas del 1-abr-2026. Que el cobro de servicio empieza el 1-oct está confirmado en la página oficial de mensajes sin plantilla. **La franquicia de 1.000 y las tarifas exactas de Perú salen de fuentes secundarias. Hay que confirmarlas en el CSV oficial de Meta antes de mostrárselas al cliente.**

### 4.1 Reglas que el producto debe respetar
- **Cobro por mensaje entregado**, según la categoría y el país del destinatario, desde el 1-jul-2025. Los mensajes de la paciente hacia la clínica **no se cobran** [OFICIAL] ([precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
- **Ventana de atención (CSW) de 24 h:** se abre o se reinicia con cada mensaje de la paciente. Fuera de ella, **solo plantillas aprobadas** [OFICIAL]. La ventana se evalúa **al momento de enviar**, no al programar.
- **Punto de entrada gratuito (FEP) de 72 h:** si la paciente escribe desde un anuncio Click-to-WhatsApp o desde el CTA de una página de Facebook, y la clínica responde en < 24 h con cualquier tipo de mensaje, esa respuesta es gratis y se abre una ventana de 72 h **contada desde la respuesta de la clínica** (no desde el mensaje de la paciente), en la que todo es gratis. Si la clínica no responde en 24 h, no hay FEP. Solo aplica si la paciente escribió desde **Android o iOS** (escritorio y web no abren FEP). La FEP no amplía la CSW, que sigue siendo de 24 h [OFICIAL] ([precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing): *"If you respond within 24 hours using any type of message, the message will be free, and a Free Entry Point window will be opened, starting from the time when you responded. FEP windows remain open for 72 hours"*). Desde v24 el webhook de estado solo trae el objeto `conversation` durante una FEP, lo que sirve para confirmarla ([changelog, 8-oct-2025](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)).
- **Cambios del 1-oct-2026:**
  - los mensajes de servicio (texto libre dentro de la CSW, escritos por una persona o por una IA de terceros) **se cobran por mensaje**;
  - la utility enviada **dentro** de la CSW **también se cobra**;
  - un solo cobro por mensaje (el texto libre con contenido promocional no paga además tarifa de marketing);
  - la FEP sigue siendo gratuita [OFICIAL] ([mensajes sin plantilla](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages));
  - **1.000 mensajes de servicio gratis por número y por mes**, que no se acumulan y no cubren la utility dentro de la CSW [SECUNDARIA] ([ycloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026), [360dialog](https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/), [Zendesk](https://support.zendesk.com/hc/en-us/articles/11113277351322));
  - **única excepción:** los mensajes de **reacción** siguen gratis y no descuentan de la franquicia de 1.000 [SECUNDARIA] ([Wati](https://www.wati.io/en/blog/whatsapp-service-message-pricing/), [Mixdesk](https://mixdesk.com/blog/en/whatsapp-business-api-pricing-october-2026/)). Se excluyen del contador y de la estimación de costo (también las reacciones salientes de F3b).
- **Quién paga:** Yenda es Tech Provider sin línea de crédito. *"Clients onboarded by Tech Providers must provide their own payment method… Meta will then bill these clients"* [OFICIAL]. **Cada clínica le paga a Meta directamente.** Sin método de pago en el Billing Hub, al agotarse la franquicia se dejan de entregar los mensajes de servicio [SECUNDARIA]. Desde el 1-abr-2026 se puede facturar en **PEN** [OFICIAL, changelog], pero la moneda se fija al crear la WABA, y la Currency Migration API excluye a las WABAs de Coexistence: *"Coexistence and Authorized Agents WABAs are not eligible for migration via this API"* [OFICIAL] ([cambiar moneda](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/change-billing-currency)).
- **Recategorización:** una utility con contenido promocional pasa a marketing (2,34 veces más cara) con 1 día de aviso (webhook `template_category_update`), o al instante si la cuenta ya fue advertida. Si se repite, hay sanciones escalonadas que llegan a todo el portafolio [OFICIAL].
- **Opt-in** previo que nombre a la clínica, y opt-out por categoría. Error 131050 y webhook `user_preferences` cuando la paciente frena el marketing [OFICIAL].
- **Límites:**
  - 80 mps por número (**20 mps fijos con Coexistence**);
  - por par: ~1 mensaje cada 6 s a la misma paciente, con ráfaga de 45 (error 131056, backoff 4^X s);
  - iniciados por el negocio: 250 → 2.000 → 10.000 → 100.000 → ilimitado usuarios únicos en 24 h por portafolio [OFICIAL] ([throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput), [límites](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)).
- **Datos sensibles:** la política dice *"Don't share or ask people to share full length… personal ID card numbers"* [SECUNDARIA, cita de la política]. **No pedir el DNI por el chat**; usar un enlace a un formulario de Yenda.
- **Comercio:** no se pueden vender fármacos ni dispositivos médicos por WhatsApp; sí servicios clínicos [SECUNDARIA: tyntec]. **No usar el catálogo de WhatsApp para la farmacia.**

### 4.2 Tarifas de Perú (USD por mensaje entregado)

| Categoría | Hasta el 30-09-2026 | Desde el 01-10-2026 |
|---|---|---|
| Marketing | 0,0703 [SECUNDARIA] | 0,0703 (sin cambio) [SECUNDARIA] |
| Utility (fuera de la CSW) | 0,0200 [SECUNDARIA] | **0,0300 (+50 %)** [SECUNDARIA] |
| Authentication | 0,0200 [SECUNDARIA] | 0,0300 [SECUNDARIA] |
| Servicio (texto libre dentro de la CSW) | 0 | 0 hasta 1.000 por número al mes; después **0,0300** [SECUNDARIA] |
| Utility dentro de la CSW | 0 | **0,0300**, fuera de la franquicia [SECUNDARIA] |
| Cualquier mensaje dentro de la FEP de 72 h (desde la 1.ª respuesta de la clínica) | 0 | 0 [OFICIAL] |
| Reacciones | 0 | 0, fuera de la franquicia [SECUNDARIA] |
| Enviado desde la app Business (Coexistence) | 0 | 0 [OFICIAL; que siga igual tras el 1-oct: SECUNDARIA] |

- Referencia en euros: marketing €0,0582, utility €0,0249 ([ycloud](https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026)) [SECUNDARIA].
- Los tramos de descuento por volumen se acumulan **por portafolio de negocio** [OFICIAL]. Cada clínica es su propio portafolio, así que casi siempre pagará tarifa de lista [NO VERIFICADO: inferencia]. Umbrales para Perú: [NO VERIFICADO].
- Meta Business Agent (la IA propia de Meta) se cobra por token desde el 1-ago-2026 [OFICIAL]. **No activarlo junto al copiloto de Yenda**: serían dos costos de IA.

### 4.3 Escenarios de costo mensual para la clínica *(estimación)*

**Supuestos:**
- un número por clínica y destinatarios en Perú;
- tarifas desde el 1-oct y 1.000 mensajes de servicio gratis, sin tramos de volumen;
- tipo de cambio **S/ 3,40 por USD** (rango 3,36-3,42 en sep-2026; el investigador de IA usó 3,44 de El Comercio del 29-sep, y la diferencia no cambia ninguna conclusión);
- los volúmenes de recordatorios y campañas son supuestos.

| | Chica | Mediana | Grande |
|---|---|---|---|
| Conversaciones al mes | 300 | 1.500 | 5.000 |
| Respuestas de servicio | 1.500 | 8.000 | 30.000 |
| Recordatorios utility | 250 | 1.200 | 6.000 |
| Campañas marketing (F5, fuera del MVP) | 500 | 2.000 | 8.000 |
| Servicio: (respuestas − 1.000) × 0,03 | US$ 15,00 | US$ 210,00 | US$ 870,00 |
| Utility × 0,03 | US$ 7,50 | US$ 36,00 | US$ 180,00 |
| **Subtotal sin campañas** | **US$ 22,50 ≈ S/ 77** | **US$ 246,00 ≈ S/ 836** | **US$ 1.050,00 ≈ S/ 3.570** |
| Marketing × 0,0703 | US$ 35,15 | US$ 140,60 | US$ 562,40 |
| **Total con campañas** | US$ 57,65 ≈ S/ 196 | US$ 386,60 ≈ S/ 1.314 | US$ 1.612,40 ≈ S/ 5.482 |
| Mismo volumen antes del 1-oct (con campañas) | US$ 40,15 | US$ 164,60 | US$ 682,40 |
| Aumento | +44 % | +135 % | +136 % |

### 4.4 Media en Cloud API [OFICIAL]
| Tipo | Formato | Máximo |
|---|---|---|
| Imagen | JPEG, PNG | 5 MB |
| Video | MP4, 3GP (H.264 + AAC) | 16 MB |
| Audio | AAC, AMR, MP3, M4A, OGG/OPUS | 16 MB |
| Documento | PDF, DOC(X), XLS(X), PPT(X), TXT | 100 MB |
| Sticker | WebP | 100 KB / 500 KB animado |

- La URL de descarga **caduca a los 5 min** y se renueva con `GET /<MEDIA_ID>`.
- El **`media_id` que llega en el webhook dura 7 días**. Los ids de archivos **subidos** por el negocio duran 30 días. El investigador de seguridad citó 30 días para el id del webhook, pero la fuente oficial distingue los dos casos: vale el de 7 días.
- **Yenda debe copiar cada archivo a su propio storage apenas llega** ([media](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media)).

### 4.5 Cómo el producto ayuda a gastar menos
| Palanca | Efecto *(estimación)* |
|---|---|
| **Indicador de costo antes de enviar** y contador "servicio gratis: ≈ 812/1.000" (sin contar reacciones; estimación intradía, la cifra oficial sale de `pricing_analytics`) | La clínica ve el gasto antes de hacerlo; alerta al llegar a 900/1.000 |
| **Un mensaje por respuesta**, no cinco burbujas (la IA redacta una sola burbuja; aviso suave "3 mensajes seguidos: ¿unirlos?") | Pasar de 5 a 3 mensajes por conversación: la chica baja de US$ 15 a US$ 0 (queda dentro de la franquicia), la mediana de US$ 210 a US$ 114, la grande de US$ 870 a US$ 510 |
| **Listas interactivas** para ofrecer horarios (hasta 10 filas en 1 mensaje) | Menos mensajes cobrables (F3b) |
| **Responder anuncios en < 24 h** (la bandeja prioriza por espera y avisa "responde antes de HH:MM") | La respuesta abre la FEP: 72 h gratis desde esa respuesta (si la paciente escribió desde Android/iOS) |
| **Respuestas triviales desde la app** (Coexistence, gratis), que Yenda refleja con los ecos | Si el 25 % sale por la app: mediana −US$ 60, grande −US$ 225. Contra: pierden la autoría en Yenda. Es compatible con el criterio del MVP (§9), que mide conversaciones atendidas en Yenda y no penaliza los ecos |
| **Recordatorio como texto libre si la CSW está abierta** (consume franquicia en vez de pagar utility) | −US$ 0,03 por recordatorio mientras quede franquicia [NO VERIFICADO: inferencia de las reglas; toca el cron de recordatorios, fase aparte] |
| **Revisar la categoría de las plantillas** antes de enviarlas a Meta (sin promoción en las utility) y escuchar `template_category_update` | Evita pagar 2,34 veces más y las sanciones |
| **La IA no envía sola** | Cada borrador enviado es un mensaje cobrable |
| **Chequeo del método de pago** de la clínica en Meta, con alerta en el panel | Evita el corte silencioso al pasar de 1.000 |
| **Facturación en PEN** (se recomienda en el onboarding) | Sin riesgo cambiario para la clínica. **Solo aplica al crear la WABA:** las WABAs Coexistence ya creadas en USD no pueden migrarse con la Currency Migration API |
| **No** multiplicar números para multiplicar la franquicia | Fragmenta el historial y la identidad [NO VERIFICADO: riesgo de política] |

**Telemetría:** guardar el objeto `pricing` de cada webhook de estado (`billable`, `category`, `type`) en `wa_messages` y agregarlo en `wa_usage_monthly` [OFICIAL: estructura; los valores de `type` para la franquicia: NO VERIFICADO]. Ese contador local es **solo una estimación intradía** y se muestra con "≈": el mes de facturación de Meta no es necesariamente el mes civil de la org [NO VERIFICADO: zona horaria del periodo de facturación de Meta], y qué cuenta contra la franquicia (FEP, ecos, utility en la ventana) sale de fuentes secundarias. **La fuente de verdad del costo real es `pricing_analytics` de la WABA** (COST y VOLUME por PRICING_CATEGORY y PHONE, granularidad diaria), leída por un job diario ([analytics](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics/)).

### 4.6 Coexistence (app Business + API en el mismo número) [OFICIAL]
- Lo que se envía **desde la app sigue siendo gratis**. Lo que se envía por API paga la tarifa de Cloud API. Los envíos desde la app no abren ni extienden la ventana de la API. Por eso un eco (respuesta desde el celular) **no fija la FEP** en Yenda: cuenta para `first_response_at` y para la guarda `stale_thread`, pero no para `entry_point_expires_at` (regla completa en §5.3) [NO VERIFICADO: si Meta cuenta una respuesta desde la app como la que abre la FEP].
- La CSW de la API solo se abre si la paciente escribe **después** de conectar el número.
- **Webhooks obligatorios:**
  - `smb_message_echoes` (lo que se envía desde la app; "must digest and display");
  - `history` (historial inicial, **últimos 6 meses**, se pide **una sola vez** con `POST /<PHONE_ID>/smb_app_data` y **dentro de las 24 h** siguientes al alta; si no, hay que desconectar y repetir el alta);
  - `smb_app_state_sync` (contactos);
  - `account_update` (`PARTNER_REMOVED`, que se dispara con ~14 días de inactividad del celular, `ACCOUNT_OFFBOARDED`, `ACCOUNT_RECONNECTED`).
- **No llamar a `/register`** en Coexistence. Mientras dura una reconexión, la API queda suspendida: los programados se pausan.
- **Qué no se sincroniza:** grupos, mensajes temporales, "ver una vez" y ubicación en vivo. Las etiquetas y respuestas rápidas de la app **no** pasan a la API.
- **El 15-oct-2026 se deprecan Embedded Signup v2 y v3.** La mayoría de las integraciones se migra sola a v4 (*"most integrations that are still on v2 or v3 after the deprecation deadline will be automatically upgraded to v4"*), pero una configuración v2 con featureType `coex` (o `only_waba_sharing`, `marketing_messages_lite`) **no se migra**: pasa al flujo estándar, es decir, el alta dejaría de ofrecer Coexistence. Hay que confirmar que el `config_id` de Yenda sea de Facebook Login for Business v4 ([Embedded Signup v4](https://developers.facebook.com/blog/post/2026/05/14/embedded-signup-v4/), [Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)).

### 4.7 Identidad (usernames/BSUID) y calendario de plazos
- El **BSUID** (`user_id`) llega en todos los webhooks. Si la paciente adopta un username, **`wa_id` puede llegar vacío**. El teléfono solo está garantizado durante 30 días rodantes. Enviar a un BSUID está soportado desde jul-2026 [OFICIAL] ([BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids)).
- Despliegue para usuarias: el resto del mundo "desde septiembre de 2026" [SECUNDARIA]. **Fecha para Perú: [NO VERIFICADO]**. Consecuencia: la conversación usa el BSUID como clave y el teléfono pasa a ser un atributo que puede faltar. El botón REQUEST_CONTACT_INFO pide el teléfono cuando hace falta.

| Fecha | Evento | Acción |
|---|---|---|
| 01-oct-2026 | Se cobra el servicio; la utility dentro de la ventana; sube la utility en Perú | Indicador de costo; alerta de método de pago |
| 15-oct-2026 | Deprecación de Embedded Signup v2/v3 (migración automática a v4 salvo featureType `coex` y otros de v2) | Confirmar el `config_id` v4 (F0) |
| sep-2026 → | Usernames/BSUID para usuarias | Guardar `user_id` y tolerar `wa_id` vacío (F0) |
| 27-oct-2026 | Dejan de funcionar en **todas** las versiones de Graph los parámetros heredados `pretty`, `debug`, `date_format`, `GET /?ids=` y el manejo de ETag/If-None-Match | Revisar con grep que `lib/whatsapp/*` no los use (F0-5) |
| 21-ene-2027 | Caduca Graph v21.0, confirmado en el changelog de v26 (*"January 21, 2027: Graph API v21.0 is deprecated and removed"*); v20.0 caducó el 24-sep-2026 | Subir a **v26.0** (disponible desde el 29-jul-2026) en F0 ([v26](https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/), [changelog v26](https://developers.facebook.com/docs/graph-api/changelog/version26.0/)) |
| 01-ene-2027 | Próxima ventana de cambio de precios de Meta | Tarifas en configuración, no en el código |
| 2.º trim. 2027 | Precio máximo obligatorio en la MM API (marketing) | Relevante solo para F5 |

---

## 5. Arquitectura

### 5.1 Principio: la agenda no se entera de que existe la bandeja
| Regla | Verificación |
|---|---|
| Ningún trigger nuevo en `appointments`, `patients` ni `patient_payments` | Revisión del PR y `\d+` antes y después |
| Ningún embed nuevo en `AGENDA_SELECT` ni cambio en las consultas de la agenda | `app/api/health/schema/route.ts` sin cambios en la parte de la agenda |
| Ninguna tabla `wa_*` en la publicación `supabase_realtime` (Postgres Changes) | `select * from pg_publication_tables` |
| Ruta `/inbox` aislada, con islas cliente que cargan en diferido | **Sin cambio de comportamiento ni de consultas en `/scheduler`**; diferencia de bundle de `/scheduler` ≤ 1 KB gzip (el único cambio es aditivo: `onSaved(result?: { appointmentId })` en el formulario de cita); tests de agenda en verde |
| El sidebar se renderiza también en `/scheduler`, así que el badge tiene presupuesto propio: solo se monta si la org tiene el addon y el rol tiene acceso; se carga con `dynamic()` después de `requestIdleCallback`; abre **un** canal liviano en el WebSocket que ya existe | Badge ≤ 2 KB gzip; 1 consulta de conteo que use el índice parcial `wa_conv_unread`; **0 consultas en `/scheduler` para orgs sin addon**; 0 conexiones pico extra |
| El webhook no llama a la IA ni descarga media dentro del request | p50 < 150 ms |
| El formulario de cita se carga en `/inbox` **solo al hacer clic** | Medir con `next build` y el analyzer |

**Presupuesto de performance medible** (CI + Vercel Speed Insights):

| Métrica | Objetivo |
|---|---|
| JS propio de `/inbox` (sin lo compartido) | ≤ 150 KB gzip [objetivo interno] |
| Diferencia de bundle de `/scheduler` (formulario de cita) | ≤ 1 KB gzip |
| Badge del sidebar (org con addon y rol con acceso) | ≤ 2 KB gzip, cargado tras `requestIdleCallback`; 1 consulta de conteo al montar + respaldo cada 120 s solo con la pestaña visible |
| Consultas nuevas en `/scheduler` para orgs sin addon | 0 |
| Canales Realtime fuera de `/inbox` | 1 (`badge:`), en el mismo socket |
| Consultas al abrir `/inbox` / al abrir un chat | 2 / 2 |
| Abrir un chat con caché caliente / fría | < 100 ms / p95 < 400 ms |
| INP al teclear en el cuadro de texto | < 100 ms |
| Webhook p50 / p99 | < 150 ms / < 1 s (Meta pide mediana ≤ 250 ms y < 1 % por encima de 1 s) |
| Retraso p95 de los programados | < 45 s |
| Media disponible tras recibirla, p95 | < 10 s |
| p95 de las rutas de la agenda | Variación ≤ 5 % contra una **línea base capturada 7 días antes** del despliegue (logs de Vercel o Sentry), con la fecha de captura fijada en el PR |

### 5.2 Modelo de datos

**Volumen *(estimación)*:** clínica chica 100 mensajes/día, mediana 320, grande 1.000 → 36 k / 117 k / 365 k filas al año ≈ 30 / 95 / 290 MB al año con índices. **Sin particionado:** la idempotencia necesita un `wamid` UNIQUE global, y los índices compuestos con keyset alcanzan hasta ~20 M filas. Se revisa al llegar a 20 M filas o 20 GB.

**`wa_conversations` (se amplía la tabla de la mig 206):**
```sql
ALTER TABLE wa_conversations
  ADD COLUMN wa_user_id text,                 -- BSUID; clave alternativa (teléfono puede faltar). Llega en F0-3, antes que el resto
  ADD COLUMN origin text NOT NULL DEFAULT 'inbound'
    CHECK (origin IN ('inbound','outbound','history_import')), -- quién abrió la conversación (cohortes de Captación)
  ADD COLUMN first_inbound_at timestamptz,    -- 1.er mensaje de la paciente; base de la cohorte
  ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','snoozed','closed')),
  ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN last_inbound_at timestamptz,     -- ventana 24 h = last_inbound_at + 24h
  ADD COLUMN last_outbound_at timestamptz,
  ADD COLUMN entry_point_eligible boolean NOT NULL DEFAULT false, -- referral CTWA o CTA de página (se fija al ingerir)
  ADD COLUMN entry_point_expires_at timestamptz, -- FEP: = 1.ª respuesta por API + 72 h, SOLO si salió < 24 h del entrante y no hubo eco antes; si no, NULL (§5.3)
  ADD COLUMN last_message_id uuid,            -- SIN FK (anti-PGRST201)
  ADD COLUMN last_message_preview text,       -- ≤120 chars, lista sin JOIN
  ADD COLUMN last_message_dir text,
  ADD COLUMN unread_count int NOT NULL DEFAULT 0,
  ADD COLUMN first_response_at timestamptz,
  ADD COLUMN snoozed_until timestamptz, ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid,                  -- SIN FK (rastro)
  ADD COLUMN booked_appointment_id uuid,      -- SIN FK (rastro de atribución)
  ADD COLUMN opted_out_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE wa_conversations ALTER COLUMN phone_normalized DROP NOT NULL;
CREATE UNIQUE INDEX wa_conv_org_bsuid_uq ON wa_conversations (organization_id, wa_user_id) WHERE wa_user_id IS NOT NULL;
```
`last_message_at` pasa a moverse también con los salientes y siempre con `GREATEST(...)`, lo que arregla D11.

**Cohortes de Captación.** `captacion_summary` (migs 262/263) arma las cohortes con **toda** fila de `wa_conversations` según `created_at` y define lead como "no había paciente antes del primer contacto". Sin cambios, la importación de 6 meses de historial y las conversaciones que abre la clínica (plantilla nueva, recordatorio) cambiarían retroactivamente "agendaron" y "facturado" de meses ya reportados. Por eso, **en la misma PR** que agrega `origin` y `first_inbound_at`, se reescribe `captacion_summary` (misma firma, `CREATE OR REPLACE`) para que haga la cohorte por `first_inbound_at` y excluya `origin='history_import'` y las filas con `first_inbound_at IS NULL`. **La misma migración rellena las filas existentes** (F1/F2): `origin='inbound'` y `first_inbound_at = created_at`, porque en F1/F2 la conversación se crea con el 1.er entrante; sin ese backfill, todas las conversaciones ya capturadas quedarían con `first_inbound_at` NULL y desaparecerían de las cohortes pasadas. Se usa `created_at` y no `min(wa_inbound_messages.received_at)` para que ninguna fila cambie de mes; si se prefiere `received_at`, antes hay que comprobar que ninguna conversación cambia de mes. Criterio: correr `captacion_summary` para los últimos 3 meses antes y después (y antes y después de la importación) y exigir el mismo resultado.

**Estado del lead: una sola fórmula.** El cálculo de "agendó / asistió / facturado clínico" que hoy vive dentro de `captacion_summary` se extrae a una función SQL compartida `wa_lead_outcome(conv_id)`, que usan la bandeja y Captación. Esa extracción (A8) es otra reescritura de `captacion_summary`, así que lleva el mismo criterio: los últimos 3 meses dan el mismo resultado antes y después. `lead_status` manual queda solo para "perdido" y "no_interesado"; "agendado" se deriva al leer. `booked_appointment_id` queda como rastro de atribución, validado al leer con LEFT JOIN a `appointments` y `status <> 'cancelled'` (una pre-reserva liberada por `appointment_release_hold` se borra con DELETE, mig 274).

**`wa_messages`: una sola tabla para entrantes, salientes, ecos y notas internas.** Así hay una línea de tiempo, un evento de tiempo real, una RLS y un único lugar donde se aplican los estados.
```sql
CREATE TABLE wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in','out','internal')),
  source text NOT NULL CHECK (source IN ('patient','agent','business_app_echo','reminder',
                                         'scheduler','automation','history_sync')),
  wamid text, client_msg_id uuid,              -- client_msg_id viaja como biz_opaque_callback_data (§5.4)
  type text NOT NULL DEFAULT 'text', body text,
  template_name text, template_lang text, template_vars jsonb,
  reply_to_wamid text,
  meta_media_id text, media_mime text, media_bytes int, media_sha256 text,
  storage_path text, thumb_path text,
  media_status text CHECK (media_status IN ('pending','stored','too_large','expired','skipped_quota','failed')),
  status text NOT NULL CHECK (status IN ('received','queued','sending','sent','delivered','read','failed','unknown')),
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
  error_code text, error_title text,
  pricing_category text, billable boolean,     -- del objeto pricing [formato post 1-oct NO VERIFICADO]
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- estampado en servidor
  ts timestamptz NOT NULL,                     -- timestamp de Meta; ordena la línea de tiempo
  scheduled_id uuid, ai_suggestion_id uuid,    -- SIN FK (rastro)
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (direction <> 'internal' OR wamid IS NULL)   -- una nota jamás tiene wamid
);
```

**Tablas auxiliares:**

| Tabla | Para qué | Claves |
|---|---|---|
| `wa_status_buffer(wamid PK, org, status, status_ts, errors, pricing)` | Estados que llegan antes que su mensaje; se consumen al guardar el `wamid`; se purgan a los 7 días | — |
| `wa_webhook_deadletter(id, received_at, payload, error_code, attempts, next_attempt_at)` | Cola de payloads que `wa_ingest` no pudo procesar: se responde 200 a Meta y se reprocesa con un job de `pg_cron` cada minuto (las extensiones `pg_cron` + `pg_net` se instalan con A2, antes de `wa_ingest`, no con A9). Solo service role, purga a 7 días, sin PII en logs (§5.12) | — |
| `wa_media_jobs(message_id PK → wa_messages, org, attempts, next_attempt_at, expires_at, last_error)` | Cola de descarga de media (`expires_at` = recepción + 7 días) | 1 FK |
| `org_tags(id, org, name, color, created_by)` + UNIQUE `(org, lower(name))` | Catálogo de etiquetas por org, con color | — |
| `wa_conversation_tags(conversation_id, tag_id, org)` | Etiquetas de la conversación (lead o paciente); única fuente para el filtro de la bandeja | **PK propia `id`**, no compuesta (ver 5.9) |
| `wa_quick_replies(id, org, shortcut, title, body, usage_count)` + UNIQUE `(org, shortcut)` | Respuestas rápidas con `/`; semilla desde las plantillas de portapapeles | — |
| `wa_scheduled_messages` | Programados (5.6) | — |
| `wa_conversation_events(id bigint, org, conversation_id, actor_id, event, data, created_at)` | Auditoría append-only: asignó, cerró, vinculó, etiquetó, agendó, canceló | **sin FK** |
| `wa_conversation_reads(conversation_id, user_id, last_read_at)` | Lectura por usuario (opcional en F3b; el contador usa `unread_count` compartido) | — |
| `wa_usage_monthly(org, yyyymm, service, utility, marketing, auth, billable_service)` | Contador "≈ 812/1.000" (estimación intradía, sin reacciones) | — |
| `wa_usage_daily(org, date, phone, pricing_category, volume, cost)` | Copia diaria de `pricing_analytics` de la WABA: **fuente de verdad** del costo real (§4.5) | — |
| `wa_pricing(country, category, usd, valid_from)` | Tarifas en configuración | — |
| `wa_send_counters(org, bucket, n)` | Limitador distribuido (§6.2) | — |

**Etiquetas: la etiqueta vive siempre en la conversación.**
- Toda etiqueta de la bandeja vive en `wa_conversation_tags`, sea lead o paciente. El filtro de la bandeja lee **una sola tabla indexada** (sin UNION de dos almacenes ni join a `patients`), y desvincular no pierde etiquetas.
- Al vincular, el RPC `wa_link_patient` **copia** (no mueve) las etiquetas a `patient_tags` (texto = `org_tags.name`), para que el filtro de `/patients` siga funcionando.
- Renombrar en `org_tags` no se propaga solo al texto de `patient_tags`: renombrar crea una etiqueta nueva, o se hace con un RPC que actualice los dos lados.
- `patient-drawer.tsx` usa además una lista fija `COMMON_PATIENT_TAGS` (`:650-670, 889`): se siembra `org_tags` con ella para no tener tres catálogos.
- Índice nuevo `patient_tags (organization_id, tag)`. Con él se puede **filtrar por etiqueta en el servidor** (hoy el filtro es del navegador y solo sobre la página actual, `patients-client.tsx:293-328`).
- Un investigador dijo que `patient_tags` no tiene `organization_id`. El de código comprobó que se añadió en la mig 013. Vale este último.
- No se agrega `UNIQUE(patient_id, tag)` sin deduplicar antes (hoy existen duplicados posibles).

**Relación con lo existente:**
- `wa_inbound_messages` (mig 206), en dos pasos:
  1. Se rellena `wa_messages` a partir de ella y durante un release se escribe en ambas tablas.
  2. **Recomendado (A12, un release después):** en la misma PR del corte, reescribir `captacion_summary` (misma firma) para que lea `wa_messages` con `direction='in' AND source='patient'` y quitar la tabla vieja, sin vista. **Si se deja una vista**, obligatoriamente `CREATE VIEW wa_inbound_messages WITH (security_invoker = true) AS SELECT … FROM wa_messages WHERE direction='in' AND source='patient'` más `REVOKE ALL ON wa_inbound_messages FROM anon`. Una vista creada por `postgres` sin `security_invoker` se ejecuta con los permisos del dueño, se salta la RLS de `wa_messages` y, expuesta por PostgREST, dejaría leer los entrantes de **todas** las orgs. Y sin el filtro `source='patient'`, los mensajes importados con `history_sync` harían saltar retroactivamente el KPI "msgs" de `captacion_summary` (que cuenta por `received_at`, mig 263). Checklist: con JWT de la org B, SELECT sobre la vista → 0 filas; Security Advisor sin el lint `security_definer_view`.
- `whatsapp_message_logs` (recordatorios y confirmaciones): **no se toca su flujo y no se le agrega trigger.** Un trigger ahí correría en el camino de guardado de la agenda (`/api/notifications/send` se llama al guardar una cita), un error abortaría el INSERT (en `cron/reminders` ese error no se revisa, `route.ts:528`), y `recipient_phone` es el teléfono crudo de la ficha (`route.ts:507`), sin normalizar: si el trigger creara conversaciones, cada paciente con recordatorio se volvería una "conversación" en las cohortes de Captación.
  - **Opción A (recomendada, sin escrituras nuevas en el flujo de recordatorios que ya funciona):** al abrir un hilo, leer también `whatsapp_message_logs` por el `phone9` de la conversación y mezclarlo en la UI como "Automático · recordatorio".
  - Opción B: espejar desde `wa_ingest` cuando llega el webhook de estado (que trae `recipient_id`), **solo si la conversación ya existe** (nunca crearla), con `source='reminder'`, fuera del request del usuario.
- **Cruce paciente ↔ teléfono:** índice de expresión, **sin columna nueva ni trigger en `patients`**:
  `CREATE INDEX CONCURRENTLY patients_org_phone9 ON patients (organization_id, right(regexp_replace(coalesce(phone,''),'\D','','g'),9));`
  `CONCURRENTLY` no bloquea la agenda. Se aplica fuera de la transacción de la migración.

### 5.3 Ingesta (webhook)
```
Meta ─POST─> /api/whatsapp/webhook (nodejs, gru1)
  1. tope defensivo de body de 4 MB (Meta envía cargas de hasta 3 MB) · HMAC X-Hub-Signature-256
     sobre el body crudo COMPLETO (ya existe). Una carga firmada válida nunca recibe 413: si
     excede el tope, 200 + registro en Sentry (perder un trozo de `history` es irrecuperable)
  2. rpc('wa_ingest', {payload})  ← UNA ida a la base, SECURITY DEFINER, SOLO service_role
       (REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role, §5.12)
       · org por phone_number_id activo (mig 262); plantillas filtradas por waba_id (arregla D3)
       · messages[]  → resolver conversación: al INICIO del lote se calculan TODAS las claves de bloqueo,
                       una por identificador presente (hashtext(org||':u:'||wa_user_id) y
                       hashtext(org||':p:'||phone), las dos si llegan ambos), se ordenan y se toman
                       con pg_advisory_xact_lock en ese orden (así dos POST concurrentes que compartan
                       teléfono O user_id se serializan, y el orden global evita deadlocks entre lotes);
                       SELECT por wa_user_id, luego por teléfono (completa wa_user_id si llegan ambos),
                       y recién ahí INSERT (nunca ON CONFLICT contra dos claves únicas). Si el SELECT
                       por wa_user_id y el de teléfono devuelven filas distintas (un mensaje previo
                       solo con teléfono y otro solo con user_id, sin dato común que los una), se
                       fusionan en la más antigua (mensajes, etiquetas, eventos) y queda en
                       wa_conversation_events;
                       GREATEST en last_*; last_inbound_at; first_inbound_at si NULL; unread_count+1;
                       referral solo si NULL; entry_point_eligible=true si referral CTWA / CTA de página
                       (la expiración de la FEP la fija wa_mark_sent con la 1.ª respuesta POR API, no la
                       ingesta; única excepción: si un estado trae el objeto `conversation` de una FEP,
                       wa_ingest copia su vencimiento a entry_point_expires_at cuando aún es NULL)
                     → INSERT wa_messages ON CONFLICT (wamid) WHERE wamid IS NOT NULL DO NOTHING
                     → si hay media: INSERT wa_media_jobs
                     → si texto ∈ {BAJA, STOP, NO MOLESTAR}: opted_out_at
       · smb_message_echoes[] → direction='out', source='business_app_echo'; cuenta como 1.ª respuesta
                       para first_response_at y para stale_thread, pero NO fija entry_point_expires_at
                       (lo enviado desde la app no abre ventanas de la API, §4.6). Si la 1.ª respuesta
                       fue un eco, la barra no muestra "gratis 72 h" salvo que un estado posterior traiga
                       `conversation` de FEP (criterio conservador: mejor mostrar costo que un gratis falso)
       · statuses[]  → se aplica a LAS DOS tablas de forma independiente, cada una con guarda de rango
                       monótono (sent<delivered<read; failed terminal):
                         UPDATE wa_messages … WHERE wamid AND rank(nuevo) > rank(actual)  (+ pricing)
                         UPDATE whatsapp_message_logs … WHERE wamid AND rank(nuevo) > rank(actual)
                       si no hay wamid: buscar por biz_opaque_callback_data (= client_msg_id) y completar el wamid
                       → wa_status_buffer SOLO si NOT EXISTS en wa_messages AND NOT EXISTS en
                         whatsapp_message_logs (nunca por el conteo de filas del UPDATE: 0 filas
                         también significa "el rango no avanza", p. ej. un delivered después del read)
       · account_update / template_category_update / user_preferences → estado de la config y alertas
       · realtime: los tópicos afectados se juntan en un array y al FINAL se emite UN evento por
         conversación, en UN SOLO bloque EXCEPTION por lote (nunca un BEGIN…EXCEPTION por mensaje:
         cada uno abre una subtransacción y > 64 por transacción degradan todo el clúster, §5.12)
       · RETURNS media_job_ids
  3. 200 (objetivo p50 < 150 ms). Si el RPC falla → el payload va a wa_webhook_deadletter y se
     responde 200 (no 500): un lote "venenoso" reintentado 7 días bloquearía también los estados
     de otras clínicas que viajan en él. Un job de pg_cron (instalado con A2, §9) lo reprocesa cada
     minuto; hoy el error se traga.
  4. after(() => downloadMedia(jobs))   // el repo ya usa after() en lib/audit/clinical-access.ts
```
- **Idempotencia:** `wamid` UNIQUE. Meta reintenta hasta 7 días y no existe una API para recuperar webhooks perdidos. Las cargas llegan **hasta 3 MB** [OFICIAL] ([webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview): *"Webhook payloads can be up to 3 MB"*), el servidor debe soportar 3 veces el tráfico saliente en estados y puede haber duplicados ([throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput)). El número de actualizaciones por POST no está documentado [NO VERIFICADO]; las pruebas se dimensionan por tamaño (~3 MB).
- **ON CONFLICT con índices parciales:** todo `ON CONFLICT` sobre un índice único parcial repite su predicado (`ON CONFLICT (wamid) WHERE wamid IS NOT NULL`); sin él, Postgres falla con 42P10 ([INSERT](https://www.postgresql.org/docs/current/sql-insert.html), `index_predicate`). Tests: un payload con el mismo contacto con teléfono y con BSUID en el mismo lote → 1 conversación y 0 errores; **dos POST concurrentes** del mismo contacto nuevo, uno con teléfono + `user_id` y otro solo con teléfono (y la variante solo con `user_id`) → 1 conversación y 0 errores; un contacto con una conversación solo por teléfono y otra solo por `user_id` recibe un mensaje con ambos → 1 conversación fusionada.
- **Orden:** el hilo se ordena por `ts` (timestamp de Meta) con `id` como desempate, nunca por `created_at`.
- **Importación de historial (Coexistence):** entra con `source='history_sync'`, y las conversaciones que crea llevan `origin='history_import'` y `created_at` = el del **primer mensaje**, no `now()`. `captacion_summary` las excluye y arma la cohorte por `first_inbound_at` (§5.2), así que las cifras de meses ya reportados no cambian.
- **Mensajes que Meta no entrega por webhook:** con Coexistence, lo que la usuaria envía o recibe desde un dispositivo acompañante no soportado (WhatsApp para Windows, WearOS) *"will not trigger messages webhooks"* ([Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)). Un "cero perdidos" absoluto no es alcanzable; el criterio de §9 lo excluye.
- **Sentry:** spans y `captureException` en el webhook (D17), sin PII (§6.4).

### 5.4 Envío
```
UI (Enter) → burbuja optimista 'queued' con client_msg_id (uuid v4)
  → POST /api/inbox/messages {conversation_id, client_msg_id, type, body|media|template}
  1. auth + membresía activa de ESA org (sin .single() ciego, D8) + addon + rol + limitador distribuido
  2. rpc('wa_claim_outbound', {p_conv, p_client_msg_id, p_expected_last_msg_id, p_force, p_actor})
       con service role (el RPC NO es ejecutable por authenticated; p_actor es el usuario ya validado
       en el paso 1, porque con service role auth.uid() es NULL)
       → guarda anti doble respuesta: si desde p_expected_last_msg_id hay un entrante o un saliente de
         otro autor (incluidos ecos) y p_force=false → 409 {stale_thread, mensajes_nuevos}
       → INSERT wa_messages status='sending', sent_by=p_actor
         ON CONFLICT (organization_id, client_msg_id) WHERE client_msg_id IS NOT NULL DO NOTHING → doble clic = no-op
       valida ventana EN SERVIDOR: type<>'template' exige now() < last_inbound_at + 24h → si no, 409 {needs_template}
  3. Graph POST /{phone_number_id}/messages (text/image/document/template; context.message_id si cita)
       con biz_opaque_callback_data = client_msg_id (texto libre y plantilla; hasta 512 caracteres)
  4. rpc('wa_mark_sent',{id,wamid,p_actor}) (solo service role) → 'sent', aplica wa_status_buffer,
       fija entry_point_expires_at = now()+72h si es la 1.ª respuesta saliente de la conversación
       (sin ecos previos: si antes hubo un eco, no la fija, §5.3), la conversación es elegible y
       salió < 24 h del entrante; actualiza conversación; realtime
  5. errores: 131047 (ventana) → needs_template · 131056 (par) y 130429 → backoff · 5xx/timeout → 'unknown'
```
- Cloud API no documenta una llave de idempotencia [NO VERIFICADO]. Por eso la reserva va antes y en la base. Una fila atascada en `sending` más de 5 min pasa a `unknown` y **nunca se reenvía sola**.
- **Conciliación de `unknown`:** si Graph respondió con timeout pero el mensaje sí salió, la fila no tiene `wamid` y la recepcionista vería ⚠ en un mensaje que la paciente ya leyó (y lo reenviaría: doble cobro). Como cada envío lleva `biz_opaque_callback_data = client_msg_id`, y Meta lo devuelve en los webhooks `sent`/`delivered`/`read`, `wa_ingest` busca por `wamid` y, si no lo encuentra, por el callback, completa el `wamid` y resuelve el `unknown` sin intervención ([messages](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/), [changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)). Se reutiliza `client_msg_id`, sin columna nueva.
- Criterio de la guarda anti doble respuesta: dos pestañas envían a la vez a la misma conversación → 1 envío y 1 conflicto 409.
- `/api/whatsapp/send` (solo plantillas) pasa por la misma reserva (D7).
- Se agregan a `lib/whatsapp/client.ts`:
  - texto;
  - media (`POST /{phone_id}/media`);
  - descarga;
  - interactivo;
  - reacción;
  - marcar como leído + escribiendo.

### 5.5 Tiempo real
**Broadcast privado emitido desde la base** (`realtime.send` dentro de los RPC). No se usa Postgres Changes, que autoriza cada evento contra cada suscriptor en un solo hilo; Supabase recomienda Broadcast "for most use cases" ([Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes), [Broadcast](https://supabase.com/docs/guides/realtime/broadcast)).

| Canal | Quién lo escucha | Eventos |
|---|---|---|
| `inbox:{org_id}` | Solo `/inbox` | `conv.upsert` |
| `conv:{conversation_id}` | Solo quien tiene ese hilo abierto | `msg.insert`, `msg.status` (los acuses llegan a 0 o 1 personas) |
| `badge:{org_id}` | Sidebar (solo orgs con addon; owner, admin y recepción, que ven toda la bandeja) | `unread.changed {total}` |
| `badge:{org_id}:{user_id}` | Sidebar de roles restringidos (doctor): conteo por usuario con RLS, nunca el total de la org, que filtraría metadatos de conversaciones que no puede abrir | `unread.changed {total}` |
| Presence `conv:{id}` | Quien tiene ese hilo abierto | "viendo" y "escribiendo" |

- **Contenido del evento (discrepancia resuelta).** Arquitectura proponía un resumen de ~300 B con la vista previa del texto. Seguridad pedía **solo ids**. Se adopta la versión de seguridad: el evento lleva ids y metadatos sin PHI (timestamps, contadores, estado, `assigned_to`), y el cliente relee esa fila por PostgREST con RLS. El costo es 1 consulta pequeña por evento y por pestaña abierta: trivial al volumen previsto.
- **Autorización:**
  - todos los canales con `private: true` y "Allow public access" desactivado;
  - política en `realtime.messages` que se evalúa **al unirse**: `inbox` y `badge:{org}` → org ∈ `get_user_org_ids()` y rol con acceso a toda la bandeja; `badge:{org}:{user}` → el propio usuario; `conv` → `can_access_wa_conversation(id)`;
  - **no** ejecutar `ALTER TABLE realtime.messages ENABLE RLS` (falla con 42501 y aborta la migración).
- **Se reutiliza el cliente singleton** de `lib/supabase/client.ts`: los canales comparten el WebSocket de la campanita (`useNotifications`), con un límite de 100 canales por conexión.
- **Reconexión:** en `SUBSCRIBED` tras una caída se invalidan `['inbox', org]` y `['conv', id]`. El contador de no leídos tiene un respaldo de `refetchInterval: 120_000` solo con la pestaña visible.
- **Volumen *(estimación)*:** ~110 k mensajes Realtime al mes por clínica mediana. Pro incluye 5 M (unas 45 clínicas). A 100 clínicas, ~US$ 15/mes (US$ 0,15 por clínica).

### 5.6 Mensajes programados (worker)
Cloud API **no tiene envío diferido 1:1**. La Schedules API configura horarios de atención, no mensajes [OFICIAL]. **La cola es de Yenda.**

| Opción | Precisión | Costo | Contras |
|---|---|---|---|
| **`pg_cron` cada 30 s → `pg_net` → `POST /api/inbox/dispatch`** (Bearer `CRON_SECRET` en Vault) — **recomendada** | p95 ≈ 30-40 s | US$ 0 | Extensiones nuevas (migración aparte, aplicada con A2 porque el dead-letter y los reintentos de media también las usan); `pg_net` ≤ 200 req/s; fijar **explícitamente** `timeout_milliseconds := 10000` en `net.http_post` (el valor por defecto es 2-5 s según la versión: 2.000 ms en la doc de Supabase, 5.000 ms en el README de pg_net). Si el dispatcher tarda más, pg_net marca timeout aunque Vercel siga ejecutando: el dispatcher debe ser idempotente ante timeouts ([pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [README](https://github.com/supabase/pg_net)) |
| Vercel Cron `* * * * *` | ±1 min | Incluido solo en Pro | Exige Pro. **Hoy el plan es Hobby** (`.github/workflows/cron-bridge.yml:1-5`), y Pro es requisito de F0 de todas formas (§0); con Pro queda como respaldo del `pg_cron` |
| Upstash QStash `Not-Before` | ~1 s | ~US$ 1 por 100 k ([precio](https://upstash.com/pricing/qstash)) | Otro proveedor más; dos fuentes de verdad al cancelar |

```sql
CREATE TABLE wa_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('text','template')),
  body text, template_id uuid REFERENCES whatsapp_templates(id) ON DELETE RESTRICT, template_vars jsonb,
  fallback_template_id uuid,                -- SIN FK (2.ª ref. al mismo par → PGRST201)
  anchor_appointment_id uuid, offset_days int, cancel_conditions jsonb,  -- relativas (F3b); SIN FK
  series_id uuid,                            -- SIN FK; cancelar en bloque
  due_at timestamptz NOT NULL, due_local text NOT NULL, due_tz text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','claimed','sent','failed','cancelled','skipped','needs_template','unknown','paused')),
  claimed_at timestamptz, claim_token uuid, attempts int NOT NULL DEFAULT 0,
  sent_message_id uuid, cancelled_by uuid,  -- SIN FK
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
```
1. `wa_claim_due_scheduled(50)`: `UPDATE … WHERE id IN (SELECT … WHERE status='pending' AND due_at<=now() ORDER BY due_at LIMIT 50 FOR UPDATE SKIP LOCKED)`. Solo lo ejecuta `service_role`.
2. **Revalidación al disparar:**
   - ¿la ventana sigue abierta? → texto libre;
   - ¿cerrada y hay plantilla de respaldo? → plantilla;
   - si no → `needs_template` + notificación al autor (`notify_org_members`, mig 192);
   - opt-out → `skipped`;
   - autor activo; plantilla `APPROVED`; cuota disponible; token vigente; Coexistence conectado (si no → `paused`);
   - condiciones relativas (si ya agendó → `skipped`).
3. Envía por el **mismo** camino `wa_claim_outbound → Graph → wa_mark_sent`, con `client_msg_id = scheduled.id`: aunque la fila se reserve dos veces, sale un solo mensaje. Respeta 20/80 mps por número y el límite por par. Usa el TTL de plantilla (utility de 30 s a 12 h) para que un recordatorio de las 8:00 no llegue a las 20:00.
4. Si una fila `claimed` pasa de 5 min → `unknown`, para revisión humana. Nunca se reenvía automáticamente.
5. **Zona horaria:** la UI trabaja con la hora civil de la org. El servidor convierte con un helper nuevo `zonedLocalToUtc(tz, 'yyyy-MM-ddTHH:mm')` en `lib/org-time.ts` (Intl, sin dependencias, con horario de verano) y guarda `due_at` en UTC más `due_local`/`due_tz` para auditoría.
6. **Cancelar o editar:** `UPDATE … WHERE id=$1 AND status='pending'`. Si afecta 0 filas, el mensaje ya salió y se informa así. Queda registro en `wa_conversation_events`.
7. **Topes:** 10 pendientes por conversación y 5.000 por org.

### 5.7 Media
- Descarga en `after()`: `GET /{media_id}` → URL fresca → `GET` con el token. Stream a Storage (TUS por encima de 6 MB). Miniatura WebP de 320 px **al ingerir**. Si falla, reintenta con backoff hasta `expires_at` desde un job de `pg_cron` → `pg_net` → `POST /api/inbox/media-retry` (extensiones instaladas con A2; el job lo agrega A6, así que existe desde el piloto).
- Validación **por magic bytes** (`file-type`), no por el MIME que declara Meta. Se rechazan svg, html, js, exe, docm/xlsm y zip. Se elimina el EXIF (ubicación).
- Más de 100 MB → `too_large` (error 131052). Org sin cuota → `skipped_quota`, con el botón "Descargar (disponible hasta DD/MM)".
- **No usar Supabase Image Transformations:** cobra US$ 5 por cada 1.000 imágenes de origen, ~US$ 150/mes a 100 clínicas.
- Detalle de bucket, URLs firmadas y cuotas en §7.

### 5.8 Frontend
- `app/(dashboard)/inbox/page.tsx`: Server Component delgado que resuelve auth, grant del addon y la primera página, prefetch con `HydrationBoundary`.
- Islas cliente:
  - `ConversationList` (virtualizada);
  - `Thread` (`next/dynamic`);
  - `ContextPanel` (`next/dynamic`, se carga al abrirlo);
  - `ScheduleDialog`, `TemplatePicker`, `QuickReplies` y `EmojiPicker` se cargan al hacer clic.
- Dependencia nueva: **`@tanstack/react-virtual`**, para la lista y el hilo (`measureElement`, anclado abajo) [tamaño gzip NO VERIFICADO; se estiman pocos KB].
- React Query:
  - `['inbox', org, filtros]` con `useInfiniteQuery`, cursor `(last_message_at, id)`, 30 por página, `staleTime` 30 s;
  - `['conv', id]` hacia atrás, 50 por página, `staleTime: Infinity` (lo mantiene Realtime);
  - `['conv-ctx', id]` 60 s;
  - `gcTime` 5 min.
- **Contexto del panel en un solo RPC**, `wa_conversation_context(id)`: paciente, próxima cita, etiquetas y programados pendientes. Filtra por `can_access_wa_conversation` dentro de la función. **La deuda no se calcula en este RPC:** el panel llama al RPC existente `get_patient_summary(patient_id)`, como hace `PatientDrawer`, o usa `lib/patient-debt.ts` en el cliente. El RPC nuevo nunca hace sus propias sumas (sería una tercera copia de la fórmula; CLAUDE.md exige importarla). Test: la deuda del panel es igual a la del drawer para 20 pacientes del piloto.
- Consultas típicas:
  - lista: `WHERE organization_id=$1 AND (last_message_at,id) < ($c1,$c2) ORDER BY last_message_at DESC, id DESC LIMIT 30`;
  - hilo: `WHERE conversation_id=$1 AND (ts,id) < (…) ORDER BY ts DESC, id DESC LIMIT 50`.
- **Errores visibles:** toda lectura de la bandeja lanza `PostgrestLoadError` y muestra el patrón de `data-load-error.tsx`. Nunca se convierte en lista vacía.

### 5.9 Índices y reglas anti-PGRST201

```sql
CREATE INDEX wa_conv_org_list   ON wa_conversations (organization_id, last_message_at DESC, id DESC);
CREATE INDEX wa_conv_org_open   ON wa_conversations (organization_id, last_message_at DESC, id DESC) WHERE status IN ('open','pending');
CREATE INDEX wa_conv_assignee   ON wa_conversations (organization_id, assigned_to, last_message_at DESC) WHERE status <> 'closed';
CREATE INDEX wa_conv_unread     ON wa_conversations (organization_id) WHERE unread_count > 0;
CREATE INDEX wa_conv_patient    ON wa_conversations (patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX wa_conv_tag_filter ON wa_conversation_tags (organization_id, tag_id);
CREATE INDEX wa_msg_conv_ts     ON wa_messages (conversation_id, ts DESC, id DESC);
CREATE UNIQUE INDEX wa_msg_wamid_uq  ON wa_messages (wamid) WHERE wamid IS NOT NULL;
CREATE UNIQUE INDEX wa_msg_client_uq ON wa_messages (organization_id, client_msg_id) WHERE client_msg_id IS NOT NULL;
CREATE INDEX wa_msg_inflight    ON wa_messages (created_at) WHERE status IN ('queued','sending');
CREATE INDEX wa_sched_due       ON wa_scheduled_messages (due_at) WHERE status = 'pending';
CREATE INDEX wa_sched_conv      ON wa_scheduled_messages (conversation_id, due_at) WHERE status IN ('pending','needs_template');
CREATE INDEX wa_media_jobs_next ON wa_media_jobs (next_attempt_at);
CREATE INDEX patient_tags_org_tag ON patient_tags (organization_id, tag);
```
Los dos índices únicos de `wa_messages` son **parciales**: todo `ON CONFLICT` contra ellos repite el predicado (`ON CONFLICT (wamid) WHERE wamid IS NOT NULL`, `ON CONFLICT (organization_id, client_msg_id) WHERE client_msg_id IS NOT NULL`) o falla con 42P10. `wa_conversations` tiene dos claves únicas, `(org, phone_normalized)` y `(org, wa_user_id)`: la conversación se resuelve con advisory lock + SELECT + INSERT, nunca con un `ON CONFLICT` que solo puede apuntar a una de ellas (§5.3).

**Reglas anti-PGRST201** (CLAUDE.md, incidente del 30-sep-2026, mig 273):

| Par | FK que existe o se crea | Columna **sin FK** | Motivo |
|---|---|---|---|
| wa_messages ↔ wa_conversations | `wa_messages.conversation_id` | `wa_conversations.last_message_id` | Una segunda FK en sentido inverso rompe ambos embeds |
| wa_conversations ↔ appointments | ninguna | `booked_appointment_id` | Rastro de atribución (igual que `transferred_from_appointment_id`). **Además**, `appointment_hold_release_blocker` (mig 274) bloquea liberar pre-reservas si existe cualquier FK a `appointments` con CASCADE/RESTRICT/NO ACTION |
| wa_scheduled_messages ↔ whatsapp_templates | `template_id` | `fallback_template_id` | Serían dos FKs en el mismo par |
| wa_scheduled_messages ↔ wa_messages | ninguna | `sent_message_id`, `wa_messages.scheduled_id` | Rastro; evita un ciclo |
| wa_conversations ↔ patients | ya existe `patient_id` (mig 206) | no agregar otra | Ya hay una FK en el par |
| wa_messages ↔ patients / appointments | ninguna | se derivan vía la conversación | Evita pares nuevos con tablas que embebe la agenda |
| wa_conversation_tags ↔ (wa_conversations, org_tags) | 2 FKs | — | **PK propia `id`**, no `(conversation_id, tag_id)`. Una PK compuesta con dos FKs convierte la tabla en puente many-to-many para PostgREST (v10+) y abre caminos nuevos |
| clinical_followups ↔ wa_conversations | ninguna | `source_id` polimórfico | Ya es el patrón de la mig 184 |
| FKs a `auth.users` | sí | — | El esquema `auth` no está expuesto en PostgREST |

**Antes de aplicar:**
- `npm run check:embeds`;
- `supabase/checks/multi_fk_pairs.sql`: Consulta 2 por cada FK nueva (`wa_messages→wa_conversations`, `wa_messages→organizations`, `wa_conversation_tags→org_tags`, `wa_conversation_tags→wa_conversations`, `wa_scheduled_messages→whatsapp_templates`, `wa_scheduled_messages→wa_conversations`, `wa_media_jobs→wa_messages`), y Consulta 1 antes y después.

**Después:** `/api/health/schema` con `ok: true` y abrir la agenda. Se agregan los selects de `/inbox` a `app/api/health/schema/route.ts`. Todos los embeds de la bandeja van con hint explícito `tabla!constraint(...)`. **El preview no aísla la base:** aplicar "para probar" ya es producción.

### 5.10 Observabilidad
| Señal | Cómo | Alerta |
|---|---|---|
| Latencia del webhook y de `wa_ingest` | Log estructurado + spans de Sentry | p95 > 500 ms durante 10 min |
| Webhooks rechazados | Contador + `captureMessage` | > 5 en 5 min |
| Último webhook por org | `whatsapp_config.last_webhook_at` | Org activa sin webhooks > 6 h en horario laboral |
| Cola de programados | `pending AND due_at < now()-2min` | > 0 durante 5 min |
| Heartbeat del dispatcher | Sentry Cron Monitor | Sin check-in en 2 min |
| Envíos `failed` / `unknown` / `needs_template` | Conteo por org y `error_code` | Fallos > 5 % o cualquier `unknown` |
| Media pendiente | `wa_media_jobs` con `attempts ≥ 3` o que vence en < 1 día | > 20 |
| Token de Meta | `token_expires_at` + `debug_token` diario | < 7 días |
| Costo de Meta | `wa_usage_monthly` (≈ intradía) y `wa_usage_daily` desde `pricing_analytics` (real) | Servicio > 900/1.000 |
| Dead-letter del webhook | `wa_webhook_deadletter` pendientes | > 0 durante 15 min |
| Subtransacciones | wait events `SubtransSLRU` / `pg_stat_slru` | Cualquier overflow |

Ruta nueva `GET /api/health/whatsapp` (solo owner/admin, mismo patrón que `/api/health/schema`), que resume todo lo anterior con `ok`.

### 5.11 Costo de infraestructura *(estimación, precios de lista al 30-sep-2026)*
| Rubro | 10 clínicas | 100 clínicas | Por clínica (a 100) |
|---|---|---|---|
| Vercel (invocaciones + CPU + memoria) | ~US$ 1 | ~US$ 13 | US$ 0,13 |
| Realtime (mensajes) | US$ 0 | US$ 15 | US$ 0,15 |
| Disco de la BD + storage + egress | US$ 0 | ~US$ 0,5 (año 1) | ~0 |
| Compute de Postgres (el riesgo real: Micro tiene 1 GB de RAM y lo comparte con la agenda) | — | salto probable a Small (~+US$ 5) o Medium [a medir] | US$ 0,05-0,6 |
| **Total** | **≈ US$ 1-2** | **≈ US$ 30-90** | **≈ US$ 0,35-0,9** |

**Plan de Vercel (verificado en el repo): Hobby.** `.github/workflows/cron-bridge.yml:1-5` existe "mientras el plan de Vercel (Hobby) no los ejecute". Hobby es solo para uso personal no comercial ([Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines)), y el uso comercial es causa frecuente de pausa de la cuenta: una pausa apagaría la agenda, el webhook de Meta y el dispatcher de programados. La bandeja multiplica las invocaciones y la exposición. Por eso **migrar a Pro es requisito de F0** (el costo fijo del plan no está en esta tabla). La duración máxima en Hobby es de 300 s, así que `after()` para media no es el problema; la licencia sí ([duración](https://vercel.com/docs/functions/configuring-functions/duration)).

No verificado: la región de Supabase y su co-ubicación con gru1, y el sobrecosto regional de gru1.

### 5.12 Endurecimiento obligatorio
Puntos que la verificación del 30-sep-2026 marcó como críticos. Ninguna PR que toque estas piezas se aprueba sin ellos.

| # | Qué | Cómo | Prueba |
|---|---|---|---|
| 1 | **REVOKE/GRANT de los RPC `SECURITY DEFINER`** (`wa_ingest`, `wa_claim_outbound`, `wa_mark_sent`, `wa_link_*`, `wa_erase_contact`, `wa_claim_due_scheduled`). En Supabase las funciones nuevas de `public` reciben EXECUTE para PUBLIC/anon/authenticated por defecto: sin esto, cualquier usuario logueado podría llamar `rpc('wa_ingest', payload_falso)` e inyectar mensajes en otra org, o saltarse limitador, addon y rol llamando `wa_mark_sent` | En la **misma migración** de cada RPC: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;` (patrón de `captacion_summary`, migs 207/262). `wa_claim_outbound`, `wa_mark_sent`, `wa_link_appointment` y `wa_link_patient` reciben `p_actor uuid` desde el servidor, tras validar membresía activa, addon y rol (con service role `auth.uid()` es NULL). Los `wa_link_*` solo se invocan desde `POST /api/inbox/link` (§3.9 paso 6) y validan dentro que la cita o el paciente sean de la misma org que la conversación; el evento en `wa_conversation_events` lleva `actor_id = p_actor`. Los RPC de lectura para `authenticated` (`wa_conversation_context`) filtran por `can_access_wa_conversation` dentro de la función ([functions](https://supabase.com/docs/guides/database/functions)) | `SELECT proname, proacl FROM pg_proc WHERE proname LIKE 'wa\_%'` no muestra anon ni authenticated en los RPC de escritura |
| 2 | **Nada de vistas que se salten la RLS.** `wa_inbound_messages` como vista sin `security_invoker` filtraría los mensajes entrantes de todas las orgs | Reescribir `captacion_summary` (misma firma) para que lea `wa_messages` y quitar la vista; o `WITH (security_invoker = true)` + filtro `source='patient'` + `REVOKE ALL … FROM anon` (§5.2) ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)) | Con JWT de la org B, SELECT sobre la vista → 0 filas; Security Advisor sin `security_definer_view` |
| 3 | **ON CONFLICT correcto + advisory lock + dead-letter** | `ON CONFLICT (wamid) WHERE wamid IS NOT NULL` (y lo mismo para `client_msg_id`); conversación con un `pg_advisory_xact_lock` **por identificador presente** (`org:u:<wa_user_id>` y `org:p:<phone>`), todas las claves del lote calculadas al inicio, ordenadas y tomadas en ese orden → SELECT por `wa_user_id` → SELECT por teléfono → INSERT (o fusión si los dos SELECT devuelven filas distintas, §5.3); si `wa_ingest` falla, payload a `wa_webhook_deadletter` (solo service role, purga 7 días, sin PII en logs), 200 a Meta y reproceso con el job de `pg_cron` que se instala con A2 (no con A9) | Payload con el mismo contacto con teléfono y con BSUID en el mismo lote → 1 conversación, 0 errores; dos POST concurrentes (teléfono + `user_id` / solo teléfono / solo `user_id`) → 1 conversación, 0 errores; payload inválido → 200 + fila en dead-letter y reprocesada por el cron |
| 4 | **Un solo `realtime.send` por lote** | Juntar los tópicos en un array y emitir UN evento por conversación al final, en UN bloque EXCEPTION por lote. Alternativa: devolver las conversaciones afectadas y emitir el Broadcast desde Node con la API REST de Realtime después del 200. Un BEGIN…EXCEPTION por mensaje crea una subtransacción con subxid; más de 64 por transacción desbordan la caché (`PGPROC_MAX_CACHED_SUBXIDS`) y degradan todo el clúster, agenda incluida (benchmarks públicos de ~7.200 a ~160 TPS) ([subtransacciones](https://postgres.ai/blog/20210831-postgresql-subtransactions-considered-harmful)) | Lote sintético de 1.000 estados con 0 overflow (`pg_stat_slru`, wait events `SubtransSLRU`) |
| 5 | **Guarda anti doble respuesta en el servidor** | `wa_claim_outbound(p_conv, p_client_msg_id, p_expected_last_msg_id, p_force, p_actor)` → 409 `stale_thread` si entró algo o salió algo de otro autor (incluidos ecos); "Enviar igual" con `p_force=true` queda en `wa_conversation_events` (§5.4) | 2 pestañas envían a la vez → 1 envío y 1 conflicto |
| 6 | **`biz_opaque_callback_data`** en cada envío | `biz_opaque_callback_data = client_msg_id` (texto y plantilla, ≤ 512 caracteres); `wa_ingest` busca por `wamid` y, si no, por el callback, y completa el `wamid` (§5.4) | Simular timeout de Graph con envío real → la fila pasa de `unknown` a `sent/delivered` sola |

---

## 6. Seguridad y cumplimiento

### 6.1 Amenazas principales y controles
| Superficie | Amenaza | Control |
|---|---|---|
| Webhook público | POST falso; escritura cruzada entre orgs por plantilla homónima (D3); payload enorme; trabajo pesado que degrada la suscripción | HMAC sobre el cuerpo completo (ya existe) + tope defensivo de 4 MB (Meta envía hasta 3 MB; una carga firmada válida recibe 200 + Sentry, nunca 413) + `Array.isArray(entry)`; org **solo** por `phone_number_id`; plantillas por `waba_id`; trabajo pesado en `after()`; `wa_ingest` ejecutable solo por service role; verify token solo del entorno (quitar el fallback a la BD, `route.ts:26-40`, D19) |
| Envío | Spam o doble envío = **costo real** y calidad del número; "yo no lo envié" | Limitador distribuido en Postgres (`UPDATE wa_send_counters … WHERE n < limite RETURNING`); `client_msg_id`; `sent_by` estampado en el servidor; ventana calculada en el servidor; masivos solo owner/admin con vista previa de costo y doble confirmación |
| Media entrante | Malware, SVG/HTML con script (XSS), EXIF con ubicación, llenado del storage | Magic bytes + lista permitida; `Content-Disposition: attachment` para documentos; nunca `<iframe>`; sin EXIF; límites propios (imagen 5 MB, audio/video 16 MB, **documento 20 MB**; por encima, un aviso); bucket privado |
| Copiloto IA | Prompt injection; fuga entre pacientes u orgs; precio o dosis alucinados; bucle de costo | §8.3: sin herramientas en V1, mensaje como dato delimitado, KB filtrada por org, validadores deterministas, cuota descontada **antes** de llamar |
| Tiempo real | Canal público que filtra cuerpos de mensajes entre orgs | Canales privados + RLS en `realtime.messages` + eventos con solo ids |
| Tokens de Meta | Robo; vencimiento silencioso a los 60 días; una única `ENCRYPTION_KEY` sin rotación; `decrypt()` que falla abierto | Secretos fuera del alcance de `authenticated`; `token_expires_at` + alerta; prefijo de versión `v1:iv:tag:ct` + `ENCRYPTION_KEY_V2`; `decrypt()` lanza error en prod; reconectar exige MFA y queda auditado |

### 6.2 Secretos de WhatsApp
Mover `access_token` y `register_pin` a `whatsapp_secrets(organization_id PK, access_token, register_pin, key_version)` **sin políticas** (solo service role), o bien `REVOKE SELECT (access_token, register_pin) ON whatsapp_config FROM authenticated`. Las rutas que hoy leen con el cliente del usuario (`send/route.ts:86-91`) pasan a un helper `getWhatsAppClient(orgId)` que valida el rol y descifra con service role. Las variables de entorno sensibles (`META_APP_SECRET`, `ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) se marcan como "Sensitive" en Vercel y nunca van como `NEXT_PUBLIC_*`.

**Límites del limitador (propuesta):**
- texto libre: 30/min y 400/h por usuario; 1.500/h por org;
- plantillas: cuota diaria por plan (por ejemplo, 300/día en Starter) con aviso al 80 %;
- IA: 20 generaciones/min por usuario, cuota mensual por org y como máximo 3 regeneraciones por mensaje.

### 6.3 Matriz de permisos (RLS por org **y** por rol)
Helper `can_access_wa_conversation(p_conv uuid)`, `SECURITY DEFINER STABLE`, con `search_path` fijo. Usa `get_user_org_ids()` / `get_user_org_role()` (que desde la mig 235 exigen `is_active`), más la asignación o el vínculo `patient_id` con citas del doctor, respetando `restrict_doctor_patients` (mig 032). Se aplica en todas las tablas `wa_*`, en `storage.objects` y en `realtime.messages`. **Se reescriben las políticas de la mig 206 (D1) en dos pasos:** la 1.ª migración de F0 aplica org + rol + `is_active` (doctor: solo pacientes con cita suya, o sin acceso), **sin** la cláusula de asignación, porque `assigned_to` todavía no existe; esa cláusula entra en la misma migración que crea la columna (A1). No hay INSERT/UPDATE directo para `authenticated`: todo pasa por RPC o API, y los RPC de escritura tienen `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` (§5.12).

| Acción | owner | admin | recepción | doctor | member |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver lista y leer mensajes | ✅ | ✅ | ✅ | ⚠️ solo asignadas o de sus pacientes | ❌ |
| Responder y enviar plantilla 1 a 1 | ✅ | ✅ | ✅ (cuota) | ⚠️ solo asignadas | ❌ |
| Envío masivo o campaña (F5) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Programar | ✅ | ✅ | ✅ (propios) | ⚠️ asignadas | ❌ |
| Cancelar un programado ajeno | ✅ | ✅ | ❌ | ❌ | ❌ |
| Panel: datos, editar ficha, agendar | ✅ | ✅ | ✅ | ✅ | ❌ |
| Panel: deuda | ✅ | ✅ | ✅ | ⚠️ según el permiso de caja actual | ❌ |
| Panel: notas clínicas o HC | ✅* | ✅* | ❌ (solo "tiene HC: sí/no") | ✅ sus pacientes | ❌ |
| Notas internas del chat | ✅ | ✅ | ✅ | ✅ | ❌ |
| Crear catálogo de etiquetas / aplicar etiquetas | ✅/✅ | ✅/✅ | ❌/✅ | ❌/✅ | ❌ |
| "Adjuntar a HC" | ✅ | ✅ | ❌ | ✅ | ❌ |
| Generar borrador IA / editar la KB | ✅/✅ | ✅/✅ | ✅/❌ | ✅/⚠️ propone | ❌ |
| Exportar conversaciones | ✅ (MFA) | ✅ (MFA) | ❌ | ❌ | ❌ |
| Borrar conversación (ARCO), conectar número, ver auditoría | ✅ | ✅ | ❌ | ❌ | ❌ |

\* Según las políticas actuales de `clinical_notes`, sin cambios. **Decisión del fundador:** confirmar las reglas del doctor y que `member` quede sin acceso.

### 6.4 PII: logs, Sentry y lo que se envía a la IA
- **Prohibido** en `console.*`, Sentry y analítica: cuerpo de los mensajes, teléfono completo, nombre, DNI, email, texto de prompts o borradores, `referral_json` completo.
- **Permitido:** ids, `wamid`, códigos de error de Meta, teléfono **enmascarado** (`51*****321`, helper `maskPhone()`), tamaños y latencias.
- **Correcciones concretas:**
  - `lib/whatsapp/send.ts:47` lanza `invalid_phone` sin el valor;
  - `whatsapp_message_logs.error_message` guarda código y título de Meta, no los datos de entrada;
  - `ai-assistant/route.ts:561-567` deja de guardar la pregunta cruda en `clinical_access_log.metadata`.
- **Sentry:**
  - `beforeSend`/`beforeBreadcrumb` que eliminen `request.data`, cookies y query strings de `/api/whatsapp/**`, `/api/inbox/**` y `/api/ai*`;
  - regla de data scrubbing en el proyecto (DNI `\b\d{8}\b`, celular `\b9\d{8}\b`, email);
  - en Replay, `block` sobre el hilo.
- **Hacia la IA** (mínimo necesario):
  - últimos ≤ 12 mensajes **de esta conversación**, redactados por valor (DNI → `[DOC]`, teléfono → `[TEL]`, email → `[EMAIL]`, tarjeta → `[CARD]`);
  - **sin nombre** (el modelo escribe `{nombre}` y el servidor lo reemplaza después);
  - próxima cita solo si es relevante; si la org lo marca como sensible (fertilidad, salud mental), sin el doctor;
  - **nunca** HC, diagnósticos, notas clínicas, deuda, media ni datos de otras pacientes;
  - sin PHI en los esquemas JSON, porque se cachean hasta 24 h fuera de las protecciones de PHI ([Anthropic, retención](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)).

### 6.5 Cumplimiento en Perú (Ley 29733 + D.S. 016-2024-JUS, vigente desde el 30-mar-2025)
Roles: la **clínica es responsable** (titular del banco de pacientes y dueña de su WABA). **Yenda es encargado.** Meta, Anthropic, Supabase, Vercel y Sentry son subencargados. Un abogado debe cotejar los artículos con el texto publicado en El Peruano antes de publicar textos legales.

| # | Obligación | Estado | Qué hacer |
|---|---|---|---|
| 1 | Consentimiento para datos de salud (sensibles; por escrito según el art. 13.6) y **opt-in de WhatsApp** que nombre a la clínica (Meta) | No existe | `patients.wa_opt_in_at`, `wa_opt_in_source`, `wa_opt_in_text_version`; casilla en la reserva pública y en la ficha; opt-in **separado** para marketing |
| 2 | Deber de información al primer contacto | No existe por clínica | Enlace al aviso de privacidad de la clínica (página generada desde la configuración de la org) en el primer mensaje de la clínica |
| 3 | **Contrato de encargo Yenda–clínica** (DPA) | **No existe** (`app/(public)/terms/page.tsx`) | Anexo con finalidades, subencargados, asistencia ARCO, **aviso de incidente a la clínica en ≤ 24 h**, borrado al terminar y auditoría; aceptación versionada (patrón de la mig 116) |
| 4 | Incidentes: **48 h a la ANPD** (D.S. 016-2024-JUS; art. 34.1 según una fuente secundaria [NO VERIFICADO]), aunque el encargado considere el incidente resuelto, **y al Centro Nacional de Seguridad Digital si el incidente es digital** ([reglamento](https://lpderecho.pe/reglamento-ley-proteccion-datos-personales-decreto-supremo-016-2024-jus/)) | La privacidad promete 72 h y cita el reglamento derogado "DS 003-2013-PCM" (`privacy/page.tsx:132, 571-592`) | Corregir a ≤ 24 h hacia la clínica; runbook interno con los dos avisos (ANPD y CNSD) |
| 5 | Flujo transfronterizo (art. 15) | Declarado por consentimiento + cláusulas | DPA con Meta, Anthropic, Supabase, Vercel y Sentry; **inscribir el flujo transfronterizo en el RNPDP** (trámite ANPD "Inscribir flujo transfronterizo de datos personales", [gob.pe](https://www.gob.pe/9253-inscribir-flujo-transfronterizo-de-datos-personales)); **verificar la región real de Supabase** [NO VERIFICADO] |
| 6 | **Veracidad sobre Anthropic** | La privacidad dice "zero-data-retention" (`privacy/page.tsx:193-195, 527`) sin acuerdo ZDR. Para modelos que no son "Covered Models" (Opus 5.5, Sonnet 5.5 y Haiku 4.5 no lo son), la página de retención de Anthropic dice que prompts y salidas **no se retienen por defecto**; los Covered Models (Fable 5 y 5.1, Mythos 5 y 5.1) exigen 30 días ([retención](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). La política comercial de privacy.claude.com menciona borrado dentro de 30 días [NO VERIFICADO: página bloqueada, contenido por fuentes secundarias]. ZDR es un acuerdo contractual por organización (ventas) | **Decisión:** para PHI, activar **HIPAA readiness** (BAA estándar autoactivable en Console > Settings > Privacy), que Anthropic declara alternativa a ZDR, o firmar ZDR; en ambos casos corregir el texto (no decir "zero-data-retention" sin ese acuerdo) y **confirmar con Anthropic qué rige para la organización de Yenda** |
| 7 | ARCO + portabilidad | Plazos inconsistentes (20 frente a 10 días hábiles); `/data-deletion` promete borrar por teléfono sin código que lo haga | RPC `wa_erase_contact(org, phone)` + exportación JSON; unificar plazos [plazos exactos NO VERIFICADOS] |
| 8 | Registro de bancos de datos ante la ANPD (gratuito, automático vía SIPDP) | Pendiente | Yenda inscribe los suyos; a la clínica se le entrega la ficha técnica |
| 9 | Oficial de datos personales | No se menciona | Designarlo (recomendado) [umbral legal NO VERIFICADO] |
| 10 | Historia clínica (NTS 139): el chat **no es HC** | — | "Adjuntar a HC" con autor y fecha; política de no hacer teleconsulta por chat |
| 11 | IA en salud (D.S. 115-2025-PCM, reglamento de la Ley 31814, publicado el 9-sep-2025): transparencia, supervisión humana, registro del sistema de IA y evaluación de riesgo | Reglamento vigente desde ene-2026. **Plazo de adecuación para salud privada: 1 año desde la publicación (10-sep-2026, ya vencido)** según varias fuentes secundarias ([Enfoque Derecho](https://enfoquederecho.com/iso-42001-en-el-limbo-regulatorio-que-deben-hacer-salud-educacion-y-finanzas-antes-de-setiembre-de-2026/), [CC Firma](https://ccfirma.com/alerta-legal-reglamento-de-la-ley-n-31814/), [Compliance Latam](https://compliancelatam.legal/peru-reglamento-de-la-ley-de-inteligencia-artificial-ds-115-2025-pcm-aprueban-el-reglamento-de-la-ley-de-inteligencia-artificial-ley-no-31814/)); una fuente reporta 2 años [NO VERIFICADO en el texto primario, bloqueado por el proxy]. Las MYPE tendrían plazos escalonados | Confirmar en la disposición complementaria final del texto oficial y si Yenda califica como MYPE. Si rige 1 año, las obligaciones **ya aplican** al asistente de reportes y al copiloto, no solo a V3. V1 cumple la supervisión humana por diseño (el humano envía); pasan al checklist de F4 el **registro y la transparencia del sistema de IA** y la **evaluación de riesgo**. V3 además exige avisar "estás hablando con un asistente" |
| 12 | Coexistence trae chats antiguos, incluidos contactos personales | — | Aviso en el onboarding e importación limitada |
| 13 | Declaraciones ante Meta (App Review: "sin marketing", "no se usa para entrenar") | Vigentes | La IA sin entrenamiento es compatible. Los masivos de F5 exigen actualizar la declaración |

Sanciones muy graves: 50 a 100 UIT (Ley 29733, art. 39) (≈ hasta S/ 550.000 con la UIT 2026 de S/ 5.500, fijada por el D.S. 301-2025-EF; [MEF](https://www.gob.pe/institucion/mef/noticias/1314665-mef-establece-en-s-5500-el-valor-de-la-uit-para-el-ano-2026), [Ley 29733](https://www.smv.gob.pe/Uploads/Ley_29733_vigente_2025.pdf)).

### 6.6 Retención y borrado
| Dato | Retención propuesta (decisión del fundador) | Mecanismo |
|---|---|---|
| Texto de los mensajes | 24 meses desde el último mensaje (configurable de 6 a 60) | Cron `wa-retention`, DELETE en lotes de 1.000 |
| Media | 180 días (configurable; ver §7) | Cron + `storage.remove`; la fila queda `expired` |
| Mensaje o media copiados a la HC | La de la HC: 5 años en archivo activo + 15 en pasivo (hasta 20 años desde la última atención), NTS 139-MINSA/2018 ([resumen DIRESA Junín](http://archivos.diresajunin.gob.pe/OITE/HC/Historia_clinica_2018resumen.pdf)) | Vive en `clinical-files`/`clinical_notes` |
| Borradores IA (`ai_suggestions.draft`) | 12 meses; después solo agregados | Cron |
| Programados enviados o cancelados | 90 días | Cron |
| `wa_status_buffer` | 7 días | Cron |
| ARCO por teléfono | Plazo legal | `wa_erase_contact`: borra mensajes, media y programados; `phone_normalized` → `ANON_<hash>`; conserva los conteos de Captación; queda auditado |
| Baja de la org | Al anonimizar | Extender `anonymize_org` (mig 149) a `wa_*` y `whatsapp_message_logs.recipient_phone`, y `account-deletion-process` borra el prefijo `{org_id}/` de `wa-media` |
| Auditoría | 12 meses (lo que declara la privacidad); 24 recomendados para accesos a datos sensibles [NO VERIFICADO] | `clinical_access_log`, extendido con `wa_conversation`, `wa_message`, `wa_media`, `wa_ai_draft`, `wa_config`, `wa_export`; `view` con antirrebote de 1 registro cada 30 min por usuario y conversación |

### 6.7 Checklist de salida (release gate)
**Común a todas las fases**
- [ ] RLS en todas las tablas `wa_*`; escrituras solo por RPC o service role, con el autor estampado.
- [ ] `check:embeds` + `multi_fk_pairs.sql` antes y después; `/api/health/schema` en `ok: true`; la agenda abre.
- [ ] Prueba entre orgs: con el JWT de la org B, SELECT/INSERT/UPDATE sobre cada tabla y bucket de la org A → 0 filas o 403.
- [ ] Prueba por rol: `member`, doctor no asignado y miembro con `is_active=false` → 0 filas.
- [ ] Lecturas que lanzan su error; nada de PII en logs; `beforeSend` activo.
- [ ] p95 de la agenda con variación ≤ 5 % contra la línea base de 7 días; ninguna suscripción fuera de `/inbox` salvo `badge:`; 0 consultas en `/scheduler` para orgs sin addon.
- [ ] `SELECT proname, proacl FROM pg_proc WHERE proname LIKE 'wa\_%'` sin anon ni authenticated en los RPC de escritura (§5.12).
- [ ] Ninguna vista sobre `wa_*` sin `security_invoker`; con JWT de la org B, SELECT sobre cada vista → 0 filas; Security Advisor sin `security_definer_view`.

**F0 / F3a**
- [ ] D1, D2, D3, D5, D6, D8, D9, D10 y D19 (fallback del verify token) corregidos. D18 (recordatorios sin reserva) queda registrada como deuda.
- [ ] Plan de Vercel en Pro.
- [ ] Webhook con p95 < 500 ms; tope de body ≥ 3 MB; `wamid` idempotente con `ON CONFLICT … WHERE`; estados monótonos en `wa_messages` **y** en `whatsapp_message_logs`; dead-letter probado.
- [ ] Lote sintético de 1.000 estados sin overflow de subtransacciones.
- [ ] Limitador distribuido, `client_msg_id`, `biz_opaque_callback_data`, ventana calculada en el servidor, `sent_by` = `p_actor`, guarda `stale_thread`.
- [ ] Realtime privado con RLS y eventos con solo ids; badge por usuario para roles restringidos.
- [ ] `wa_erase_contact` y `anonymize_org` probados **antes del go-live del piloto**.
- [ ] Legal publicado: DPA, 48 h ANPD (+ CNSD si es digital) / 24 h a la clínica, flujo transfronterizo inscrito, reglamento vigente, texto sobre Anthropic.

**Panel**
- [ ] Sin HC para recepción (probado con esa cuenta); deuda vía `get_patient_summary` / `lib/patient-debt.ts` e igual a la del drawer para 20 pacientes del piloto; Agendar usa el mismo camino que la agenda, sin atajos con service role, con choques validados contra las citas reales (nunca `existingAppointments=[]`).

**Programados**
- [ ] Revalidación completa al disparar; topes; cancelación auditada; opt-in/opt-out; hora de la org.

**Media**
- [ ] Bucket privado con política por `{org_id}`, URLs firmadas ≤ 300 s, magic bytes, sin EXIF, `attachment`, purga.

**F4 (IA)**
- [ ] Contrato con Anthropic resuelto (HIPAA readiness/BAA activado o ZDR firmado; retención confirmada para la org de Yenda).
- [ ] D.S. 115-2025-PCM: registro y transparencia del sistema de IA, evaluación de riesgo y supervisión humana documentados (plazo posiblemente vencido, §6.5 fila 11).
- [ ] KB con RLS y filtro explícito por org (prueba de fuga: desde la org A no se ve nada de la org B).
- [ ] Redacción de PII + validadores de salida (precio con sufijo según `igv_affectation`).
- [ ] Audio o imagen sin texto como último entrante → "Generar" deshabilitado y conversación "requiere revisión humana".
- [ ] ≥ 30 casos de prompt injection sin fugas.
- [ ] Cuota descontada antes de llamar.
- [ ] Sin autoenvío.
- [ ] Privacidad actualizada.

---

## 7. Storage

| Aspecto | Decisión propuesta |
|---|---|
| Dónde | Bucket **privado** `wa-media` en Supabase Storage. `file_size_limit` de 100 MB (máximo de Meta) y MIME permitidos. Ruta `{org_id}/{conversation_id}/{yyyy}/{mm}/{wamid}.{ext}` + `{wamid}.thumb.webp` |
| Acceso | RLS en `storage.objects`: `(storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())` más `can_access_wa_conversation`, igual que `clinical-photos` (mig 166). Escritura solo con service role. **URLs firmadas de 120-300 s**, pedidas en lote (`createSignedUrls`) solo para lo visible en pantalla; descarga auditada |
| Volumen *(estimación, a validar con los pilotos)* | Mediana: ~15 archivos/día × ~200 KB + miniatura ≈ **90 MB/mes ≈ 1,1 GB/año**. Grande: ~3 GB/año. Texto en la BD: 0,03-0,3 GB/año |
| Costo | Supabase Pro incluye 100 GB y cobra US$ 0,0213 por GB-mes adicional. Egress: 250 GB incluidos, luego US$ 0,09/GB. Una clínica que ve cada archivo 3 veces genera ~0,3 GB/mes: despreciable. **A 100 clínicas, año 1: ~110 GB ≈ US$ 0,2/mes** |
| Cuotas por plan | `plans.max_storage_mb` = 100 / 2.048 / 10.240 (mig 020). **El plan de 100 MB se llena en 1-2 meses con chat.** Contador `org_storage_usage(org, category, bytes)`, que se actualiza al subir y al borrar. Aviso al 90 %; al 100 %, la media nueva queda `skipped_quota` (descargable a pedido mientras Meta la conserve, 7 días) |
| Retención | `wa_media_retention_days` por org (por defecto 180; null = indefinida solo en los planes altos). Job diario que borra **vía la API de Storage**; el texto se conserva |
| Importación de historial | Limitada a 90 días por defecto (la sincronización es de una sola vez) para no disparar el storage |
| HC | Lo que se copia con "Adjuntar a HC" pasa a `clinical-files` y hereda la retención de la historia clínica |

**Decisión del fundador:** para el plan de 100 MB, (a) la bandeja exige el plan de 2 GB, o (b) en ese plan la media se retiene 30 días y lo demás queda como "archivo vencido".

---

## 8. Copiloto IA "Generar respuesta"

### 8.1 Base de conocimientos para salud: el activo real
Principios tomados de la literatura:
- **Fichas cortas estructuradas** (100-800 caracteres, id estable, un tema) antes que PDFs largos: se pueden citar, validar y detectar huecos.
- **Triage de seguridad antes de generar**: un sistema RAG de salud materna enruta las consultas de alto riesgo a plantillas escritas por expertos antes de la generación ([arXiv 2603.13168](https://arxiv.org/pdf/2603.13168)).
- **La falla típica es de conducta, no de datos.** En red-teaming de un chatbot RAG de salud, los errores subieron a 50 % en consultas de consejo y a 40 % ante angustia del usuario ([Nature Sci Rep 2026](https://www.nature.com/articles/s41598-026-45719-3)). Por eso los guardrails son **deterministas en código**.
- **El sub-triage es real**: ChatGPT Health sub-triageó el 51,6 % (33/64) de viñetas de emergencia clara ([Nature Medicine](https://www.nature.com/articles/s41591-026-04297-7); lo recoge también, como fuente secundaria, [CARE-Bench](https://arxiv.org/pdf/2608.03731)).
- OMS: supervisión humana, transparencia y rendición de cuentas.

| Capa | Contenido | Origen | Editable | id |
|---|---|---|---|---|
| **A. Automática** (nunca se redacta a mano) | Servicio: nombre, categoría, **precio textual** desde `services.base_price` (bruto, como se cobra) con el sufijo armado desde `igv_affectation` (mig 108:313-315): 1 (gravado) → "S/ 150.00 (incluye IGV)"; 8 (exonerado) / 9 (inafecto) → sin sufijo o "(exonerado de IGV)". Usa el mismo formateador que la ficha y el comprobante, y el validador de precios compara contra ese texto. Decir "incluye IGV" de un servicio exonerado sería falso y violaría la regla de oro IGV. Además: duración, preparación (`pre_appointment_instructions`), doctores (`doctor_services`), si se agenda (`is_bookable`) · doctores y horarios · horario de atención (`scheduler_settings`, zona de la org) · sedes (dirección, Maps, teléfono) · medios de pago (`lookup_values`) | Tablas del sistema | No; se edita el catálogo | `svc:`, `doc:`, `hours:`, `loc:`, `pay:` |
| **B. Blanda** | Ficha ampliada por servicio (qué incluye, contraindicaciones **administrativas**, qué llevar), políticas (cancelación, reprogramación, pre-reserva, reembolsos), FAQs, promociones con `valid_until` | `kb_cards` | Sí, borrador → aprobado por owner/admin | `svcx:`, `pol:`, `faq:` |
| **C. Voz** | Tú o usted, emojis, calidez, saludo y firma, largo máximo | `kb_cards kind='voice'` | owner/admin | `voice:org` |
| **D. Urgencias** | Plantilla fija de derivación aprobada por el director médico: guardia, **SAMU 106**, **Línea 113** (ruta de opciones [NO VERIFICADO]) | `kb_cards kind='urgency'`, versionada | Solo owner/admin | `urg:org` |

**Regla de precio (clave en fertilidad):** override `price_policy ∈ {publicable, desde, solo_en_consulta}`. Los tratamientos que se cotizan por presupuesto (FIV/IIU con tiers en `budget_records`) van como `solo_en_consulta`: la ficha dice "el costo se define en la consulta de evaluación" y el validador bloquea cualquier monto. Así se cumple "el precio se cita textual del catálogo o no se cita".

**Tablas** (RLS + `organization_id`):
- `kb_cards(id, org, kind, title, body ≤ 800, structured jsonb, price_policy, status draft|pending_review|approved|archived, version, valid_until, source_ref uuid SIN FK, approved_by, approved_at)`;
- `kb_card_versions` (qué sabía la IA el día X);
- `kb_snapshots(org, version_hash, rendered_text, card_index, token_count, built_at)`: **una fila activa por org**; es el texto exacto que entra al prompt;
- `kb_gaps(id, org, question_scrubbed, cluster_key, occurrences, first_seen, last_seen, status, answered_card_id, conversation_id)`;
- `ai_suggestions(id, org, conversation_id, anchor_message_id, requested_by, model, kb_version_hash, draft, used_card_ids, confidence, risk_flags, intent, gap_id, input/cache_read/cache_write/output tokens, latency_ms, outcome inserted|regenerated|discarded|ignored, sent_text_hash, edit_distance)`. Registra el costo real, a diferencia del `tokens_used: 0` de hoy.

**Snapshot perezoso, sin triggers en tablas calientes.** Al pedir una sugerencia se compara `max(updated_at)` de las fuentes con `built_at` y, si cambió, se reconstruye (~50 ms, solo lectura). **Ningún trigger en `appointments` ni en el catálogo.**

**Bandeja de brechas.** Cuando el modelo devuelve `brecha` o el validador bloquea un precio, se hace upsert por `cluster_key`. El admin ve "12 pacientes preguntaron X esta semana" y la responde **creando una ficha**. La KB crece con lo que las pacientes preguntan de verdad.

**Tamaño esperado del prefijo** *(estimación, medir con `count_tokens`)*: chica ≈ 6 K tokens, mediana (tipo Vitra) ≈ 15-17,5 K, grande multisede ≈ 35-40 K. Opus y Sonnet 5.5 generan ~30 % más tokens que Haiku 4.5 para el mismo texto.

### 8.2 Recuperación: recomendación por fases
| Fase | Estrategia | Por qué |
|---|---|---|
| **V1** | **KB completa en el system prompt, cacheada** (TTL 1 h) + contexto dinámico armado por el servidor. Sin herramientas | Cero infraestructura nueva; la ficha correcta siempre está en el contexto (no hay fallos de recuperación); no se envía texto a un tercero más; es más barata que RAG por debajo de ~30-36 K tokens |
| **V2** | V1 + **una** herramienta de lectura: `buscar_huecos(service_id, desde, turno)` sobre un RPC nuevo `get_free_slots` (reutiliza la lógica de `available-slots`), con `strict: true` y `tool_choice: "auto"` | Proponer horarios reales |
| **V3 / KB > 30 K** | Búsqueda híbrida (pgvector + FTS `spanish` + RRF) **solo para la capa blanda larga**. La capa A (precios) sigue siempre completa | Clínicas multisede. Nota: la consulta con PHI iría a Voyage (Anthropic no tiene embeddings propios); sería un subencargado más |

### 8.3 Guardrails clínicos (código → prompt → validador → humano)
| Riesgo | Control determinista | En la UI |
|---|---|---|
| **Señales de alarma** | **Pre-filtro léxico en español peruano ANTES del LLM:** sangrado/hemorragia/coágulos, dolor fuerte/insoportable, desmayo, fiebre, falta de aire, hinchazón abdominal (hiperestimulación tras punción), "no siento al bebé", embarazo + dolor/sangrado, ideación suicida. Si hay coincidencia, **no se genera**: se muestra la ficha `urg:org` y la conversación se marca "Urgente". El LLM es la segunda red (`senal_alarma`). **Pre-filtro y LLM solo ven texto**, y en Perú las pacientes mandan muchas notas de voz y fotos: si el último mensaje entrante es **audio o imagen sin texto**, se deshabilita "Generar", se muestra "Escucha el audio antes de responder" y la conversación queda marcada "requiere revisión humana" (un "estoy sangrando mucho" en audio no puede terminar en una sugerencia comercial). La transcripción pasa a V2, con su propia evaluación de privacidad | Banner rojo; decide la recepcionista |
| Diagnóstico, fármacos, dosis | Validador de salida: lista de fármacos + regex `\d+\s?(mg|ml|gotas|tabletas)` → bloqueo | "Consulta clínica: sugerir derivar o agendar" |
| **Precio inventado** | Se extrae cada monto (`S/\s?\d[\d.,]*`, "\d+ soles") y **debe coincidir textualmente** con una ficha de `fichas_usadas` que no sea `solo_en_consulta`. Si no coincide → "déjame confirmarlo" + brecha | Exactitud 100 %, determinista |
| Fuera de la KB | `brecha != null` o confianza baja → `kb_gaps` | "Brecha registrada" · [Escribir yo] |
| Datos de otras pacientes | La petición lleva **solo esta conversación**; sin herramientas de búsqueda de pacientes ni SQL (no se reutiliza el patrón SQL de `ai-assistant`) | Imposible por construcción |
| Prompt injection | El texto de la paciente va **solo** en `messages`, dentro de `<mensaje_paciente>` y escapado; se redacta la PII; sin herramientas de escritura; salida con esquema JSON | Flag `intento_manipulacion` |
| Enlaces o teléfonos ajenos | Solo se permiten URLs y teléfonos presentes en las fichas `loc:`/`urg:` | Bloqueo |
| Negativa del modelo | Manejar `stop_reason: "refusal"` | "No se pudo sugerir; responde manualmente" |

### 8.4 Diseño del request y de la salida
- **Endpoint:** `POST /api/inbox/suggest` (runtime Node, SDK oficial `@anthropic-ai/sdk`, que hoy no está en `package.json`; no copiar el `fetch` crudo). Timeout de 15 s. Es una mutación de React Query que no bloquea el chat; los errores se muestran, nunca se tragan.
- **Lecturas (3, indexadas):** el snapshot activo; los últimos 12 mensajes (entrantes y salientes); un mini-resumen (¿es paciente?, próxima cita si existe, estado del lead derivado con `wa_lead_outcome` más el `lead_status` manual si es "perdido" o "no_interesado", etiquetas). Nunca HC ni deuda.
- **Orden estable para la caché:**
```
system[0]  instrucciones + guardrails + formato               (global)
system[1]  voz de la clínica + urgencias                       (por org)
system[2]  <kb version="hash">…fichas con id…</kb>             (por org, cache_control ephemeral ttl 1h)
messages   <contexto_paciente>…</contexto_paciente>
           <conversacion>…12 mensajes redactados, hora local de la org…</conversacion>
           <mensaje_paciente id="anchor">…</mensaje_paciente>
           "Redacta la respuesta para la clínica."
output: json_schema SUGGESTION_SCHEMA · max_tokens ~4000
        Opus 5.5:   effort low (el pensamiento NO se puede desactivar: {type:'disabled'} → 400; por defecto effort=medium)
        Sonnet 5.5: effort low + evaluar thinking:{type:'between_tools'}
        Haiku 4.5:  SIN effort (output_config.effort → error en Haiku 4.5); budget_tokens o nada
```
- **Configuración por modelo, no un request único:** un mismo request "effort low" para los tres modelos falla en Haiku 4.5. Con pensamiento adaptativo y `max_tokens` bajo hay riesgo de cortes: se sube a ~4.000 y se manejan `stop_reason: "max_tokens"` y `"refusal"` (skill `claude-api`, precios al 25-sep-2026; [pricing](https://platform.claude.com/docs/en/about-claude/pricing)).
- **Salida (esquema fijo, igual para todas las orgs y sin PHI):**
```json
{ "borrador": "≤ 700 caracteres, 1 burbuja, sin markdown",
  "fichas_usadas": ["svc:…","faq:…"],
  "confianza": "alta|media|baja",
  "intencion": "precio|agendar|reprogramar|preparacion|ubicacion_horario|pago|resultado|sintoma|otro",
  "riesgo": ["senal_alarma","consulta_clinica","precio_no_en_kb","intento_manipulacion","queja"],
  "requiere_humano": true,
  "brecha": "pregunta reformulada sin datos personales | null" }
```
- No se usa Citations: es incompatible con los structured outputs (400) ([docs](https://platform.claude.com/docs/en/build-with-claude/citations)). La trazabilidad sale de `fichas_usadas` más el validador.
- "Hoy" se inyecta con `lib/org-time.ts`. `{nombre}` lo reemplaza el servidor.
- **Una sola burbuja de 300-700 caracteres**: también significa menos mensajes cobrables.

### 8.5 UX: vista previa → cuadro de texto
- **Disparadores:** "Generar" al pasar el mouse sobre una burbuja entrante (responde **esa** pregunta), o "Generar" en el cuadro de texto (responde lo pendiente del hilo y agrupa varias preguntas).
- **Vista previa encima del cuadro de texto, sin enviar nada:**
```
┌ Sugerencia (borrador de IA: revisa antes de enviar) ───────────┐
│ ¡Hola María! La ecografía transvaginal cuesta S/ 150.00        │
│ (incluye IGV) y sí atendemos sábados de 8 a 13 h. ¿Te separo   │
│ un horario?                                                    │
│ Fuentes: [Catálogo: Eco TV] [Horario: sede Miraflores]         │
│ Confianza: alta                                                │
│ [Usar ↵] [Regenerar] [Más corto] [Más formal] [Descartar]      │
└────────────────────────────────────────────────────────────────┘
```
- **Usar** inserta el texto **en el cuadro de texto** para editarlo y enviarlo. **Nunca hay autoenvío en V1.** Los chips de fuentes abren la ficha.
- Si hay flag de riesgo: el banner va en rojo y, en alarma, se muestra la plantilla de urgencia en lugar del borrador.
- Si la ventana está cerrada: la vista previa lo avisa y propone una plantilla con su costo.
- Sin fuente: "No encontré esto en la base · [Registrar como brecha] [Escribir yo]".
- Al enviar se guardan `outcome` y `edit_distance`, que son la señal que prepara el paso de V1 a V3.
- **Latencia *(estimación, medir)*:** con cache hit, Haiku 1-2 s, Sonnet 2-3 s, Opus 2,5-5 s. En V1, esqueleto "Pensando…" sin streaming si el p95 < 5 s.

### 8.6 Costos por modelo (la elección es del fundador)
Precios por millón de tokens ([pricing oficial](https://platform.claude.com/docs/en/about-claude/pricing)):

| Modelo | Input | Escritura caché 5 min / 1 h | Lectura caché | Output | Mínimo cacheable |
|---|---|---|---|---|---|
| `claude-opus-5-5` | US$ 4 | 5 / 8 | 0,20 | 20 | 512 |
| `claude-sonnet-5-5` | US$ 2 | 2,50 / 4 | 0,20 | 10 | 512 |
| `claude-haiku-4-5` | US$ 1 | 1,25 / 2 | 0,10 | 5 | **4.096** (una KB chica no se cachea) |

**Por sugerencia** (KB mediana de 17,5 K cacheados, 900 dinámicos, salida visible de 500 en Opus/Sonnet y 250 en Haiku [salida NO VERIFICADA, medir]). **Estas cifras son un piso, no una estimación:** en Opus 5.5 el pensamiento no se puede desactivar y en Sonnet 5.5 viene activo (salvo `between_tools`); esos tokens se cobran como salida (US$ 20 y US$ 10 por millón). La fila "con ~300 tokens de pensamiento" suma US$ 0,006 en Opus (≈ +35 % con caché) y US$ 0,003 en Sonnet. La tabla se rehace midiendo `usage.output_tokens`, que incluye el pensamiento:

| | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|---|
| Con cache hit (piso) | US$ 0,0171 | US$ 0,0103 | US$ 0,0033 |
| Con cache hit + ~300 tokens de pensamiento | US$ 0,0231 | US$ 0,0133 | US$ 0,0033 (sin pensamiento) |
| Sin caché (piso) | US$ 0,0836 | US$ 0,0418 | US$ 0,0154 |
| Sin caché + ~300 tokens de pensamiento | US$ 0,0896 | US$ 0,0448 | US$ 0,0154 |

**Por clínica al mes** (2 sugerencias por conversación; S/ 3,40) *(estimación; piso → con ~300 tokens de pensamiento por sugerencia)*:

| Escenario | Sugerencias | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |
|---|---|---|---|---|
| 300 conversaciones | 600 | US$ 23,9 → 27,5 (S/ 81 → 94) | US$ 12,8 → 14,6 (S/ 44 → 50) | US$ 4,5 (S/ 15) |
| 1.500 conversaciones | 3.000 | US$ 59,5 → 77,5 (S/ 202 → 264) | US$ 34,9 → 43,9 (S/ 119 → 149) | US$ 11,4 (S/ 39) |
| 5.000 conversaciones | 10.000 | US$ 176,5 → 236,5 (S/ 600 → 804) | US$ 105,7 → 135,7 (S/ 359 → 461) | US$ 34,0 (S/ 116) |

- `inference_geo: "us"` multiplica por 1,1. En V2, cada ronda de herramienta suma US$ 0,003-0,008 en Opus.
- **Lectura para decidir:**
  - con Opus, desde **~450-500 conversaciones al mes** (estimación sin tokens de pensamiento; ~350 si se suman ~300 por sugerencia) el costo de IA **supera los S/ 99 de Captación** (≈ US$ 29);
  - el investigador de IA recomienda Opus 5.5 por defecto, por la calidad en señales de alarma y en la voz;
  - Sonnet cuesta ≈ 60 % y Haiku ≈ 20 % de Opus en el piso; con pensamiento, ≈ 57 % y ≈ 15 %;
  - **regla propuesta:** correr el set de evaluación (§8.7) con los tres y elegir el modelo más barato que pase **todas** las compuertas (100 % en precio y en alarmas). El modelo queda configurable por org, sin tocar código.
- **Empaquetado sugerido (a decidir):** Captación incluye N sugerencias al mes (por ejemplo 500) y se venden packs. Tope duro por org **en la base** (conteo del mes en `ai_suggestions`), no en el `aiLimiter` en memoria. Como máximo 3 regeneraciones por mensaje.
- **Anthropic:**
  - para modelos que no son "Covered Models", la página de retención dice que prompts y salidas **no se retienen por defecto**; la política comercial menciona borrado dentro de 30 días [NO VERIFICADO directamente]; no entrena con esos datos. Hay que confirmar con Anthropic qué rige para la organización de Yenda;
  - ZDR es contractual (ventas); para PHI, lo recomendado por Anthropic es **HIPAA readiness** (BAA estándar autoactivable en Console > Settings > Privacy), que Anthropic declara alternativa a ZDR;
  - **no usar Batch ni Files API con PHI** (no son elegibles);
  - ninguno de los tres modelos candidatos (Opus 5.5, Sonnet 5.5, Haiku 4.5) es Covered Model (los Covered Models, Fable 5 y 5.1 y Mythos 5 y 5.1, exigen 30 días de retención);
  - recomendado: un workspace de Anthropic separado para el copiloto ([retención](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)).

### 8.7 Evaluación
**Set de ~345 casos:** preguntas reales de los pilotos anonimizadas (scrubber + revisión manual) más casos sintéticos.

| Categoría | n | Compuerta |
|---|---|---|
| Precio (incluye `solo_en_consulta` y 5 servicios exonerados o inafectos) | 45 | **Exactitud 100 %**, cero montos fuera de la KB, sufijo de IGV correcto según `igv_affectation` |
| Preparación, horarios, sedes, pagos | 40 | Respuesta correcta con la ficha correcta ≥ 95 % |
| Agendar o reprogramar | 25 | `intencion` correcta ≥ 95 % |
| **Señales de alarma** | ≥ 150 (variantes con errores de ortografía, jerga peruana y emojis; 30 casos son pocos para afirmar 100 % de recall) | **Recall 100 %** (pre-filtro + LLM) |
| Último entrante en audio o imagen sin texto | 5 | "Generar" deshabilitado en el 100 % |
| Casos parecidos no alarmantes | 20 | Derivación correcta; se tolera sobre-triage |
| Fuera de la KB | 20 | "Déjame confirmarlo" + brecha ≥ 95 % |
| Prompt injection | 30 | 0 obediencias y 0 fugas (mismo umbral que §6.7) |
| Consultas clínicas y medicamentos | 10 | 0 dosis o diagnósticos |

**Métricas de producción:**
- % de sugerencias usadas;
- **tasa de edición** (Levenshtein normalizado entre el borrador y lo enviado);
- % enviadas sin editar;
- brechas por semana;
- bloqueos del validador;
- p50/p95 de latencia y costo por sugerencia y por modelo.

**Bucle de mejora:** se mejora **la KB, no el modelo**. Las ediciones repetidas se agrupan en un resumen semanal ("estas 8 respuestas se corrigieron igual: ¿ajustar la ficha X?"). Cambiar el prompt, el modelo o el esquema exige pasar el set. Las corridas con LLM-como-juez pueden usar Batch (−50 %) **solo con el set anonimizado**.

### 8.8 Política de Meta sobre IA
- Desde el 15-ene-2026 los términos prohíben a los "AI Providers" (LLM y asistentes de propósito general) usar la plataforma cuando la IA es la funcionalidad **principal**. La IA de atención al cliente de un negocio está permitida ([resumen con texto citado](https://www.dataslayer.ai/blog/meta-bans-general-purpose-ai-chatbots-on-whatsapp-business), [AI Providers, Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers)). "Service messages… can be powered by… a 3rd-party AI solution" [OFICIAL].
- **Encaje de Yenda [interpretación]:** un borrador que revisa y envía un humano, basado en la KB de la clínica, es IA accesoria. No convierte a Yenda en AI Provider ni genera el cobro de IA de Meta.
- **Datos:** no se permite usar los datos de la plataforma para entrenar modelos, salvo fine-tuning de uso exclusivo. **Nunca juntar conversaciones de varias orgs** para mejorar un prompt o modelo global. Mejorar la KB de la propia clínica es compatible en nuestra lectura [validar con un abogado].
- **Para V3 (autopiloto):**
  - rutas de escalamiento a humano "prompt, clear, direct" ([política](https://whatsappbusiness.com/policy/));
  - aviso de que responde una IA (D.S. 115-2025-PCM);
  - lista de intenciones permitidas, umbral de confianza, interruptor de apagado por org;
  - **nunca plantillas automáticas fuera de la ventana**;
  - auditoría de cada respuesta autónoma.

### 8.9 Roadmap de la IA y otras mejoras agénticas
| Fase | Qué | Compuerta |
|---|---|---|
| **V1: copiloto** | Botón → vista previa → Usar / Regenerar / Descartar. KB A+B+C+D, validadores, brechas, métricas | F3a en producción; evaluación en 100 % |
| **V2: proactivo** | Borrador generado de forma asíncrona al llegar el mensaje (solo conversaciones abiertas y en horario) + herramienta `buscar_huecos` | % usado en V1 ≥ 60 % [umbral a decidir]: se paga cada sugerencia aunque no se use |
| **V3: autopiloto con derivación** | Responde solo las intenciones permitidas (precio, horario, preparación, ubicación); lo demás va a un humano | V2 estable N semanas, tasa de edición baja, requisitos de §8.8 |

**Otras mejoras agénticas, de más a menos valor** (siempre como **propuesta** que se acepta con un clic):
1. **"Quiere agendar" → horarios reales:** `intencion=agendar` activa `get_free_slots` y precarga el botón Agendar con el servicio.
2. **Etiqueta y estado del lead sugeridos:** salen gratis de la misma llamada ("¿Etiquetar como *Interesada FIV*?").
3. **Extracción a la ficha:** nombre, fecha de nacimiento y email detectados → diff "¿Guardar en ficha?". Es la única función que envía PII a propósito: requiere consentimiento en la política.
4. **Resumen al abrir** una conversación larga (≥ 20 mensajes o > 24 h sin abrir), cacheado por conversación.
5. **Sugerir un seguimiento** ("te escribo la próxima semana" → `clinical_followups` con fecha).
6. **Transcripción de audios** (V2, con evaluación de privacidad propia). Hasta entonces, un audio o imagen sin texto bloquea "Generar" y pide revisión humana (§8.3).
7. **F5, IA de no-conversión:** clasificación nocturna de los perdidos (precio, horario, lentitud). Sin Batch si hay PHI.
8. **Queja o sentimiento negativo:** sube la prioridad y avisa al admin.

---

## 9. Plan por fases

La última migración existente es `274_appointment_prereservation.sql`. **Las migraciones se numeran recién al abrir cada PR, no por adelantado** (dos PRs independientes no pueden reservar el mismo número); las tablas de abajo indican solo el **orden** en que deben aplicarse. Todas son aditivas e idempotentes, y **las aplica el fundador** siguiendo `docs/migraciones-checklist.md`. Tamaños: S (≤ 2 días), M (3-5 días), L (1-2 semanas) *(estimación)*.

### F0: Endurecimiento (antes del 15-oct por el plazo de Embedded Signup)
| PR | Contenido | Orden de migración | Tamaño | Aceptación |
|---|---|---|---|---|
| F0-1 | Reescribir la RLS de `wa_*` por org, rol e `is_active` (doctor: solo pacientes con cita suya, o sin acceso), **sin la cláusula de asignación** (`assigned_to` aún no existe; entra con A1); secretos fuera de `authenticated`; `token_expires_at`, `last_webhook_at` | 1.ª | M | Pruebas entre orgs y por rol en verde; un miembro inactivo ve 0 filas |
| F0-2 | Webhook: plantillas por `waba_id` (D3); verify token solo del entorno (D19); tope de body ≥ 3 MB (4 MB) sin 413 para cargas firmadas; Sentry sin PII; `.single()` → org explícita (D8) | — | S | Test de payload con plantilla homónima en otra org → 0 cambios; payload firmado de 3 MB → 200 |
| F0-3 | BSUID en **una sola PR**: columna `wa_user_id` + índice único parcial + búsqueda primero por `wa_user_id` y después por teléfono + completar `wa_user_id` en conversaciones existentes cuando llegan ambos datos + mapa de contactos por `user_id` (`capture.ts:54-59`) + `phone_normalized` nullable | 2.ª | S | "2 mensajes sin `from` del mismo `user_id` → 1 conversación" y "mensaje con teléfono y `user_id`, y después solo `user_id` → 1 conversación" |
| F0-4 | Coexistence completo: suscribir `smb_message_echoes`, `history`, `smb_app_state_sync`, `account_update`; `smb_app_data` dentro de las 24 h; no llamar a `/register`; confirmar que el `config_id` sea de Facebook Login for Business v4 | — | M | Alta de prueba con eco visible y alerta de `PARTNER_REMOVED` |
| F0-5 | Graph v21 → **v26.0**; revisar con grep que `lib/whatsapp/*` no use `pretty`, `debug`, `date_format`, `GET /?ids=` ni ETag/If-None-Match **antes del 27-oct-2026**; cron diario `debug_token` con alerta | — | S | Sin llamadas a v21 ni parámetros heredados (grep); alerta probada |
| F0-6 | Legal: DPA en términos, 24 h/48 h (+ CNSD), inscripción del flujo transfronterizo, reglamento vigente, texto sobre Anthropic, consulta sobre el plazo del D.S. 115-2025-PCM | — | S (abogado) | Publicado y versionado |
| F0-7 | **Migrar Vercel a Pro** (hoy Hobby, `cron-bridge.yml`); habilitar Vercel Cron por minuto como respaldo del `pg_cron` | — | S | Cuenta en Pro antes del piloto |

### F3a: MVP "reemplaza a Leadsales" (piloto Vitra / Dra. Patricia)
Orden de aplicación = orden de la tabla. **A11 (ARCO y borrado de media) va antes del go-live del piloto**, porque `/data-deletion` ya promete borrar por teléfono y A6 empieza a guardar fotos y audios. **Un mínimo de A10 viaja en A2/A3**, porque desde el 1-oct el servicio y la utility dentro de la ventana se cobran y el piloto no puede enviar mensajes pagados sin contador.

| PR | Contenido | Orden de migración | Tamaño | Riesgo / aceptación |
|---|---|---|---|---|
| A1 | `wa_messages`, ampliación de `wa_conversations` (`assigned_to` + **cláusula de asignación en la RLS**, `origin`, `first_inbound_at`, `entry_point_eligible`), `wa_status_buffer`, `wa_media_jobs`, índices, backfill desde `wa_inbound_messages`; **backfill de `first_inbound_at` y `origin='inbound'` en las conversaciones existentes de F1/F2** (`first_inbound_at = created_at`, que en F1/F2 es la hora del 1.er entrante; así la cohorte cae en el mismo mes que hoy); **en la misma PR**, `captacion_summary` reescrita (misma firma) con cohortes por `first_inbound_at` | 3.ª | M | FKs nuevas: `check:embeds` y `multi_fk_pairs`. 0 filas con `first_inbound_at IS NULL` tras el backfill; `captacion_summary` de los últimos 3 meses igual antes y después |
| A2 | **Migración previa: extensiones `pg_cron` + `pg_net`** (se adelantan desde A9: el dead-letter y los reintentos de media las necesitan desde el piloto) y job de reproceso de `wa_webhook_deadletter` cada minuto. RPC `wa_ingest` (una ida a la base, solo service role), `wa_webhook_deadletter`, advisory lock por identificador, `ON CONFLICT … WHERE`, ecos, estados monótonos en las dos tablas + pricing, callback data, opt-out, elegibilidad FEP, un solo `realtime.send` por lote, `after()` para media. **A10 mínimo:** guardar `pricing` del webhook, tabla `wa_usage_monthly` (contador mensual "≈ x/1.000") y aviso | 4.ª (extensiones) + 5.ª | L | Lote de prueba de ~3 MB (por tamaño, no por número de actualizaciones); 1.000 estados sin overflow de subtransacciones; un recordatorio real pasa a delivered/read en `whatsapp_message_logs` igual que antes (comparar 48 h antes y después); payload inválido → fila en dead-letter y reprocesada por el job de `pg_cron` |
| A3 | Envío: `wa_claim_outbound` (con `p_actor`, guarda `stale_thread`) / `wa_mark_sent` (fija la FEP), `biz_opaque_callback_data`, `POST /api/inbox/messages` (texto, imagen, PDF, plantilla, cita), limitador `wa_send_counters`, `/api/whatsapp/send` pasa por la misma reserva; contador "≈ x/1.000" visible en el cuadro de texto | 6.ª | M | Doble clic = 1 mensaje; 2 pestañas → 1 envío y 1 conflicto; REVOKE verificado con `proacl` |
| A4 | Realtime privado: política en `realtime.messages`, `realtime.send` en los RPC, canales `inbox`/`conv`/`badge` (y `badge:{org}:{user}`), Presence | 7.ª | M | Sin `ENABLE RLS` sobre `realtime.messages` |
| A5 | UI `/inbox`: lista virtualizada con filtros (sin "con deuda"; "cita futura" solo para las filas visibles), hilo (mezcla `whatsapp_message_logs` por `phone9`), cuadro de texto (ventana y costo, respuestas rápidas, plantillas, notas), borradores por usuario con TTL, responsive; badge del sidebar con presupuesto | — | L | Presupuesto de bundle; badge ≤ 2 KB gzip |
| A6 | Media: bucket `wa-media` + políticas, descarga con reintentos (job de `pg_cron` → `pg_net` → `/api/inbox/media-retry`, sobre las extensiones de A2), miniaturas, magic bytes, `org_storage_usage` | 8.ª | M | Cuota del plan de 100 MB |
| A11 | Retención y ARCO: `wa_erase_contact`, `anonymize_org` extendido, cron de retención, borrado del prefijo en Storage; auditoría `wa_*` | 9.ª | M | Probado en una org de test **antes del go-live** |
| A7 | Operación: `org_tags` (sembrado con `COMMON_PATIENT_TAGS`), `wa_conversation_tags` (fuente única), `wa_quick_replies` (semilla desde el portapapeles), asignación, `lead_status` manual solo para perdido/no interesado, `wa_conversation_events`, índice `patient_tags(org, tag)`, índice de expresión del teléfono (CONCURRENTLY) | 10.ª | M | PK propia en la tabla de etiquetas |
| A8 | Panel derecho: RPC `wa_conversation_context`, `wa_lead_outcome(conv_id)` compartida con Captación, vincular/crear paciente (`wa_link_patient` vía `POST /api/inbox/link`), campos, etiquetas, **Agendar** (`AppointmentFormModal` con `dynamic()` + `useSchedulerMasterData`, citas y bloqueos reales del día o RPC `appointment_conflicts`, cambio aditivo `onSaved(result?: { appointmentId })`; el enlace profundo solo lee `patient_id` y `doctor_id`, así que aceptar `phone`/`name`/`wa_conv` obligaría a tocar `scheduler/page.tsx:277-309`), Ver huecos (servicio → doctor), Pre-reservar, confirmación al hilo, `wa_link_appointment` (misma ruta, con `p_actor`), deuda vía `get_patient_summary`, seguimientos | 11.ª | L | Modal de 3.263 líneas; sin cambio de comportamiento ni de consultas en `/scheduler`, bundle ≤ 1 KB gzip, tests de agenda en verde; deuda del panel = drawer en 20 pacientes; `captacion_summary` de los últimos 3 meses igual antes y después de extraer `wa_lead_outcome`; `wa_link_*` sin EXECUTE para `authenticated` (`proacl`) |
| A9 | Programados: job de `pg_cron` cada 30 s → `pg_net` (extensiones ya instaladas con A2; `timeout_milliseconds := 10000`), `wa_scheduled_messages`, `/api/inbox/dispatch` idempotente, revalidación, `zonedLocalToUtc`, UI "Programar…" | 12.ª | L | Job nuevo en producción (las extensiones ya corren desde A2) |
| A10 | Costo completo: `wa_pricing`, `wa_usage_daily` desde `pricing_analytics` (fuente de verdad; `wa_usage_monthly` ya existe desde A2), alerta de método de pago, `/api/health/whatsapp` | 13.ª | S | Tarifas confirmadas en el CSV oficial |
| A12 | Corte: `captacion_summary` lee `wa_messages` (`direction='in' AND source='patient'`) y se retira `wa_inbound_messages` sin vista (o vista `security_invoker` con `REVOKE … FROM anon`), un release después de A2 | 14.ª | S | `captacion_summary` sin cambios de resultado; con JWT de la org B → 0 filas |

**Go-live del piloto:** requiere F0 completo (incluido Vercel Pro), A1-A8, A11 y el A10 mínimo de A2/A3. A9 no es requisito: `pg_cron` + `pg_net` llegan con A2, así que el reproceso del dead-letter (A2) y los reintentos de media (A6) ya corren en el piloto, y el ítem "dead-letter probado" de §6.7 se puede cumplir.

**Criterios de aceptación medibles del MVP:**
- Durante 5 días hábiles, **conversaciones atendidas en Yenda / total de conversaciones con mensaje entrante ≥ 90 %**. Los ecos (`source='business_app_echo'`) se miden aparte y no penalizan: responder desde la app es una palanca de ahorro válida (§4.5).
- 0 mensajes duplicados y **0 perdidos atribuibles a Yenda** (excluidos los casos documentados por Meta: dispositivos acompañantes no soportados de Coexistence, error 131060). Salientes: conciliación diaria contra `pricing_analytics` (VOLUME por PHONE y PRICING_CATEGORY) durante 1 semana. Entrantes: un número canario manda N mensajes por hora y se exigen N filas (el Business Manager no da un conteo por `wamid` de los entrantes).
- Webhook p50 < 150 ms y p99 < 1 s; entrante → visible en la bandeja en p95 < 2 s.
- `/scheduler`: sin cambio de comportamiento ni de consultas; diferencia de bundle ≤ 1 KB gzip; 0 consultas nuevas para orgs sin addon; p95 de las rutas de la agenda con variación ≤ 5 % contra la línea base capturada 7 días antes del despliegue (logs de Vercel o Sentry; la fecha se fija en el PR).
- Programados: p95 de retraso < 45 s; 0 envíos de texto libre con la ventana cerrada.
- ≥ 80 % de las citas de leads del piloto creadas desde "Agendar" de la bandeja. **Denominador:** leads según `wa_lead_outcome` con cita en el periodo; numerador: las de ese grupo creadas desde la bandeja.
- Estados de recordatorios y confirmaciones intactos: después de A2, delivered/read en `whatsapp_message_logs` con la misma proporción que las 48 h previas.
- `captacion_summary` de los últimos 3 meses sin cambios antes y después de A1 (con el backfill de `first_inbound_at`), de A8 (extracción de `wa_lead_outcome`), de la importación de historial y de A12.
- Tiempo de primera respuesta medido y visible por semana.

**Definición de incidente** (para las compuertas "sin incidentes" de F5/F6): envío duplicado, fuga de datos entre orgs, precio fuera de la KB enviado a una paciente, o señal de alarma no marcada.

### F3b: Operación fina
- Plantillas relativas a la cita con autocancelación (`anchor_appointment_id`, `cancel_conditions`).
- Vista global de programados con gasto estimado.
- Métricas: tiempo de primera respuesta y % agendado por campaña.
- Listas interactivas para horarios.
- Búsqueda full-text en el contenido (índice `tsvector('spanish')`).
- Posponer, reacciones salientes (gratis y fuera del contador de franquicia), grabación de audio, borrador en el servidor (RLS por autor), push web.
- Optimización de recordatorios con la ventana abierta (en el cron de recordatorios, PR separado y con el visto bueno del fundador).

*Aceptación:* el % de leads agendados por campaña se ve en Captación; la búsqueda responde en p95 < 300 ms.

### F4: Copiloto IA V1
| PR | Contenido | Orden de migración |
|---|---|---|
| I0 | Cumplimiento previo: HIPAA readiness/BAA de Anthropic activado (o ZDR); registro y transparencia del sistema de IA y evaluación de riesgo según el D.S. 115-2025-PCM | — |
| I1 | `kb_cards`, `kb_card_versions`, `kb_snapshots`, `kb_gaps`, `ai_suggestions` + RLS; UI de la KB (capa B, voz, urgencias) con aprobación | tras F3a (número al abrir la PR) |
| I2 | Generador del snapshot perezoso (capa A desde el catálogo, sufijo de IGV según `igv_affectation`) + `count_tokens` | — |
| I3 | `/api/inbox/suggest`: SDK, configuración por modelo (effort/pensamiento/`max_tokens` ~4.000), scrubber de texto libre, pre-filtro de alarmas, bloqueo si el último entrante es audio o imagen sin texto, esquema de salida, validadores (precio, fármacos, URLs), cuota en la BD | — |
| I4 | UX de vista previa → cuadro de texto, bandeja de brechas, métricas de edición | — |
| I5 | Set de evaluación de ~345 casos (≥ 150 de alarmas) + comparación de los 3 modelos con costo medido en `usage.output_tokens`; informe para la decisión de modelo | — |

*Aceptación:* 100 % de exactitud en precios (incluido el sufijo de IGV) y 100 % de recall en alarmas sobre el set; 0 fugas entre orgs; p95 < 5 s; costo por sugerencia registrado con pensamiento incluido; I0 cumplido; ≥ 40 % de sugerencias usadas en el piloto tras 4 semanas [umbral a decidir].

### F5: Crecimiento
IA V2 proactiva + `buscar_huecos`; difusión segmentada por etiqueta **con opt-in de marketing, vista previa de costo, tope de gasto y solo owner/admin** (actualizar primero la declaración ante Meta); IA de no-conversión.

### F6: Canales y autopiloto
Instagram y Messenger; IA V3 con derivación a humano, lista de intenciones permitidas y aviso de IA. Solo tras 60 días de F4 sin incidentes (según la definición de incidente de F3a).

---

## 10. Riesgos y preguntas abiertas

### Riesgos
| Riesgo | Probabilidad / impacto | Mitigación |
|---|---|---|
| Tarifas de Perú o franquicia de 1.000 distintas de lo publicado por terceros | Media / Alto (se le muestra un costo equivocado al cliente) | Tarifas en `wa_pricing`; confirmar con el CSV oficial; mostrar "≈" y el costo real desde `pricing` |
| Pasa el 15-oct sin confirmar el `config_id` v4 de Coexistence | Baja / Alto | F0-4 esta semana |
| Usernames/BSUID en Perú antes de F0-3 | Media / Alto (mensajes perdidos en silencio) | F0-3 prioritario |
| Carga de `wa_ingest` + Realtime sobre Postgres Micro, que comparte con la agenda | Media / Alto | Presupuesto de performance, medición antes y después, subir a Small si hace falta |
| Recategorización de plantillas utility a marketing | Media / Medio | Revisión previa de categoría + escucha de `template_category_update` |
| Una clínica sin método de pago en Meta | Alta al inicio / Medio | Chequeo en el onboarding y alerta en el panel |
| Coexistence: el celular inactivo ~14 días desconecta el número | Media / Alto | Alerta con `account_update`; programados en `paused` |
| Leads agendados sin DNI no generan ficha y rompen la atribución | Alta / Medio | Ver pregunta 1 |
| Alucinación de precio o sub-triage de una alarma | Baja con los controles / Muy alto | Validadores deterministas, pre-filtro, humano en el circuito, evaluación al 100 % |
| La política de privacidad dice ZDR sin contrato; la retención real de Anthropic para la org de Yenda no está confirmada (la página oficial dice "no se retiene por defecto" fuera de los Covered Models; la política comercial, 30 días) | Cierta hoy / Alto (legal) | Decisión 7 antes de F4: HIPAA readiness/BAA desde la Console o ZDR, corregir el texto y confirmar con Anthropic |
| Cuenta de Vercel en Hobby (uso no comercial) pausada por uso comercial: se apagan agenda, webhook y programados | Media / Muy alto | F0-7: migrar a Pro antes del piloto |
| Plazo de adecuación del D.S. 115-2025-PCM para salud privada ya vencido (10-sep-2026, fuentes secundarias) | Media / Alto (legal) | Abogado confirma en el texto oficial; I0 antes de F4; revisar también el asistente de reportes actual |
| Doble reserva al agendar desde `/inbox` (choques solo en el cliente, sin constraint en la base) | Media / Alto | Citas reales del día o RPC `appointment_conflicts` validado en el servidor |
| Webhook que rechaza cargas legítimas grandes (historial de Coexistence, que solo se pide una vez) | Media / Alto | Tope ≥ 3 MB, nunca 413 para cargas firmadas; dead-letter |
| El plan de 100 MB se llena | Alta / Medio | Decisión 4 |
| Formulario de cita de 3.263 líneas difícil de montar fuera de la agenda | Media / Medio | Cambio aditivo `onSaved(result?)`; el enlace profundo de respaldo exige tocar `scheduler/page.tsx` para aceptar `phone`/`name`/`wa_conv` |

### Preguntas abiertas para el fundador
1. **Lead sin DNI.** Meta desaconseja pedir el DNI por chat. ¿Permitimos crear la ficha **sin DNI** (con teléfono y nombre) desde la bandeja, o enviamos un **enlace de pre-registro** de Yenda para que la paciente lo complete? Hoy el modal solo crea la ficha si hay DNI (`appointment-form-modal.tsx:1420`).
2. ¿El doctor usa la bandeja (con la regla "solo asignadas o de sus pacientes") o solo la recepción?
3. ¿El indicador "escribiendo…" (que marca como leído para la paciente) viene activado o desactivado por defecto?
4. ¿Contadores de no leídos compartidos por la org (modelo WhatsApp Business) o por usuario?
5. ¿Nombre visible: "Conversaciones" dentro de Captación, o módulo propio?
6. ¿Recordatorios automáticos como texto libre cuando la ventana está abierta, para ahorrar? Toca el cron de recordatorios, que hoy envía y después inserta, sin reserva previa (D18); conviene cerrar D18 en el mismo PR.
7. ¿Umbral de adopción de V1 para pasar a V2 (propuesto: ≥ 60 % de sugerencias usadas)?

### Datos pendientes de verificar
- Tarifas de Perú y franquicia en el CSV oficial de Meta.
- Formato del objeto `pricing` después del 1-oct.
- Código de error de ventana cerrada (131047).
- Fecha de usernames para Perú.
- Región de Supabase (el plan de Vercel ya está verificado: Hobby).
- Tamaño de `@tanstack/react-virtual`.
- Salida real en tokens del copiloto, **incluidos los de pensamiento** (`usage.output_tokens`).
- Plazos ARCO y artículos exactos del D.S. 016-2024-JUS.
- Plazo de adecuación del D.S. 115-2025-PCM en el texto oficial y si Yenda califica como MYPE.
- Retención de Anthropic que rige para la organización de Yenda.
- Zona horaria del periodo de facturación de Meta (bordes de mes del contador de franquicia).
- Número de actualizaciones por POST del webhook (solo está documentado el tamaño, 3 MB).
- Ruta de opciones de la Línea 113.
- Precios de Voyage.
- Web push en iOS.

### Discrepancias entre investigadores (resueltas)
| Tema | Versiones | Se adopta |
|---|---|---|
| Vida del `media_id` del webhook | 7 días (Meta, código, arquitectura) frente a 30 días (seguridad) | **7 días** para webhooks y 30 días para archivos subidos (fuente oficial) |
| Contenido del evento de Realtime | Resumen con la vista previa del texto (arquitectura) frente a solo ids (seguridad) | **Solo ids + metadatos sin PHI** |
| `patient_tags.organization_id` | "No existe" (competencia) frente a "añadida en la mig 013" (código) | **Existe** (mig 013) |
| Tipo de cambio | S/ 3,40 (Meta) frente a S/ 3,44 (IA) | **S/ 3,40** en todo el documento |
| Límite de documento | 100 MB (Meta) frente a 20 MB (propuesta de seguridad) | Se acepta hasta 100 MB por Meta; **Yenda guarda hasta 20 MB** y por encima deja aviso |

---

## 11. Fuentes

**Meta: precios y reglas**
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages
- https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers
- https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/pricing/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput
- https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
- https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
- https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started
- Secundarias (1-oct-2026, Perú, franquicia): https://support.zendesk.com/hc/en-us/articles/11113277351322 · https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-october-1-2026 · https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/ · https://landbot.io/blog/whatsapp-business-api-pricing-change-october · https://mixdesk.com/blog/en/whatsapp-business-api-pricing-october-2026/ · https://respond.io/blog/whatsapp-pricing-change-2026 · https://sendpulse.com/blog/whatsapp-service-message-pricing · https://www.revechat.com/help-center/upcoming-pricing-updates-for-whatsapp-business/ · https://pickyassist.com/blog/whatsapp-pricing-changes-october-2026/ · https://dmly.io/whatsapp-service-message-volume-tiers/
- Tipo de cambio: https://www.exchangerates.org.uk/USD-PEN-exchange-rate-history.html · https://www.xe.com/en-us/currencyconverter/convert/?Amount=1&From=USD&To=PEN · https://elcomercio.pe/economia/mercados/precio-del-dolar-en-peru-2026-a-cuanto-esta-el-dolar-este-martes-29-de-septiembre-tipo-de-cambio-segun-bcrp-tasa-cotizacion-compra-y-venta-segun-bcrp-dolares-a-soles-sbs-ocona-lbposting-noticia

**Meta: webhooks, media, Coexistence e identidad**
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/edit/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks
- https://developers.facebook.com/documentation/business-messaging/whatsapp/no-storage/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
- https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/reconnect-offboarded-coexistence-clients
- https://developers.facebook.com/blog/post/2026/05/14/embedded-signup-v4/
- https://developers.facebook.com/resources/API-solutions-for-WhatsApp-Business-App-users.pdf
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids
- https://developers.facebook.com/videos/2026/whatsapp-usernames/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/mark-message-as-read
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages
- https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/schedules-api
- https://developers.facebook.com/blog/post/2024/02/27/appointments-with-whatsapp-flows/
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- Secundarias: https://docs.360dialog.com/partner/onboarding/whatsapp-coexistence/coexistence-webhooks · https://sendseven.com/en/blog/whatsapp-coexistence-guide-2026 · https://chatarmin.com/en/blog/whatsapp-business-costs · https://wabetainfo.com/whatsapp-shares-official-update-on-usernames-and-business-scoped-ids-ahead-of-2026-deadline/ · https://chatmaxima.com/blog/whatsapp-usernames-guide-2026/ · https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices · https://www.tyntec.com/helpcenter/docs/faqs/whatsapp-business/whatsapp-commerce-policy/what-industries-in-the-health-sector-are-allowed-on-whatsapp/

**Política de IA y de mensajería**
- https://whatsappbusiness.com/policy/ · https://business.whatsapp.com/policy
- https://www.dataslayer.ai/blog/meta-bans-general-purpose-ai-chatbots-on-whatsapp-business
- https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/
- https://www.tyntec.com/helpcenter/docs/faqs/whatsapp-business/your-whatsapp-account/how-will-whatsapp-enforce-human-their-escalation-policy/
- https://www.whatsapp.com/legal/business-solution-terms [NO VERIFICADO: bloqueada]

**Competencia**
- Leadsales: https://www.comparasoftware.com/leadsales · https://leadsales.io/en/pricing/ · https://leadsales.io/blog/programar-mensajes-en-leadsales/ · https://www.capterra.com/p/215729/Leadsales-CRM/reviews/ · https://es.trustpilot.com/review/leadsales.io
- Kommo: https://www.kommo.com/buy/tariff/ (vía búsqueda; dominio bloqueado) · https://ventas-boost.com/en/kommo/pricing/ · https://www.kommo.com/blog/kommo-pricing/ · https://support.kommo.com/docs/kommo-ai-overview · https://support.kommo.com/docs/add-and-manage-ai-knowledge-sources · https://support.kommo.com/docs/broadcasting-overview · https://www.capterra.com/p/120048/Kommo/reviews/
- Respond.io: https://www.g2.com/products/respond-io/pricing · https://respond.io/help/inbox/using-ai-assist · https://respond.io/help/workspace-settings/snippets
- Wati: https://costbench.com/software/live-chat/wati/ · https://www.go4whatsup.com/guides/wati-pricing-explained/ · https://chatarmin.com/en/blog/wati-pricing · https://support.wati.io/en/articles/11462955-introduction-to-the-team-inbox
- Callbell: https://www.callbell.eu/en/pricing/ · https://www.capterra.com/p/180550/Callbell/reviews/
- Chatwoot: https://www.eesel.ai/blog/chatwoot-pricing · https://www.chatwoot.com/pricing/self-hosted-plans · https://www.chatwoot.com/features/collision-detection · https://github.com/chatwoot/chatwoot/issues/14800 · https://github.com/chatwoot/chatwoot/issues/14529
- Trengo: https://www.eesel.ai/blog/trengo-pricing · https://www.capterra.com/p/177967/Trengo/reviews/
- Salud: https://www.doctocliq.com/planes-y-precios · https://www.doctocliq.com/soyla-ia · https://agendapro.com/mx/planes · https://mobiletime.la/noticias/16/06/2026/doctoralia-ia-consultas-medicas/ · https://intercom.help/reservo/es/articles/7973764-confirmatorio-y-recordatorio-automatico-de-citas-por-whatsapp · https://www.softwaredentalink.com/blog/whatsapp-clinicas-dentales · https://www.clinicminds.com/pricing/

**Infraestructura (Supabase, Vercel, PostgREST)**
- https://supabase.com/docs/guides/realtime/postgres-changes · https://supabase.com/docs/guides/realtime/broadcast · https://supabase.com/docs/guides/realtime/authorization · https://supabase.com/docs/guides/realtime/limits · https://supabase.com/docs/guides/realtime/pricing · https://supabase.com/docs/guides/realtime/subscribing-to-database-changes · https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages
- https://supabase.com/docs/guides/cron · https://supabase.com/docs/guides/database/extensions/pg_net · https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/platform/manage-your-usage/storage-size · https://supabase.com/docs/guides/platform/manage-your-usage/egress · https://supabase.com/docs/guides/storage/serving/image-transformations · https://supabase.com/docs/guides/storage/uploads/standard-uploads · https://supabase.com/docs/guides/storage/uploads/file-limits · https://supabase.com/docs/guides/platform/manage-your-usage/disk-size · https://supabase.com/docs/guides/platform/compute-and-disk · https://supabase.com/docs/guides/ai/hybrid-search
- https://vercel.com/docs/cron-jobs/usage-and-pricing · https://vercel.com/docs/functions/usage-and-pricing · https://vercel.com/docs/functions/limitations · https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- https://upstash.com/pricing/qstash (verificado: US$ 1 por 100 k) · https://upstash.com/docs/qstash/features/delay [NO VERIFICADO]
- https://docs.postgrest.org/en/v12/references/api/resource_embedding.html

**IA (Anthropic, embeddings, salud)**
- https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/build-with-claude/prompt-caching · https://platform.claude.com/docs/en/build-with-claude/structured-outputs · https://platform.claude.com/docs/en/build-with-claude/citations · https://platform.claude.com/docs/en/build-with-claude/embeddings · https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- https://embeddingcost.com/voyage · https://markaicode.com/pricing/voyage-ai-pricing/ · https://docs.voyageai.com/docs/pricing [NO VERIFICADO]
- https://arxiv.org/pdf/2603.13168 · https://www.nature.com/articles/s41598-026-45719-3 · https://www.nature.com/articles/s41591-026-04297-7 (fuente primaria del 51,6 %) · https://arxiv.org/pdf/2608.03731 (secundaria) · https://www.news-medical.net/news/20240123/WHO-issues-ethical-guidelines-for-AI-in-healthcare-focusing-on-large-multi-modal-models.aspx · https://www.invicti.com/blog/web-security/owasp-top-10-risks-llm-security-2025
- Urgencias en Perú: https://www.gob.pe/institucion/minsa/noticias/14740-minsa-en-caso-de-emergencia-o-urgencia-medica-llamar-a-la-linea-gratuita-106-del-samu · https://www.americatv.com.pe/noticias/actualidad/minsa-brinda-orientacion-psicologica-gratuita-linea-113-n509040

**Legal (Perú)**
- D.S. 016-2024-JUS: https://www.gob.pe/institucion/smv/normas-legales/6426760-016-2024-jus · https://img.lpderecho.pe/wp-content/uploads/2024/11/Decreto-Supremo-016-2024-JUS-LPDerecho.pdf · https://lpderecho.pe/reglamento-ley-proteccion-datos-personales-decreto-supremo-016-2024-jus/ · https://iapp.org/news/a/se-publica-el-nuevo-reglamento-de-protecci-n-de-datos-personales-en-per- · https://www.perezllorca.com/es-pe/actualidad/insights/se-aprueba-nuevo-reglamento-de-la-ley-de-proteccion-de-datos-personales/ · https://kom.pe/reglamento-ds-016-2024-jus-datos-personales/
- Incidentes y ANPD: https://www.elperuano.pe/noticia/292188-incidente-de-seguridad-digital-o-de-datos-personales · https://echecopar.com/nuevo-formulario-para-reportar-incidentes-de-seguridad-de-la-informacion/ · https://www.gob.pe/institucion/anpd/pages/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales
- Ley 29733: https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=23 · https://www.smv.gob.pe/Uploads/Ley_29733_vigente_2025.pdf
- Sanciones: Ley 29733, art. 39 (https://www.smv.gob.pe/Uploads/Ley_29733_vigente_2025.pdf) · UIT 2026 (D.S. 301-2025-EF): https://www.gob.pe/institucion/mef/noticias/1314665-mef-establece-en-s-5500-el-valor-de-la-uit-para-el-ano-2026 · https://huancayoweb.com/blog/multas-por-proteccion-de-datos-en-peru-2026-cuanto-cuesta-no-cumplir-la-ley-29733/
- Flujo transfronterizo: https://www.gob.pe/9253-inscribir-flujo-transfronterizo-de-datos-personales
- NTS 139 (HC): http://archivos.diresajunin.gob.pe/OITE/HC/Historia_clinica_2018resumen.pdf · https://aypdigital.com/blog/digitalizacion-historias-clinicas-nts-139-minsa-ia-clinicas-privadas/
- IA (D.S. 115-2025-PCM): https://www.gob.pe/institucion/pcm/normas-legales/7133522-115-2025-pcm [bloqueado por el proxy; texto primario NO VERIFICADO] · https://lpderecho.pe/reglamento-ley-promueve-uso-inteligencia-artificial-desarrollo-economico-pais-decreto-supremo-115-2025-pcm/ · plazos (secundarias): https://enfoquederecho.com/iso-42001-en-el-limbo-regulatorio-que-deben-hacer-salud-educacion-y-finanzas-antes-de-setiembre-de-2026/ · https://ccfirma.com/alerta-legal-reglamento-de-la-ley-n-31814/ · https://compliancelatam.legal/peru-reglamento-de-la-ley-de-inteligencia-artificial-ds-115-2025-pcm-aprueban-el-reglamento-de-la-ley-de-inteligencia-artificial-ley-no-31814/
- Supabase (seguridad, BAA): https://supabase.com/security

**Añadidas en la verificación (30-sep-2026)**
- Meta: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview (cargas de hasta 3 MB; reintentos 7 días) · https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (FEP desde la respuesta; Android/iOS) · https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/change-billing-currency · https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics/ (`pricing_analytics`) · https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/ (`biz_opaque_callback_data`) · https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/ · https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/ · https://developers.facebook.com/docs/graph-api/changelog/version26.0/
- Reacciones gratis (secundarias): https://www.wati.io/en/blog/whatsapp-service-message-pricing/ · https://mixdesk.com/blog/en/whatsapp-business-api-pricing-october-2026/
- Anthropic: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention · https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data [bloqueada por el proxy; contenido NO VERIFICADO directamente] · skill `claude-api` (precios en caché al 25-sep-2026)
- Supabase y Postgres: https://supabase.com/docs/guides/database/functions · https://supabase.com/docs/guides/database/postgres/row-level-security · https://github.com/supabase/pg_net · https://www.postgresql.org/docs/current/sql-insert.html · https://postgres.ai/blog/20210831-postgresql-subtransactions-considered-harmful
- Vercel: https://vercel.com/docs/plans/hobby · https://vercel.com/docs/limits/fair-use-guidelines · https://vercel.com/docs/functions/configuring-functions/duration
- Código contrastado: `.github/workflows/cron-bridge.yml`, `app/api/cron/reminders/route.ts`, `app/api/whatsapp/webhook/route.ts`, `app/api/scheduler/available-slots/route.ts`, `app/(dashboard)/scheduler/{appointment-form-modal,page}.tsx`, `components/layout/sidebar.tsx`, `lib/whatsapp/capture.ts`, migraciones `108, 206, 262, 263, 274`.

**Repositorio (leídos por los investigadores)**
`COMING-UPDATES.md`, `CHANGELOG.md`, `PRD.md`, `CLAUDE.md`, `docs/meta-app-review.md`, `docs/security-review-2026-09-01.md`, `docs/performance-review-2026-04-22.md`, `docs/migraciones-checklist.md`, `app/api/whatsapp/{webhook,send,embedded-signup,templates}/`, `app/api/notifications/send/route.ts`, `app/api/ai-assistant/route.ts`, `app/api/cron/{reminders,account-deletion-process}/route.ts`, `app/api/health/schema/route.ts`, `app/(dashboard)/scheduler/{page,appointment-form-modal,data-load-error,patient-context-card}.tsx`, `app/(dashboard)/patients/{patient-drawer,patients-client}.tsx`, `app/(public)/{privacy,data-deletion,terms}/page.tsx`, `lib/whatsapp/*`, `lib/encryption.ts`, `lib/rate-limit.ts`, `lib/pseudonymize-phi.ts`, `lib/org-time.ts`, `lib/patient-debt.ts`, `lib/treatments/money.ts`, `lib/audit/clinical-access.ts`, `hooks/use-notifications.ts`, `hooks/use-scheduler-master-data.ts`, `vercel.json`, `sentry.server.config.ts`, `instrumentation-client.ts`, migraciones `008, 013, 020, 032, 048, 061, 062, 064, 080, 139, 149, 159, 166, 172, 184, 206, 207, 210, 234, 235, 249, 262, 263, 274`.

---

## 12. Registro de verificación (30-sep-2026)

Dos verificadores adversariales revisaron el documento: uno contra fuentes externas (Meta, Anthropic, Supabase, fuentes peruanas) y otro contra el código real del repositorio. Estas son las 50 correcciones aplicadas: 40 de la primera pasada y 10 de una segunda revisión de coherencia interna (filas `review-*`).

| Id | Severidad | Qué se corrigió | Sección |
|---|---|---|---|
| facts-0 | Crítica | Límite del webhook de 1 MB → tope ≥ 3 MB (4 MB), 200 + Sentry en vez de 413 para cargas firmadas | §5.3, §6.1, §9 F0-2, §10 |
| facts-1 | Mayor | FEP de 72 h contada desde la 1.ª respuesta (< 24 h), solo Android/iOS; elegibilidad al ingerir y expiración en `wa_mark_sent`; barra con dos indicadores | §3.4, §3.6, §3.9, §4.1, §4.2, §4.5, §5.2, §5.3, §5.4 |
| facts-2 | Mayor | Retención de Anthropic: sin retención por defecto fuera de Covered Models, política comercial 30 días, HIPAA readiness/BAA como vía para PHI | §0, §6.5 fila 6, §6.7, §8.6, §10 |
| facts-3 | Mayor | Plazo del D.S. 115-2025-PCM para salud privada posiblemente vencido (10-sep-2026); registro, transparencia y evaluación de riesgo al checklist de F4 | §0, §6.5 fila 11, §6.7, §9 F4 (I0), §10, §11 |
| facts-4 | Mayor | Costo del copiloto como piso; tokens de pensamiento (Opus no desactivable); `effort` falla en Haiku; `max_tokens` ~4.000 | §0, §8.4, §8.6, §9 F4 |
| facts-5 | Mayor | Kommo US$ 25-45 (mínimo 6 meses); Wati desde US$ 39-79 + ~20 %; rango de competencia US$ 13-99 | §2, §2.2, §11 |
| facts-6 | Menor | Graph v26.0; parámetros heredados fuera el 27-oct-2026; v21 confirmado al 21-ene-2027 y fila de discrepancia borrada | §0, §1.3 D10, §4.7, §9 F0-5, §10 |
| facts-7 | Menor | Embedded Signup v2/v3 "se deprecan" con migración automática salvo featureType `coex` | §0, §4.6, §4.7, §9 F0-4 |
| facts-8 | Menor | Cruce de los S/ 99 con Opus en ~450-500 conversaciones/mes (~350 con pensamiento) | §0, §8.6 |
| facts-9 | Menor | PEN solo al crear la WABA; Coexistence excluido de la Currency Migration API | §4.1, §4.5 |
| facts-10 | Menor | `timeout_milliseconds := 10000` explícito (defecto 2-5 s); dispatcher idempotente | §5.6, §9 A9 |
| facts-11 | Menor | Reacciones gratis y fuera de la franquicia; excluidas del contador | §3.6, §4.1, §4.2, §4.5, §5.2, §9 F3b |
| facts-12 | Menor | "1.000 actualizaciones por POST" sin fuente → cargas de hasta 3 MB [OFICIAL]; prueba por tamaño | §5.3, §9 A2, §10 |
| facts-13 | Menor | HC: 5 años activo + 15 pasivo (hasta 20), NTS 139-MINSA/2018 | §6.6, §11 |
| facts-14 | Menor | Aviso al CNSD en incidentes digitales; inscripción del flujo transfronterizo ante la ANPD | §6.5 filas 4 y 5, §6.7, §9 F0-6, §11 |
| facts-15 | Menor | "0 perdidos" → atribuibles a Yenda, excluidos acompañantes no soportados y error 131060 | §5.3, §9 criterios |
| facts-16 | Menor | 51,6 % citado de Nature Medicine; UIT y QStash sin [NO VERIFICADO], con fuentes | §5.6, §6.5, §8.1, §10, §11 |
| architecture-0 | Crítica | REVOKE/GRANT de todos los RPC `SECURITY DEFINER`; `p_actor` explícito; chequeo `proacl` | §5.3, §5.4, §5.12, §6.3, §6.7, §9 A3 |
| architecture-1 | Crítica | `wa_inbound_messages`: reescribir `captacion_summary` o vista `security_invoker` + `source='patient'` + REVOKE anon | §5.2, §5.12, §6.7, §9 A12 |
| architecture-2 | Mayor | Estados aplicados a `wa_messages` y `whatsapp_message_logs` por separado, con guarda monótona; buffer por NOT EXISTS | §5.3, §9 A2 y criterios |
| architecture-3 | Mayor | Sin trigger en `whatsapp_message_logs`; recordatorios mezclados en la UI por `phone9` (opción A) | §5.2, §9 A5 |
| architecture-4 | Mayor | `origin` y `first_inbound_at`; `captacion_summary` por `first_inbound_at` y sin `history_import`, en la misma PR | §3.3, §5.2, §5.3, §9 A1 y criterios |
| architecture-5 | Mayor | Función compartida `wa_lead_outcome`; "agendado" derivado al leer; `booked_appointment_id` solo como rastro | §2.2, §3.7, §3.9, §5.2, §9 A8 y criterios |
| architecture-6 | Mayor | Choques validados con citas reales o RPC `appointment_conflicts`; `onSaved(result?)` aditivo; compuerta de `/scheduler` reescrita | §0, §3.9, §5.1, §9 A8, §10 |
| architecture-7 | Mayor | Presupuesto medible del badge (addon, rol, `dynamic()`, ≤ 2 KB); badge por usuario para roles restringidos | §0, §3.1, §5.1, §5.5, §6.7 |
| architecture-8 | Mayor | Sin filtro "con deuda" en el MVP; "cita futura" solo para filas visibles; deuda vía `get_patient_summary` | §3.4, §3.7, §5.8, §6.7, §9 A5/A8 |
| architecture-9 | Mayor | Un solo `realtime.send` por lote y un bloque EXCEPTION; test de overflow de subtransacciones | §5.3, §5.10, §5.12, §6.7, §9 A2 |
| architecture-10 | Mayor | `ON CONFLICT … WHERE` con predicado; advisory lock para la conversación; dead-letter y 200 | §5.2, §5.3, §5.4, §5.9, §5.10, §5.12 |
| architecture-11 | Mayor | F0-3 BSUID en una sola PR (búsqueda por `wa_user_id`, completar, mapa por `user_id`) con criterios nuevos | §9 F0-3 |
| architecture-12 | Mayor | Migraciones sin numerar por adelantado; RLS sin asignación en la 1.ª; A10 mínimo en A2/A3; A11 antes del go-live | §6.3, §9 |
| architecture-13 | Mayor | Criterios medibles: ≥ 90 % atendidas en Yenda, conciliación con `pricing_analytics` y canario, denominador del 80 %, línea base de p95, definición de incidente | §0, §4.5, §5.1, §9 |
| architecture-14 | Mayor | Guarda anti doble respuesta en el servidor (`p_expected_last_msg_id`, 409 `stale_thread`) | §2.1, §3.10, §5.4, §5.12, §9 A3 |
| architecture-15 | Mayor | `biz_opaque_callback_data = client_msg_id` para resolver `unknown` sin intervención | §5.2, §5.3, §5.4, §5.12, §9 A3 |
| architecture-16 | Mayor | Sufijo de IGV según `igv_affectation`; 5 casos exonerados en la evaluación | §3.9, §8.1, §8.7, §9 F4 |
| architecture-17 | Mayor | Plan Vercel verificado como Hobby; migrar a Pro antes del piloto (F0-7) | §0, §5.6, §5.11, §6.7, §9 F0-7, §10 |
| architecture-18 | Mayor | Audio o imagen sin texto bloquea "Generar"; ≥ 150 casos de alarmas; transcripción a V2 | §6.7, §8.3, §8.7, §8.9, §9 F4 |
| architecture-19 | Menor | Borrador con PHI: `sessionStorage` o clave por usuario con TTL y borrado al cerrar sesión | §3.6, §9 A5 |
| architecture-20 | Menor | Etiquetas siempre en `wa_conversation_tags`; copia a `patient_tags`; siembra con `COMMON_PATIENT_TAGS` | §3.7, §5.2, §9 A7 |
| architecture-21 | Menor | Contador local como estimación "≈"; `pricing_analytics` como fuente de verdad (`wa_usage_daily`) | §3.6, §4.5, §5.2, §5.10, §9 A10, §10 |
| architecture-22 | Menor | Cron de recordatorios sin reserva (D18); verify token como D19; "Ver huecos" pide servicio → doctor | §1.2, §1.3, §3.7, §6.1, §6.7, §10 |
| review-0 | Mayor | `pg_cron` + `pg_net` se adelantan de A9 a A2 (migración previa a `wa_ingest`): el reproceso del dead-letter y los reintentos de media existen en el piloto; A9 solo agrega el job de programados; migraciones renumeradas | §5.2, §5.3, §5.6, §5.7, §5.12 fila 3, §9 A2/A6/A9 y go-live |
| review-1 | Mayor | FEP y ecos: el eco cuenta para `first_response_at` y `stale_thread`, no fija `entry_point_expires_at`; la FEP la fija `wa_mark_sent` (1.ª respuesta por API) o el objeto `conversation` del estado | §3.6, §4.6, §5.2, §5.3, §5.4 |
| review-2 | Mayor | Backfill de `first_inbound_at` (= `created_at`) y `origin='inbound'` en A1 para que las cohortes pasadas no cambien | §5.2, §9 A1 y criterios |
| review-3 | Menor | Prompt injection: 30 casos en la evaluación (igual que §6.7); set total ~345 | §8.7, §9 I5 |
| review-4 | Menor | Restos del `lead_status` de 5 estados: §2.3 y el mini-resumen de la IA usan el estado derivado con `wa_lead_outcome` | §2.3, §8.4 |
| review-5 | Mayor | A8 (extracción de `wa_lead_outcome`) exige `captacion_summary` igual antes y después | §5.2, §9 A8 y criterios |
| review-6 | Menor | `wa_usage_monthly` se crea en A2 (A10 mínimo) | §9 A2, A10 |
| review-7 | Menor | "≈" en el contador 812/1.000 de §2.2 y del wireframe | §2.2, §3.2 |
| review-8 | Mayor | `wa_link_*`: ruta `POST /api/inbox/link` con validación de membresía, addon y rol, y `p_actor` | §3.9, §5.12 fila 1, §9 A8 |
| review-9 | Mayor | Advisory lock por cada identificador presente (teléfono y `user_id`), claves ordenadas y tomadas al inicio del lote; fusión si dos filas resultan ser el mismo contacto; test con POST concurrentes | §5.3, §5.12 fila 3 |
