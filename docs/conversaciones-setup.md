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
4. En Yenda, logueado como la org de prueba: **Ajustes → WhatsApp** → pega
   Phone Number ID, WABA ID y token. (Se guarda cifrado, igual que hoy.)
5. **Webhook**: en la app de Meta → WhatsApp → Configuration, URL
   `https://<tu-dominio>/api/whatsapp/webhook` con el verify token que ya usas,
   y suscribe el campo **messages** (trae mensajes y estados).
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
Hobby no permite cron por minuto) se usa pg_cron + pg_net de Supabase:

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
- Límite: 400 sugerencias por org cada 24 h.
- La IA **nunca envía sola**: arma un borrador que recepción revisa y envía.
- Datos de salud: antes de usarlo con pacientes reales, activar el BAA con
  Anthropic (Console → Settings → Privacy) o contactar a ventas de Anthropic.

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
   de las últimas semanas y conviértelas en fichas. Eso cubre ~80 %.
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
