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

> We need `whatsapp_business_messaging` to send and receive messages on behalf of
> each clinic that connected its own WhatsApp Business Account to Yenda.
>
> Outbound: appointment reminders (24h and 2h before the appointment),
> appointment confirmations, cancellations and treatment follow-ups — all sent
> with message templates that the clinic itself created and Meta approved.
> Inbound: patient replies are received through our webhook and displayed to the
> clinic's staff in their private panel, so they can answer within the 24-hour
> customer service window.
>
> Messages are only sent to patients of that clinic, from that clinic's own
> number, and only for appointment-related communication. We do not send
> marketing campaigns, and we do not use one customer's number to message
> another customer's patients.

---

## 3. Guion del screencast

Un solo video cubre ambos permisos. Debe verse el **flujo completo**, no el
resultado. Duración objetivo: 3-4 minutos, sin cortes bruscos.

**Antes de grabar**
- Perfil de Chrome **limpio** (nuevo, sin sesiones) — lección del video de
  Google que YouTube retiró por PII.
- Cerrar todo lo que muestre datos reales: correos, pestañas, notificaciones
  del sistema, WhatsApp Web con chats de pacientes.
- Cuenta de Yenda: la demo. Nada de la clínica de Patricia en pantalla.
- Sube el video como **Oculto/No listado** y pega el enlace en la solicitud.

**Secuencia**

1. **Contexto (15 s)** — yenda.app, login con la cuenta demo. Se ve que es un
   panel de gestión clínica.
2. **Punto de entrada (10 s)** — Settings → Integraciones → card de WhatsApp →
   clic en **"Conectar con Facebook"**. Se ve el diálogo con la elección
   "Mantener mi app de WhatsApp Business" (Coexistence).
3. **Embedded Signup — LO MÁS IMPORTANTE (60-90 s)** — el popup de Meta
   completo y sin cortes: login, selección del portfolio comercial, selección
   de la WABA y del número, y la pantalla de permisos (que se lea qué se está
   concediendo). Este tramo es el que sustenta `whatsapp_business_management`.
4. **Resultado (15 s)** — vuelta a Yenda: la card muestra el número conectado y
   el nombre del negocio.
5. **Plantillas — `whatsapp_business_management` (40 s)** — pantalla de
   plantillas de WhatsApp en Yenda: crear o abrir una plantilla de recordatorio,
   enviarla a aprobación y mostrar su estado sincronizado desde Meta.
6. **Envío — `whatsapp_business_messaging` (60 s)** — abrir una cita de prueba,
   disparar el recordatorio, y mostrar el mensaje **llegando al teléfono**
   (grabar la pantalla del móvil o WhatsApp Web del número de prueba).
7. **Recepción (30 s)** — responder desde ese teléfono y mostrar la respuesta
   apareciendo dentro de Yenda. Cierra el circuito bidireccional.

**Qué NO debe aparecer**: nombres, teléfonos o correos de pacientes reales;
el selector de cuentas de Facebook con perfiles personales de terceros; ningún
dato de la clínica de Patricia.

---

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
