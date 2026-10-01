# Conversaciones (bandeja de WhatsApp) — puesta en marcha

Módulo aditivo del addon **CRM WhatsApp + Captación** (`organization_addons.addon_key = 'captacion'`).
No toca agenda, Caja, pacientes ni facturación: solo lee de ellos. La agenda
recibe a lo sumo un enlace `/scheduler?patient_id=…` desde el botón "Agendar".

- Ruta: `/conversaciones` (sidebar → "Conversaciones").
- Quién lo ve: owner, admin y recepción. Doctores **solo** si un admin activa
  "Doctores pueden ver Conversaciones" (Ajustes ⚙ → General). Mismo patrón que Almacén.
- Migración: `supabase/migrations/275_whatsapp_inbox.sql` (rollback en
  `supabase/migrations/rollbacks/275_whatsapp_inbox_rollback.sql`).
- Investigación y decisiones: `docs/research/whatsapp-inbox-crm-2026-09.md`.

---

## 1. Aplicar la migración 275

> Recordatorio: el preview NO aísla la base. Aplicar "para probar" ya es producción.

1. `npm run check:embeds` → debe salir OK (la 275 no agrega FKs entre pares que ya tengan FK).
2. SQL Editor → correr la **Consulta 1** de `supabase/checks/multi_fk_pairs.sql` y guardar el resultado.
3. SQL Editor → pegar y ejecutar `275_whatsapp_inbox.sql` completo.
4. Repetir la Consulta 1 → debe dar **el mismo resultado** que en el paso 2.
5. Entrar como owner/admin a `/api/health/schema` → `ok: true`.
6. Abrir la agenda y confirmar que carga normal.

Qué hace la 275 (todo nuevo, nada se borra ni se renombra):

| Objeto | Para qué |
|---|---|
| Columnas nuevas en `wa_conversations` | estado abierto/archivado, no leídos, último mensaje, ventana de 24 h |
| `wa_messages` | hilo completo (entrantes, salientes, notas internas). Backfill desde `wa_inbound_messages` |
| `org_tags`, `wa_conversation_tags` | etiquetas |
| `wa_quick_replies` | respuestas rápidas `/atajo` |
| `wa_scheduled_messages` | mensajes programados |
| `wa_inbox_settings` | toggle de doctores + configuración de Yendy IA |
| `wa_kb_entries`, `wa_kb_gaps`, `wa_ai_suggestions` | base de conocimientos, brechas y bitácora de IA |
| Lectura de `wa_conversations` / `wa_inbound_messages` | pasa a la misma regla de la bandeja (miembro activo; doctor solo con el toggle). Ninguna pantalla las lee desde el navegador: Captación usa su RPC con service role, así que no cambia nada visible. El rollback repone la política original |

Si algo sale mal: ejecutar el rollback. Los mensajes entrantes no se pierden
(siguen en `wa_inbound_messages`, que la 275 no modifica).

Prueba local de la migración (Postgres del contenedor):

```bash
runuser -u postgres -- bash supabase/tests/inbox/run.sh
```

---

## 2. Sandbox de Meta (org de prueba: oscarfiverr@gmail.com)

La org "Clínica de Oscar Duran" ya tiene el addon `captacion` (mig 207).

1. En **developers.facebook.com → tu app → WhatsApp → API Setup** usa el
   **número de prueba** que da Meta (gratis, sin verificación de negocio).
2. En "To", agrega y verifica tu propio celular como **destinatario permitido**
   (el número de prueba solo puede escribir a hasta 5 números verificados).
3. Genera un token (para sandbox basta el temporal de 24 h; para algo estable,
   un *System User token* con `whatsapp_business_messaging` y `whatsapp_business_management`).
4. En Yenda, logueado como la org de prueba: **Ajustes → WhatsApp** → formulario
   manual (no "Conectar con Facebook"): pega Phone Number ID, WABA ID y token.
   El número de prueba vive en la WABA de prueba de tu propia app, por eso no se
   elige desde el Embedded Signup. (Se guarda cifrado, igual que hoy.)
5. **Webhook**: en la app de Meta → WhatsApp → Configuration, URL
   `https://<tu-dominio>/api/whatsapp/webhook` con el verify token que ya usas,
   y suscribe los campos **messages** (mensajes y estados) y
   **smb_message_echoes** (lo que la clínica escribe desde la app WhatsApp
   Business del celular cuando el número está en coexistencia; con el número de
   prueba no llegan, pero deja el campo suscrito para producción).
6. Desde tu celular escribe "Hola" al número de prueba → debe aparecer en
   `/conversaciones` en ≤ 8 s. Responde desde Yenda → llega a tu celular y
   ves ✓ / ✓✓ / ✓✓ azul.

Qué probar (checklist corto):

- [ ] Mensaje entrante aparece, contador de no leídos, se limpia al abrir.
- [ ] Respuesta de texto dentro de 24 h; fuera de 24 h el composer exige plantilla.
- [ ] Nota interna (amarilla) no llega al celular.
- [ ] Etiqueta: crear, aplicar, filtrar por ella.
- [ ] Respuesta rápida `/hola` con `{{nombre}}`.
- [ ] Vincular a paciente existente / crear ficha rápida (origen "WhatsApp").
- [ ] Mensaje programado a 2 min → se envía (con la pantalla abierta o con el cron del paso 3).
- [ ] Foto / audio / PDF entrante se ven (proxy desde Meta, no consume tu almacenamiento).
- [ ] Yendy IA: "Generar respuesta" con una pregunta de precio y otra fuera de la base → la segunda queda en **Brechas**.
- [ ] Mensaje de alarma ("estoy sangrando mucho") → borrador fijo con SAMU 106, sin IA.
- [ ] Doctor sin toggle no ve "Conversaciones"; con toggle sí.

> Sobre costos: los mensajes de **servicio** (respuestas dentro de las 24 h) son
> gratis hasta 1 000/mes y luego US$0.03 c/u desde el 1-oct-2026; las plantillas
> de **marketing** cuestan US$0.0703 en Perú. El número de prueba de Meta no cobra.

---

## 3. Mensajes programados sin la pantalla abierta (opcional)

Mientras alguien tenga `/conversaciones` abierta, la propia pantalla envía los
programados cada minuto. Para que salgan aunque nadie la tenga abierta (Vercel
Hobby solo corre crons una vez al día) se usa pg_cron + pg_net de Supabase.
Con Vercel Pro basta agregar a `vercel.json`
`{ "path": "/api/cron/inbox-dispatch", "schedule": "* * * * *" }` y no hace
falta este paso (no actives los dos a la vez sin necesidad; si coinciden no
duplican envíos, solo gastan llamadas).

1. Supabase → Database → Extensions: habilitar `pg_cron` y `pg_net`.
2. Guardar el secreto en Vault (**no** lo pegues en el repo):

```sql
select vault.create_secret('<el mismo valor de CRON_SECRET en Vercel>', 'inbox_cron_secret');
```

3. Programar el job:

```sql
select cron.schedule(
  'inbox-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<tu-dominio>/api/cron/inbox-dispatch',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'inbox_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
```

Para quitarlo: `select cron.unschedule('inbox-dispatch');`. El envío es
idempotente (la toma usa `FOR UPDATE SKIP LOCKED`), así que la pantalla y el
cron pueden coexistir sin duplicar mensajes.

---

## 4. Yendy IA (copiloto "Generar respuesta")

Variables de entorno en Vercel: `ANTHROPIC_API_KEY`. Nada más.

- Ajustes ⚙ → General: activar IA, elegir **Rápido (Haiku)** o **Preciso (Sonnet)**,
  tono (cálido/formal), emojis y firma.
- Ajustes ⚙ → **Reglas de Yendy**: reglas propias de la clínica (una por línea) y
  servicios que Yendy **no ofrece ni cotiza** por chat. Las reglas fijas de
  seguridad (no diagnosticar, no inventar precios, derivar urgencias) no se
  pueden desactivar.
- Ajustes ⚙ → **Probar Yendy**: escribes una pregunta como paciente y ves el
  borrador, las fichas usadas y si falta algo en la base. No envía nada.
- Los Ajustes abren a **pantalla completa** (`/conversaciones/ajustes`, botón ⚙
  de la lista) con navegación lateral: Bandeja (General, Respuestas rápidas,
  Etiquetas) · Yendy IA (Guía de conversación, Base de conocimientos, Casos
  reales, Brechas, Reglas, Probar) · Automatización (Flows, próximamente).

### Migración 276 (guía, fichas por servicio y casos)

Misma receta que la 275: Consulta 1 de `supabase/checks/multi_fk_pairs.sql`
antes y después (no agrega FKs: el resultado debe ser idéntico), pegar
`supabase/migrations/276_wa_kb_playbook.sql` en el SQL Editor, luego
`/api/health/schema` → `ok: true`. Sin la 276 la bandeja y Yendy siguen
funcionando; los Ajustes avisan "Falta aplicar la migración 276" al guardar
un caso o una ficha de tipo nuevo. Rollback: `rollbacks/276_wa_kb_playbook_rollback.sql`.

### Migración 277 (rendimiento: un índice)

`supabase/migrations/277_wa_inbox_perf.sql` crea solo el índice
`idx_wa_conv_org_updated (organization_id, updated_at DESC)` en
`wa_conversations`: ni tablas, ni columnas, ni FKs, ni políticas (Consulta 1
de `multi_fk_pairs.sql` idéntica antes y después). Lo usa el sondeo por
diferencias de la lista ("¿qué cambió desde la última vez?"). Sin él la
bandeja funciona igual, pero esa consulta recorre toda la tabla, que es
compartida por todas las clínicas. Rollback: `rollbacks/277_wa_inbox_perf_rollback.sql`.
Presupuesto y banco de pruebas: `docs/rendimiento-conversaciones.md`.

### Migración 278 (pulgar arriba/abajo y etiqueta automática Agendó / Asistió)

`supabase/migrations/278_wa_feedback_outcome.sql`. Sin FKs nuevas (Consulta 1
de `multi_fk_pairs.sql` idéntica antes y después). Añade:

- **Pulgar arriba / abajo** en cada sugerencia de Yendy (en el chat y en
  "Probar Yendy") y el **texto que de verdad se envió** (`wa_ai_suggestions`).
  Es la señal más limpia para saber qué sugirió la IA, qué corrigió recepción
  y si gustó. Sin la 278 el pulgar avisa "Falta aplicar la migración 278" y
  el envío sigue funcionando.
- **Resultado automático**: cuando la paciente vinculada a un chat agenda una
  cita, la agenda estampa "Agendó" en ese chat (y "Asistió" cuando llega o se
  completa la cita). Se ve en el panel derecho (Atributos) y como etiquetas
  automáticas ✦ "Agendó" / "Asistió", filtrables en la lista. Reglas: solo
  chats con actividad en los últimos 60 días (120 para "asistió"); nunca
  retrocede de Asistió a Agendó; una cita cancelada no cuenta; las etiquetas
  automáticas no se borran ni renombran (el color sí) y sí se pueden quitar
  de un chat a mano.
- **Agenda intacta**: el trigger hace UNA lectura por índice y nunca bloquea
  la cita (si algo falla, deja un WARNING y la cita se guarda igual). Un
  doctor que agenda no necesita acceso a la bandeja.

Aplicar, luego `/api/health/schema` → `ok: true` y abrir la agenda y
`/conversaciones`. Rollback: `rollbacks/278_wa_feedback_outcome_rollback.sql`
(las etiquetas Agendó/Asistió quedan como etiquetas normales).

### Migración 279 (casos candidatos minados de los chats que cerraron)

`supabase/migrations/279_wa_case_candidates.sql`. Una sola FK nueva
(candidatos → conversación; el par no tenía ninguna y no se leen juntos):
la Consulta 1 de `multi_fk_pairs.sql` debe dar el mismo resultado antes y
después, y la Consulta 2 de la FK nueva, una sola fila. Añade:

- **Ajustes → Casos candidatos**: Yendy revisa los chats que terminaron en
  cita (etiqueta Agendó / Asistió de la 278), busca el tramo donde la
  paciente pasó de dudar a aceptar y lo propone: lo que escribió → la
  respuesta real que funcionó → hacia dónde encauzar → por qué funcionó.
  Administración **aprueba** (corrigiendo lo que quiera; entra a Casos
  reales y Yendy lo usa desde la siguiente sugerencia) o **descarta**.
  Nada entra solo.
- **Cuándo revisa**: al abrir la sección, como mucho una vez por semana
  (`wa_inbox_settings.ai_mined_at`), o con "Buscar ahora". De 8 chats por
  corrida, los últimos 40 mensajes de cada uno, con el modelo elegido en
  General (Haiku o Sonnet). Cada chat se revisa UNA vez
  (`wa_conversations.mined_at`); los muy cortos se marcan sin gastar IA.
- **Privacidad**: la IA copia el texto tal cual pero quita teléfonos, DNI,
  correos y apellidos, y descarta tramos con información clínica. Revisa
  igual antes de aprobar: el caso queda en la base de conocimientos.

Sin aplicar la 279, la sección avisa "Falta aplicar la migración 279"; el
resto de Conversaciones no cambia. Rollback:
`rollbacks/279_wa_case_candidates_rollback.sql` (los casos ya aprobados se
conservan).

### Migración 280 (panel de medición)

`supabase/migrations/280_wa_inbox_metrics.sql`: una sola función,
`wa_inbox_metrics(org, días)`, solo lectura; sin tablas, columnas, índices ni
FKs (Consulta 1 de `multi_fk_pairs.sql` idéntica). Alimenta Ajustes →
**Medición**: chats nuevos y cuántos agendaron / asistieron, chats con
sugerencia de Yendy usada vs. sin IA (es comparación, no causa), qué pasó
con las sugerencias (usadas, editadas antes de enviar, pulgares, revisión
humana, brechas, tokens y costo estimado), por qué escriben (intenciones),
tiempo de primera respuesta (mediana, percentil 90, respondidos en 1 h, sin
respuesta) y la serie semanal. Solo administración; devuelve cuentas y
tiempos, nunca texto. Una llamada ≈ 9 ms con 1 000 chats (banco de
rendimiento). Rollback: `rollbacks/280_wa_inbox_metrics_rollback.sql`.

### Migración 281 (Flows: base y motor, fase 1)

`supabase/migrations/281_wa_flows.sql`. Diseño completo en
`docs/research/conversaciones-flows-2026-10.md`. **Dos FKs nuevas**, cada una
en un par que no tenía ninguna y que no se lee junto en un embed
(`wa_flow_runs → wa_conversations`, `wa_flow_run_events → wa_flow_runs`;
`wa_flow_versions → wa_flows` es tabla nueva con tabla nueva): Consulta 1 de
`multi_fk_pairs.sql` idéntica antes y después, Consulta 2 por cada FK nueva
con una sola fila, `npm run check:embeds` en verde. Añade:

- **Tablas**: `wa_flows` (borrador + estado draft/active/paused/archived,
  un disparador, prioridad), `wa_flow_versions` (lo publicado, inmutable),
  `wa_flow_runs` (una ejecución por conversación como máximo, índice único
  parcial), `wa_flow_run_events` (rastro por nodo). RLS: quien ve la bandeja
  lee; admin escribe flows y publica versiones; runs y eventos solo el motor.
- **Conversación**: `bot_paused_until` (cualquier mensaje del equipo, desde
  Yenda o desde el celular, pausa el bot N horas) y `bot_opted_out`
  (STOP / BAJA: el bot nunca más escribe ahí; etiqueta "No contactar").
- **Mensajes**: `source = 'flow'` y columna `interactive` (botones / lista
  enviados y la respuesta con su id).
- **Ajustes**: `flows_enabled`, `flows_pause_hours` (12), horario silencioso
  (`flows_quiet_start/end`) y `flows_disclosure` (aviso de asistente
  virtual del primer mensaje; política de Meta).
- **RPCs** `wa_flow_claim_due` y `wa_flow_claim_for_inbound` (toma atómica,
  solo service role).

**Cómo corre el motor (sin pantalla todavía):** al llegar un mensaje nuevo
(`mirrorInboundToInbox`, solo filas realmente insertadas, después de
responder a Meta) y en el mismo tick por minuto de los programados
(`/api/cron/inbox-dispatch` y `/api/inbox/dispatch`). Reglas duras que no se
configuran: un bot por chat; una persona manda; fuera de la ventana de 24 h
solo plantilla (nunca se descarta en silencio: termina con motivo
"ventana_cerrada"); STOP/BAJA; alarma → persona; la palabra *persona* corta
el bot; tope de 200 pasos y 12 nodos por invocación; aviso de asistente
virtual en el primer mensaje.

**API (fase 1):** `GET/POST /api/inbox/flows`, `GET/PATCH/DELETE
/api/inbox/flows/:id`, `POST …/publish` (valida contra etiquetas, plantillas
aprobadas y miembros de la org; crea versión), `POST …/test` (simula con el
motor puro: no envía ni escribe), `GET …/runs` (ejecuciones y contador por
nodo), `POST /api/inbox/conversations/:id/flow` (iniciar a mano) y `PATCH
/api/inbox/conversations/:id { bot_paused }`. Tres flows de fábrica como
plantillas (bienvenida con menú, nadie respondió en 30 min, confirmación por
botones). **Pantallas (fases 2 y 3, mismo PR):** `/conversaciones/flows` (lista:
nombre, disparador, estado, ejecuciones; Nuevo flow desde plantilla o en
blanco; pausar / activar / archivar) y `/conversaciones/flows/[id]` (editor
a pantalla completa con React Flow: paleta a la izquierda, lienzo con
tarjetas y una salida por rama, panel de propiedades a la derecha,
validación en vivo con errores por nodo, deshacer / rehacer, Guardar
borrador, Publicar, Pausar / Reanudar y cajón **Probar** con burbujas
estilo WhatsApp sobre el motor puro: no envía nada). Los contadores de cada
tarjeta son cuántas veces pasó por ese nodo. Recepción abre el editor en
solo lectura. En el chat, panel derecho → **Bot (Flows)**: bot activo o
pausado, Pausar / Reanudar e Iniciar flow a mano. Ajustes → **Flows**:
interruptor general, horas de pausa, horario silencioso y aviso de
asistente virtual.

Pruebas: `npm run test:flows` (motor puro, 11 grupos), harness SQL (FL1,
FL2, rollback 281 ×2), banco de rendimiento (runs vencidos y chats sin
respuesta por índice). Rollback: `rollbacks/281_wa_flows_rollback.sql`.

### La fórmula: Guía de conversación

Ajustes ⚙ → **Guía de conversación**. Es cómo Yendy encauza cada chat, y
viene precargada con una fórmula cálida y "closer" sin ser fría:

1. **Acoger**: saludar por su nombre y agradecer que escriba.
2. **Responder primero** lo que preguntó, con el dato exacto del catálogo.
3. **Entender con UNA sola pregunta** si falta un dato para orientarla.
4. **Orientar**: qué incluye, para quién es, qué esperar (sin prometer).
5. **Cerrar con el siguiente paso** concreto y fácil: "¿te acomoda esta
   semana o la próxima? Dime tu horario y te lo reservo".
6. **Dejar la puerta abierta** si no está lista, sin presionar.

Se edita todo: objetivo, apertura, cierre, respuestas a objeciones ("está
caro", "lo voy a pensar", "queda lejos", "¿duele?"), lo que siempre debe
hacer y lo que nunca. Las reglas fijas de seguridad quedan por encima.

### Qué va en cada sitio

| Sitio | Qué es | Ejemplo |
|---|---|---|
| **Catálogo** (Administración → Servicios) | Fuente de verdad automática: precio, IGV, duración, indicaciones previas | S/ 150.00 incluye IGV, 30 min |
| **Base de conocimientos → Por servicio** | Fichas colgadas de cada servicio: qué incluye, para quién, beneficio esperado, preparación, después, pregunta frecuente, objeción | "Incluye evaluación con la especialista, ecografía y plan por escrito" |
| **Base de conocimientos → Generales** | Lo que no es de un servicio | formas de pago, cancelaciones, cómo llegar |
| **Casos reales** | Mensaje real de una paciente → la mejor respuesta del equipo → hacia dónde encauzar. Son los ejemplos de tono | "me dijeron que es carísimo" → validar, qué incluye, ofrecer evaluación → dos horarios |
| **Brechas** | Lo que Yendy no supo; se resuelve como ficha o como caso | — |
| **Reglas** | Límites y servicios que no se ofrecen por chat | "No confirmar horarios" |

El camino más corto para cargar casos: en el chat, pasar el mouse por un
mensaje de la paciente → **"Guardar como caso"**. Se precargan su mensaje y la
respuesta real que dio el equipo; quitar datos personales antes de guardar.
- Límite: 400 sugerencias por org cada 24 h.
- La IA **nunca envía sola**: arma un borrador que recepción revisa y envía.
- Datos de salud: antes de usarlo con pacientes reales, activar HIPAA/BAA en la
  **consola de la API** (platform.claude.com → Settings → Privacy → tarjeta
  "HIPAA compliance"; la ve un admin de la organización con permiso de HIPAA).
  No es la app claude.ai: los planes Free/Pro/Max no están cubiertos. Si la
  tarjeta no aparece, se pide a ventas de Anthropic. Una vez activo es
  permanente. Lo que usa Yendy (Messages API, caché de prompt, salida
  estructurada) es elegible; la beta de respaldo de Sonnet, si la API la
  rechaza, se reintenta sola sin ella.
  Fuente: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention

### Cómo "entrenar" la base de conocimientos (buenas prácticas)

No se hace *fine-tuning*. Lo que usan Intercom Fin, Zendesk AI o Kommo es lo
mismo que hace Yendy: la IA lee **tu** información en cada pregunta y solo
responde con ella. La calidad depende de la base, no del modelo.

1. **El catálogo vivo es la fuente de verdad.** Precios, duración, IGV,
   doctores, sedes, horario e indicaciones previas salen automáticamente de
   Servicios, Ajustes y Agenda. No los copies en la base: si cambias un precio
   en Servicios, la IA ya lo sabe. Además, si la IA escribe un precio que no
   está en el catálogo, el borrador se marca "revisar".
2. **Fichas cortas, un tema por ficha.** "¿Atienden sábados?", "Política de
   reprogramación", "Qué llevar a la primera consulta". 2–6 líneas, en el
   lenguaje en que lo diría recepción. Mejor 40 fichas cortas que 3 largas.
3. **Escribe la respuesta, no el reglamento.** Incluye el *qué hacer*: "Sí, se
   puede reprogramar hasta 24 h antes sin costo; después se pierde el adelanto".
4. **Empieza por las 20 preguntas reales más frecuentes.** Revisa los chats
   de las últimas semanas y conviértelas en **casos** (mensaje real + mejor
   respuesta) y en fichas. Eso cubre ~80 %. Los casos enseñan el tono; las
   fichas enseñan los datos.
5. **El ciclo de brechas es el entrenamiento.** Cada vez que la IA no sabe,
   la pregunta cae en **Brechas**. Responderla ahí crea la ficha. Revisar
   Brechas 10 min a la semana es todo el "entrenamiento" que necesita.
6. **Las ediciones son señal.** Si recepción siempre corrige lo mismo en los
   borradores, falta o está mal una ficha.
7. **Set de prueba.** Guarda 20–30 preguntas reales (sin datos del paciente)
   y, cuando cambies fichas o modelo, pruébalas con "Generar respuesta" para
   ver que nada empeoró.
8. **Lo clínico no va a la base.** Nada de diagnósticos, dosis ni
   interpretación de resultados: la IA está instruida para derivar al médico
   y los mensajes de alarma nunca pasan por la IA.

Con bases pequeñas (hasta unas cientos de fichas) la base completa entra en
el prompt con caché, lo que es más preciso que buscar fragmentos (RAG) y
cuesta poco: la parte en caché se cobra ~10 % en las preguntas siguientes.

---

## 5. Qué NO hace todavía (siguientes pasos)

- Agente de IA autónomo (responde solo): se muestra como "próximamente".
- Importar historial de 90 días (coexistencia con la app de WhatsApp Business).
- Guardar media en Storage (hoy se ve vía proxy de Meta; los enlaces de Meta
  expiran ~7 días después).
- Asignación de chats por usuario y métricas de tiempo de respuesta.
