# Checklist de instalación — cliente nuevo

> Información a solicitar al cliente ANTES del día de instalación.
> Creado para el onboarding de la Dra. Patricia Quispe (2026-06), reusable para cualquier org nueva.
> Marcar cada ítem al recibirlo. Los marcados ⚠️ son bloqueantes: sin ellos no se puede completar la configuración.

## 1. Datos legales y fiscales

- [ ] ⚠️ Razón social (`legal_name`) y nombre comercial (como quiere que aparezca en emails y documentos)
- [ ] ⚠️ RUC
- [ ] Dirección fiscal completa + ubigeo (departamento / provincia / distrito — mig 117, lo pide el wizard de Nubefact)
- [ ] ¿Va a emitir comprobantes electrónicos (boleta/factura) desde Yenda?
  - [ ] Si sí: cuenta Nubefact (token + ruta), series a usar (B001/F001), y si ya emite por otro medio, desde qué correlativo
  - [ ] Si no: saltar — se puede activar después desde Settings → Integraciones

## 2. Contacto y branding

- [ ] ⚠️ Email de la doctora que será **owner** de la cuenta (con ese email se registra; va a aceptar Terms + Privacy en el registro)
- [ ] Teléfono de la clínica (alimenta `{{clinica_telefono}}` en todas las plantillas de email/WhatsApp)
- [ ] Logo horizontal en buena resolución (membrete de recetas/notas/exámenes y documentos PDF)
- [ ] Ícono cuadrado compacto si lo tiene (topbar/sidebar; si no, se usa el logo como fallback)
- [ ] Color de marca (hex) para los emails a pacientes
- [ ] Email que quiere como remitente / reply-to de los correos a pacientes (Settings → Correos)

## 3. Estructura: sedes, horarios y equipo

- [ ] Consultorios/sedes: nombre y dirección de cada uno
- [ ] Horario de atención por consultorio (días + rangos) y si usa break time (default OFF)
- [ ] ⚠️ Por cada doctor/a que atiende:
  - [ ] Nombre completo + título profesional (Dr. / Dra. / Lic. — es per-org desde mig 146)
  - [ ] Especialidad(es)
  - [ ] Email personal para la invitación
  - [ ] Horarios de atención y en qué consultorios está autorizado/a
- [ ] Equipo no médico: recepcionistas y administradores (nombre + email para invitación + rol)
- [ ] ¿Restringir visibilidad doctor↔pacientes? (cada doctor ve solo sus pacientes, o todos)

## 4. Servicios y precios

- [ ] ⚠️ Lista completa de servicios/tratamientos que ofrece, con:
  - [ ] Nombre, duración estimada (para el calendario), precio y moneda (PEN/USD)
- [ ] Descuentos habituales que aplica (para configurarlos como descuentos del sistema)
- [ ] Si va a usar reportes por tipo de consulta: qué servicio es "primera consulta" y cuál "consulta de seguimiento" (mapping canónico)

## 5. Pacientes existentes

- [ ] ¿Tiene base de pacientes para migrar? ¿En qué formato (Excel, CSV, otro sistema, papel)?
- [ ] Campos mínimos por paciente: nombre completo, DNI, fecha de nacimiento, sexo, teléfono, email
- [ ] ¿Historias clínicas previas? (definir si se migran o se arranca de cero con HC en Yenda)

## 6. Plan y facturación de Yenda

- [ ] ⚠️ Plan elegido: Independiente S/129 · Profesional S/349 · Clínica S/649
- [ ] Frecuencia: mensual o semestral (8.3% off)
- [ ] Método de pago para Mercado Pago (tarjeta) — el trial de 14 días permite instalar sin cobrar el día 1

## 7. Comunicaciones con pacientes

- [ ] Revisar juntas las plantillas de email (confirmación, recordatorio 24h, reprogramación, cancelación…): cuáles activar y ajustar el tono/texto
- [ ] Número de WhatsApp de la clínica (para wa.me y plantillas clipboard)
- [ ] ¿Quiere sincronizar con Google Calendar? → cuenta Google de la clínica para conectar (org-level, one-way)

## 8. Legal / cumplimiento

- [ ] Formatos de consentimiento informado que usa hoy (para cargarlos como consentimientos digitales — Ley 29414)
- [ ] Recordarle que los datos de pacientes quedan bajo Ley 29733: la aceptación de Terms + Privacy en el registro es obligatoria y queda versionada

## 9. Addons verticales (si aplica)

- [ ] ¿La especialidad tiene vertical en Yenda? (p. ej. fertilidad, pediatría/curvas OMS)
- [ ] Si fertilidad: asesoras/obstetras (flag `is_fertility_advisor`), servicios elegibles para presupuesto, tiers A/B/C con montos y qué incluye, vigencia de presupuestos

## 10. Día de la instalación (orden sugerido)

1. Registro con el email de la owner → acepta Terms/Privacy → trial activo
2. Settings → Organización: datos legales, ubigeo, logo, ícono, teléfono
3. Consultorios + horarios
4. Invitar doctores y equipo (cada uno acepta desde su email)
5. Servicios + precios + descuentos (+ tiers si hay addon)
6. Plantillas de email y WhatsApp + remitente
7. Integraciones: Nubefact / Google Calendar si aplica
8. Migrar pacientes
9. Cita de prueba end-to-end: agendar → confirmar email → completar → cobrar → comprobante
10. Tour con la doctora y el equipo; recomendar 2FA al menos para la owner
