# Meta App Review — WhatsApp (Yenda)

Paquete para solicitar **acceso avanzado** a `whatsapp_business_management` y
`whatsapp_business_messaging`. Último trámite del expediente Meta.

**Estado del expediente (31-ago-2026)**

| Requisito | Estado |
|---|---|
| App publicada | ✅ |
| Verificación del negocio (AMD IMPULSE S.R.L.) | ✅ desde may-2024 |
| Proveedor de tecnología — verificación de acceso | ✅ 31-ago-2026 |
| Configuración de Embedded Signup (`config_id`) | ✅ 4454930594731788 |
| Flujo construido en Yenda | ✅ PR #327 (mig 234 aplicada) |
| **Acceso avanzado a los 2 permisos** | ⬜ **este documento** |

Ruta: Casos de uso → *Conectarte con los clientes a través de WhatsApp* →
Permisos y funciones → en cada permiso, **Acciones → Ir a revisión de la app**.

> ⚠️ Una vez enviada, la solicitud **no se puede editar ni cancelar**, y Meta
> revisa la app completa (contenido, íconos, política de privacidad, URL de
> eliminación de datos). Enviar solo con el video grabado y todo revisado.

---

## 1. Qué pedir (y qué NO)

Pedir exactamente dos permisos:

- `whatsapp_business_management`
- `whatsapp_business_messaging`

**NO** agregar `whatsapp_business_manage_events` (eventos de carrito/compras):
Yenda no lo usa y pedir permisos sin uso demostrable es causa directa de
rechazo.

---

## 2. Justificaciones (pegar en inglés, tal cual)

### `whatsapp_business_management`

> Yenda (yenda.app) is a SaaS platform used by medical clinics in Peru to manage
> appointments, patients and billing. Each clinic is our customer and connects
> its own WhatsApp Business Account through Meta's Embedded Signup flow.
>
> We need `whatsapp_business_management` to set up and maintain the WhatsApp
> Business Account that each clinic explicitly grants us access to. Specifically,
> we use it to: subscribe our app to the customer's WABA webhooks so the clinic
> receives patient replies inside Yenda; read the business phone numbers of that
> WABA to confirm the number the clinic selected and display it in our
> Integrations screen; and create, submit and check the status of the message
> templates the clinic uses for appointment reminders and confirmations.
>
> We never access WhatsApp accounts the customer has not granted us through
> Embedded Signup, and the clinic can disconnect at any time from its own
> settings page.

### `whatsapp_business_messaging`

> We need `whatsapp_business_messaging` to send WhatsApp messages on behalf of
> each clinic that connected its own WhatsApp Business Account to Yenda, and to
> receive the delivery webhooks for those messages.
>
> Outbound: transactional notifications about the patient's own appointment,
> sent only with templates the clinic created and Meta approved: appointment
> and teleconsultation confirmations (sent automatically when the clinic's
> staff confirms the appointment), reminders 24 hours and 2 hours before,
> rescheduling and cancellation notices, updated meeting links, payment
> receipts and invoices, and treatment follow-ups triggered by the clinic's
> team.
>
> Inbound: our webhook receives delivery and read statuses to keep the sending
> history accurate, and stores patient replies (for example a quick-reply
> "Confirm") so the clinic keeps a record of the conversation.
>
> Messages are only sent to patients of that clinic, from that clinic's own
> number, and only for appointment-related communication. We do not send
> marketing campaigns, and we never use one customer's number to message
> another customer's patients.

---

## 3. Screencasts — DOS videos separados (requisito de Meta)

> Verificado en la documentación oficial (developers.facebook.com →
> Business Messaging → WhatsApp → Solution Providers → App Review,
> y App Review Tutorial), 2026-09-07:
>
> - **"Do not submit a video that includes multiple permissions supporting
>   different use cases. You must submit a different video clip for each
>   permission. Your submission may be rejected if you highlight multiple
>   permissions being used as part of the same video."** → un video por permiso.
> - `whatsapp_business_management` → *"Record a video of your app, or WhatsApp
>   Manager, being used to create a message template."*
> - `whatsapp_business_messaging` → *"Record a video showing your app being used
>   to send a message to a WhatsApp number, and the WhatsApp client (either web
>   or mobile app) receiving and displaying the sent message."*
> - El **Embedded Signup NO hace falta grabarlo**: *"You don't need to wait for
>   Embedded Signup to be fully implemented to start this process."* Tampoco
>   aparece en los requisitos de video de ninguno de los dos permisos.
> - Turnaround medio: ~24 h.

**Reglas de grabación (de la guía de Meta, las que nos aplican)**
- 1080p o mejor; ancho de pantalla ≤ 1440; grabar solo la ventana de la app.
- **UI en inglés si se puede** (Yenda tiene ES/EN en el selector de idioma) o
  subtítulos explicando cada pantalla y botón no evidente.
- **Sin audio** (los revisores no lo escuchan). Cursor grande. Usar el ratón,
  no atajos de teclado.
- Al menos 1 llamada API exitosa por permiso en los últimos 30 días (la consola
  ya las marca en verde).
- Nada de credenciales personales de Facebook en pantalla; ningún dato de
  pacientes reales, ni de Patricia ni de Vitra.

### Video A — `whatsapp_business_management` (~45 s)
1. Login en yenda.app con la cuenta demo (5 s).
2. Ajustes → Integraciones → WhatsApp → **Plantillas**: se ve la lista con el
   número conectado (10 s).
3. Abrir `confirmacion_cita_demo` en **Editar**: nombre, categoría Utilidad,
   idioma, cuerpo con variables, mapeo de cada `{{n}}` y "Usar para
   (automático)". Cerrar sin guardar (15 s).
4. **Crear** la plantilla de recordatorio, mapear variables, **Enviar a
   revisión** y mostrar el estado "En revisión" / "Aprobada" tras sincronizar (15 s).

### Video B — `whatsapp_business_messaging` (~60 s)
1. Agenda → cita demo del paciente ficticio (5 s).
2. **Confirmar** la cita desde la tarjeta: Yenda envía sola la plantilla de
   confirmación (10 s).
3. Cambiar a WhatsApp Web o al móvil y mostrar **el mensaje llegando** con
   nombre, fecha y hora rellenados (30 s).
4. Opcional: pulsar el botón "Confirmar" de la plantilla desde el chat, para
   mostrar la respuesta del paciente que nuestro webhook recibe (15 s).

## 4. Cuestionario de manejo de datos — respuestas modelo

Meta pregunta cómo se usan, guardan y protegen los datos. Respuestas honestas
que reflejan cómo está construido el sistema:

- **¿Qué datos obtienes?** La cuenta de WhatsApp Business (WABA) del cliente,
  su número de teléfono de empresa, sus plantillas de mensajes, y los mensajes
  intercambiados entre la clínica y sus pacientes.
- **¿Para qué los usas?** Únicamente para prestar el servicio contratado por esa
  clínica: enviar recordatorios y confirmaciones de cita y mostrarle las
  respuestas de sus pacientes en su panel privado.
- **¿Los compartes con terceros?** No. No se venden, no se ceden y no se usan
  para publicidad ni para entrenar modelos.
- **¿Cómo los proteges?** Credenciales y tokens cifrados con AES-256-GCM en
  reposo; TLS en tránsito; base de datos con Row Level Security por
  organización, de modo que ninguna clínica puede leer datos de otra; acceso
  limitado por rol dentro de cada clínica (owner, administrador, recepción,
  doctor).
- **¿Cuánto tiempo los retienes?** Mientras la clínica mantenga la conexión
  activa. Al desconectar desde su panel, las credenciales se eliminan y los
  envíos cesan.
- **¿Cómo se eliminan los datos?** A solicitud del cliente, según lo publicado
  en https://yenda.app/data-deletion (contacto: privacidad@yenda.app).

---

## 5. Después de enviar

- Meta responde normalmente en pocos días hábiles.
- Si aprueban: los dos permisos pasan a **Acceso avanzado** y el popup deja de
  mostrar *"no puede registrar clientes"* → conectar un número real y validar
  (a) el `register` en modo Coexistence y (b) el `postMessage` del signup, los
  dos puntos que quedaron implementados de forma defensiva en el PR #327.
- Si rechazan: el correo indica el motivo exacto. Corregir solo eso y reenviar
  (mismo criterio que funcionó con la verificación de Google).

## 6. Pendiente posterior (no bloquea el review)

El token del Embedded Signup caduca a los **60 días** (plantilla usada al crear
el `config_id`). Antes de abrir a más clínicas: aviso de "tu conexión de
WhatsApp vence en X días" con reconexión en un clic y, si Meta lo permite para
este tipo de token, renovación automática server-side.
