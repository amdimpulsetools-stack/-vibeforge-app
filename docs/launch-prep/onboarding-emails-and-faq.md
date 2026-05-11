# Onboarding emails y FAQ base — Yenda

> Drafts listos para copiar/pegar. Tono: cálido, directo, tutea, frases cortas.
> Variables `{{...}}` se reemplazan en el envío. Links son rutas internas del producto.

---

## Parte 1 — Secuencia de onboarding (3 emails)

---

### Email 1 — Día 0 (justo después del registro)

**Asunto:** {{nombre}}, tu clínica ya está adentro — esto toma 15 minutos

**Preheader:** 3 pasos concretos para que el lunes la primera cita ya esté en el sistema.

---

Hola {{nombre}},

Acabas de crear tu cuenta en Yenda. Bien jugado. Antes de mandarte a leer un manual de 40 páginas, te dejo los **3 pasos exactos** que necesitas hacer ahora para que tu clínica empiece a funcionar de verdad:

**1. Agrega tu primer doctor** → [/admin/doctors](/admin/doctors)
Si eres independiente, ese doctor eres tú. Si tienes equipo, súmalos uno por uno con su especialidad y CMP. Toma 2 minutos por persona.

**2. Crea tus servicios con precios** → [/admin/services](/admin/services)
Consulta general, control, procedimientos. Cada servicio lleva nombre, duración y precio. Esto es lo que después aparece cuando agendas una cita y cuando emites una boleta. Sin servicios, no hay agenda útil.

**3. Vincula WhatsApp (opcional pero altamente recomendado)** → [/settings](/settings) → tab WhatsApp
Yenda no envía mensajes por ti — te los deja listos en el portapapeles para que tú o tu recepcionista peguen en WhatsApp Web sin tipear nada. Funciona desde el día 1, sin trámites con Meta.

**Promesa concreta:** si haces estos 3 pasos seguidos, en 15 minutos tienes tu primera cita real cargada en el sistema, lista para cobrar y emitir boleta.

> 🎥 [Mira el video demo de 4 minutos](#) (placeholder mientras grabamos la versión final)

¿Te trabaste en algo? Respóndeme este correo directo. No es un autoresponder — entra a mi bandeja y te contesto yo.

Un abrazo,
{{founder_name}}
Fundador de Yenda
WhatsApp soporte: {{support_whatsapp}}

---

### Email 2 — Día 3 (¿Necesitas una mano?)

**Asunto:** {{nombre}}, ¿te trabaste en Nubefact o sigues evaluando?

**Preheader:** Los 3 obstáculos que vemos casi siempre el día 3 — y cómo los resolvemos.

---

Hola {{nombre}},

Llevas tres días con Yenda y, si eres como el 70% de las clínicas que arrancan, lo más probable es que el setup no esté terminado. No pasa nada. Hablemos sin rodeos de los 3 muros con los que casi siempre se chocan:

**1. "No sé cómo configurar Nubefact."** Es el paso más técnico y a la vez el más rentable: una vez listo, emites boletas y facturas a SUNAT en 30 segundos desde la cita. El wizard de Yenda ya pre-llena tu RUC — solo tienes que pegar el token y elegir tus series (B001 / F001).
→ [Ir a la configuración](/settings) (tab Integraciones → Nubefact)
→ Si prefieres pantalla compartida: **[agenda 30 minutos conmigo](#)**.

**2. "No tengo cuenta de WhatsApp Business."** No la necesitas. Yenda funciona con modalidad **clipboard**: te genera el mensaje listo (cita confirmada, recordatorio, seguimiento) y tú o tu recepcionista lo pegan en cualquier WhatsApp. Sin API, sin Meta, sin trámites.
→ Configura plantillas en [/settings](/settings) tab WhatsApp Clipboard.

**3. "Mis recepcionistas no entienden el sistema."** Eso es trabajo nuestro. Te ofrezco una **capacitación gratuita de 45 min** vía Meet con tu equipo. Cubrimos agenda, pacientes, pagos y boletas. Queda grabada para nuevos staff.
→ **[Reservar capacitación gratis](#)**

Si solo quieres conversar 30 minutos para ver si Yenda es para ustedes, también funciona.

→ **[Agendar 30 min con el fundador](#)**

{{founder_name}}
Yenda

---

### Email 3 — Día 7 (Check-in honesto)

**Asunto:** {{nombre}}, una semana adentro — ¿qué te está sirviendo y qué no?

**Preheader:** Tu feedback en esta etapa moldea literalmente el roadmap del producto.

---

Hola {{nombre}},

Una semana exacta desde que entraste a Yenda. Estoy escribiendo a un grupo pequeño de clínicas que arrancaron esta semana y quiero hacerte 2 preguntas honestas, no una encuesta de satisfacción de 18 preguntas:

**1. ¿Qué parte del sistema te está funcionando bien y ya forma parte de tu día?**
**2. ¿Qué te frustró, no entendiste o sentiste que falta?**

Te pido tres minutos para responderme directo a este correo. Sin formato, sin filtros — escríbeme como le contarías a un amigo. Estamos en una etapa del producto en la que **literalmente cada feedback de las primeras clínicas mueve la lista de prioridades**. Si me dices "necesito caja diaria" o "el reporte X no se exporta como necesito", entra al roadmap esa misma semana.

{{#if en_trial}}
PD: Estás en trial — te quedan **{{dias_restantes_trial}} días** antes de que toque elegir plan. No es presión, es para que lo tengas en el calendario. Si llegado el día quieres seguir, los planes parten en S/129/mes (Independiente). Si quieres cancelar, también está bien — te exportamos pacientes, citas y pagos en CSV sin trabas.
{{/if}}

Si te resulta más fácil hablar 20 minutos en vez de escribir:
→ **[Agendar feedback call](#)**

Gracias por darle una oportunidad a Yenda. Las primeras clínicas son las que construyen el producto con nosotros.

{{founder_name}}
Fundador de Yenda

---

## Parte 2 — FAQ base (10 artículos)

---

### 1. ¿Cómo creo mi primer doctor y le doy acceso al sistema?

Hay dos pasos separados que la gente suele confundir: **registrar al doctor** (perfil profesional) y **darle acceso** (cuenta de usuario).

**Registrar al doctor:** ve a [/admin/doctors](/admin/doctors) → "Agregar doctor". Llena nombre, especialidad, CMP y los servicios que atiende. Eso basta para que aparezca en la agenda y los reportes.

**Darle acceso:** ve a [/admin/members](/admin/members) → "Invitar miembro". Pon su correo y elige rol **Doctor**. Le llega un email — al registrarse, su cuenta se vincula automáticamente al perfil de doctor que ya creaste.

Importante: los doctores en Yenda solo ven sus propias citas. No pueden reagendar las de otros (solo cancelar, con motivo). Si quieres que alguien vea todo, dale rol Admin o Recepcionista.

Si eres Independiente y trabajas solo, tu cuenta cumple los dos roles. Vas a ver tu dashboard de admin más una sección "Mi Consulta" con tus métricas como doctor.

→ Próximo paso: [Agregar tu primer doctor](/admin/doctors)

---

### 2. ¿Cómo configuro mis servicios y precios?

Los servicios son la columna vertebral de tu agenda y tus cobros. Sin servicios no puedes agendar ni emitir boletas correctamente.

Ve a [/admin/services](/admin/services) → "Nuevo servicio". Cada servicio tiene:

- **Nombre** — lo que la recepcionista ve al agendar (ej. "Consulta ginecológica", "Histerosalpingografía").
- **Duración en minutos** — cuánto espacio ocupa la cita en el calendario.
- **Precio base** — en soles. Sugerido; ajustable en cada cita.
- **Categoría** — para agrupar en reportes.
- **Modalidad** — presencial, virtual o ambas.
- **Requiere consentimiento informado** — actívalo para procedimientos donde la Ley 29414 lo exige. El sistema bloquea el cobro hasta que el consentimiento esté firmado.

Tip: empieza con tus 5-10 servicios más comunes. Los demás los agregas conforme aparezcan.

→ Próximo paso: [Crear tus servicios](/admin/services)

---

### 3. ¿Cómo vinculo Nubefact para emitir boletas y facturas?

Yenda no es un facturador electrónico propio — usamos **Nubefact** como puente con SUNAT. Necesitas una cuenta activa en Nubefact (la abren en su web; es independiente de Yenda).

Pasos:

1. Asegúrate de que tu **RUC y razón social** estén bien cargados en [/settings](/settings) tab Organización. El wizard los toma de ahí.
2. En Nubefact, ve a *Configuración → API* y copia tu **token de API** y la URL del endpoint.
3. Vuelve a Yenda → [/settings](/settings) tab Integraciones → Nubefact → "Conectar".
4. Pega el token y selecciona las **series autorizadas** por SUNAT (típicamente B001 para boletas y F001 para facturas).
5. Click "Probar conexión". Si responde OK, ya está.

A partir de ahí, en cualquier cita pagada vas a ver el botón **"Emitir boleta"** en el sidebar. Llena los datos del cliente (DNI o RUC) y se emite a SUNAT en segundos. El PDF queda guardado y descargable.

Si algo falla (serie no autorizada, RUC inválido, monto fuera de rango), el sistema te muestra el error exacto que devuelve SUNAT — no inventamos el mensaje.

→ Próximo paso: [Configurar Nubefact](/settings)

---

### 4. ¿Cómo conecto WhatsApp Business para enviar recordatorios automáticos?

Con honestidad: hoy Yenda **no envía WhatsApp automático por ti**. Lo que hace es prepararte el mensaje listo para que tú o tu recepcionista lo peguen en WhatsApp con un click. Lo llamamos modalidad **clipboard**.

Por qué lo hicimos así: la API oficial de WhatsApp Business (Meta Cloud API) requiere aprobación de plantillas, número verificado y trámites que toman 2-4 semanas. La mayoría de clínicas ya tienen un WhatsApp activo con sus pacientes y solo necesitan **dejar de tipear lo mismo 50 veces al día**.

Cómo se usa:

1. Ve a [/settings](/settings) tab WhatsApp Clipboard.
2. Edita las plantillas (cita confirmada, recordatorio, post-consulta) con variables como `{{NOMBRE}}`, `{{FECHA}}`, `{{HORA}}`, `{{DOCTOR}}`.
3. Al crear una cita aparece un modal con dos botones: **Copiar mensaje** (para pegar en WhatsApp Web) y **Enviar por WhatsApp** (abre wa.me con el número del paciente).

Si activas el addon de Fertilidad, se desbloquean dos plantillas adicionales: seguimiento de segunda consulta y seguimiento de presupuesto.

Cuando crezcas y quieras envío automatizado, escríbenos — te ayudamos con la cuenta Business API.

→ Próximo paso: [Configurar plantillas](/settings)

---

### 5. ¿Cuál es la diferencia entre los planes Independiente, Centro Médico y Clínica?

Tres planes pensados para tres tamaños reales de clínica peruana:

| | **Independiente** | **Centro Médico** | **Clínica** |
|---|---|---|---|
| **Precio** | S/129/mes | S/349/mes | S/649/mes |
| **Doctores** | 1 | 3 | 10 |
| **Recepcionistas** | 0 | 2 | 3 |
| **Consultorios** | 1 | 3 | 10 |
| **Pacientes** | 150 | 1,000 | Ilimitados |
| **Citas/mes** | 100 | 500 | Ilimitadas |
| **Trial 14 días** | Sí | Sí | No |

Todos los planes incluyen: agenda, pacientes, historia clínica SOAP, recetas, integración Nubefact, WhatsApp clipboard, portal del paciente y reservas online.

**Frecuencias de pago:** mensual, semestral (8.3% off, "medio mes gratis") o anual (16.7% off, "2 meses gratis").

**Addons:** S/15 (o S/12 en Clínica) por consultorio extra, S/10 (o S/8) por miembro extra. Verticales: hoy ofrecemos **Fertilidad Pack Básico** (seguimientos automatizados, presupuestos A/B/C, rol de asesora).

→ Próximo paso: [Comparar planes](/select-plan)

---

### 6. ¿Cómo invito a mi recepcionista al sistema?

Ve a [/admin/members](/admin/members) → "Invitar miembro" → pon el correo y elige rol **Recepcionista**. Le llega un email con un link que expira en 7 días. Al registrarse, queda automáticamente vinculada a tu organización.

Qué ve una recepcionista (es distinto a lo que ves tú):

- Su pantalla principal es [/scheduler](/scheduler) — la agenda. No el dashboard administrativo.
- Puede agendar/reagendar/cancelar citas, gestionar pacientes, registrar pagos y emitir boletas Nubefact.
- **No puede** ver reportes financieros completos, configurar planes, gestionar miembros ni acceder a billing.

Si tu plan está al tope (Centro Médico permite 2 recepcionistas, Clínica 3), te aparece un aviso para comprar un slot extra (S/10/mes o S/8/mes) o subir de plan.

Tip: invita primero al equipo y déjales 2-3 días para explorar antes de la capacitación. Llegan con preguntas concretas y la sesión rinde 3x.

→ Próximo paso: [Invitar miembros](/admin/members)

---

### 7. ¿Qué hago si una boleta de Nubefact da error "no puedes emitir con esta serie"?

Es el error más común al configurar Nubefact por primera vez. Casi siempre es una de tres causas:

**1. La serie no está dada de alta en SUNAT para tu RUC.** Aunque la creaste en Nubefact, SUNAT también necesita autorizarla. Entra al portal SUNAT (Operaciones en Línea) → Comprobantes Electrónicos → verifica que B001 y F001 estén activas para tu RUC. Si no, dalas de alta ahí.

**2. Tipo de documento incompatible.** Si el cliente tiene RUC va factura (F001); si tiene DNI va boleta (B001). Si el RUC del paciente está mal cargado, el error pasa.

**3. Serie en ambiente equivocado (beta vs producción).** Confirma que en Nubefact estás trabajando en producción. Las series no se comparten entre ambientes.

Para diagnosticar: ve a [/facturacion](/facturacion) → ves el historial con el error exacto que devolvió SUNAT (no nuestra traducción). Pásanoslo por WhatsApp y lo resolvemos juntos.

→ Próximo paso: [Revisar el panel de facturación](/facturacion)

---

### 8. ¿Cómo importo a mis pacientes desde un Excel?

Honestidad primero: la **importación masiva por interfaz aún no está disponible** en Yenda. La estamos terminando.

Mientras tanto, tres caminos:

- **Opción A — Carga manual (hasta ~30 pacientes).** [/patients](/patients) → "Nuevo paciente". Datos mínimos: nombre, apellido, DNI, teléfono. ~1 minuto por paciente.
- **Opción B — Carga asistida por nuestro equipo (30-300 pacientes).** Mándanos tu Excel a {{support_email}} con: nombre, apellido, DNI/tipo de documento, teléfono, email y fecha de nacimiento (opcionales). Lo cargamos en menos de 24 horas. Sin costo durante el trial.
- **Opción C — Esperar la importación en UI.** Está en el roadmap de las próximas semanas.

Recomendación: durante el trial usa Opción B para tu base actual y Opción A para los pacientes nuevos del día a día.

→ Próximo paso: [Empezar a cargar pacientes](/patients)

---

### 9. ¿Puedo cancelar mi suscripción? ¿Pierdo mis datos?

Sí, puedes cancelar cuando quieras desde [/settings](/settings) tab Plan → "Cancelar suscripción". Sin penalidades, sin permanencia mínima.

Qué pasa con tus datos:

- **Hasta el final del periodo pagado:** acceso completo.
- **Después:** la cuenta queda en modo lectura por 30 días. Puedes loguearte y exportar pacientes, citas, pagos e historias clínicas en CSV/Excel desde [/reports](/reports) y [/patients](/patients).
- **Pasados los 30 días:** los datos se archivan. Si quieres reactivar, escríbenos — los restauramos dentro de los siguientes 6 meses.

Para exportar manualmente antes de cancelar: pacientes desde [/patients](/patients), reportes desde [/reports](/reports) (cada uno tiene botón Exportar), historias clínicas en PDF desde el drawer del paciente.

Si cancelas porque algo no funcionó como esperabas, respóndenos al correo y cuéntanos por qué. Es la única manera honesta de mejorar.

→ Próximo paso: [Gestionar tu plan](/settings)

---

### 10. ¿Cómo activo el módulo de Fertilidad y qué incluye?

El **Pack Básico de Fertilidad** es nuestro primer addon vertical, pensado para clínicas de reproducción asistida (FIV, IIU, ovodonación, ROPA, etc.).

**Cómo activarlo:** Ve a [/settings](/settings) tab Módulos → "Fertilidad — Pack Básico" → "Activar". La primera activación también siembra un catálogo base de servicios (FIV, IIU, inducción, criopreservación, etc.) en [/admin/services](/admin/services) que puedes editar.

**Qué incluye:**

- **Seguimientos automatizados** — cuando una cita se completa, el sistema crea seguimientos en [/scheduler/follow-ups](/scheduler/follow-ups) con prioridad semáforo, para que tu asesora sepa a quién contactar hoy. Cascada de hasta 3 intentos antes de cerrar como "sin respuesta".
- **Presupuestos A/B/C** — en cada servicio elegible cargas tres paquetes (premium, intermedio, básico) con monto y qué incluye. Desde la cita o el drawer del paciente generas el presupuesto y se traquea: sin enviar → enviado → aceptado → en curso → completado.
- **PDF profesional** — con tu membrete, datos del paciente, paquete elegido, vigencia 90 días y consideraciones legales boilerplate.
- **Rol Asesora de fertilidad** — en [/admin/members](/admin/members) marca a la obstetra/asesora con ese flag. Gana permisos para asignar y dar seguimiento a presupuestos sin ser admin.
- **Plantillas WhatsApp específicas** — seguimiento de segunda consulta y seguimiento de presupuesto.
- **Kanban de presupuestos** en [/scheduler/budgets](/scheduler/budgets) con KPIs (% aceptación, tiempo promedio).
- **Cron diario** — revisa qué presupuestos aceptados llevan más de 14 días sin iniciar tratamiento y crea un seguimiento automático.

→ Próximo paso: [Activar el módulo](/settings)

---

*Última actualización: 2026-05-11. Para sugerir mejoras a este FAQ, escribe a {{support_email}}.*
