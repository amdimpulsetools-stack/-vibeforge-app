# Vitra — Training del equipo (45 min)

**Asistentes**: owner, 1-2 recepcionistas, 2 doctores.
**Formato**: presencial o videollamada. **Graba en Loom** (queda para consulta posterior y para onboarding de próximas clínicas).
**Objetivo**: que cada rol pueda hacer su flujo básico sin ayuda al final de la sesión.

---

## Antes de empezar (5 min — setup)

- [ ] Cada asistente en su computadora / celular logueado en `https://yenda.app`
- [ ] Proyectar tu pantalla como guía
- [ ] Tener un paciente de prueba ya creado (ej: "Test Vitra") para no hacerlo en vivo

---

## Bloque 1 — Recepción (15 min)

**Actores:** recepcionista(s).
**Objetivo:** agendar cita, cobrar, subir consentimiento.

### 1.1 — Scheduler: crear cita con DNI (6 min)

- Abre `/scheduler` — muestra la vista del día
- Click en un slot vacío del consultorio → abre el modal "Nueva cita"
- **Tipea el DNI del paciente** → el sistema busca → si existe, autocompleta nombre/teléfono
- **PUNTO CRÍTICO**: si cambias el nombre después de que el sistema encontró al paciente → el sistema automáticamente desvincula (el banner pasa de "paciente encontrado" a "paciente nuevo"). Esto previene errores históricos. Mostrarlo explícitamente.
- Si el paciente tiene un **plan de tratamiento activo** → aparece un banner azul con opción de "Agendar como sesión del plan". Click → el servicio y precio se toman del plan automáticamente.
- Elegir servicio, doctor → guardar
- La cita aparece en el scheduler con color del doctor

### 1.2 — Sidebar de la cita (4 min)

- Click en la cita recién creada → se abre el sidebar a la derecha
- Explica cada sección:
  - Datos básicos (hora, paciente, servicio, doctor)
  - **Plan context** (si aplica): muestra sesión X/N y saldo del plan
  - **Cobros**: total / pagado / pendiente. Botón "Registrar pago"
  - **Descuento**: botón "Aplicar descuento" → % o monto fijo, con razón
  - **Consentimiento** (si el servicio lo requiere): banner ámbar, botón "Subir consentimiento firmado" → **abre cámara en celular** para tomar foto al papel
  - Acciones: Reagendar, Cancelar, Completar

### 1.3 — Flujo real: paciente llega, paga, firma consentimiento (5 min)

Simular en vivo:
1. Paciente llega para su "Punción folicular" (servicio con consentimiento requerido)
2. Recepción confirma la cita → abre sidebar
3. Banner ámbar: "Consentimiento informado requerido"
4. Imprime el consentimiento (pregunta: ¿tienen un formato Word? Por ahora se imprime fuera del sistema; Tier 2 en futuro genera PDF)
5. Paciente firma el papel
6. Recepción toma foto del papel con su celular → click "Subir consentimiento firmado" → cámara
7. Aparece "✓ 1 archivo" en el bloque
8. Recepción cobra: "Registrar pago" → monto, método (Yape / efectivo / transferencia) → guardar
9. Estado de la cita pasa a "Confirmada" o "Pagado"

---

## Bloque 2 — Doctor(es) (15 min)

**Actores:** doctor(es).
**Objetivo:** escribir nota clínica, crear plan de tratamiento, firmar.

### 2.1 — Abrir la nota clínica de la cita (3 min)

- Desde el scheduler, click en la cita → sidebar → botón "Historia Clínica" → abre el modal expandido
- Explicar las secciones:
  - **SOAP** (Subjetivo, Objetivo, Evaluación, Plan) → campos de texto libre
  - **Signos vitales** → presión, peso, temperatura, etc.
  - **Diagnósticos CIE-10** → búsqueda en el catálogo (escribe "SOP" → aparece E28.2)
  - **Consentimiento** → bloque ámbar si el servicio lo requiere. Después de firmar adjunto, marcar el checkbox "Consentimiento registrado"
  - **Notas internas** → no visibles al paciente
  - **Plantillas** → si Vitra quiere, puede cargar plantillas prellenadas (ej: "Primera consulta fertilidad")

### 2.2 — Plan de tratamiento multi-servicio (6 min)

- En la nota clínica, panel derecho: "Planes de Tratamiento"
- "Nuevo plan" → formulario
- Añadir items:
  - Servicio "Foliculometría" × 6 × S/ 80 = S/ 480
  - Servicio "Punción folicular" × 1 × S/ 2500 = S/ 2500
  - Servicio "Transferencia embrionaria" × 1 × S/ 1200 = S/ 1200
- Total del plan: S/ 4180
- Al guardar, se crean 8 sesiones pending (6 + 1 + 1)
- Cuando la paciente vuelva para una foliculometría, recepción agenda la cita con su DNI → el banner azul aparece → se agenda como sesión del plan
- **Explicar el modelo de saldo**: la paciente puede pagar sesión por sesión, o adelantar S/ 1500, o pagar todo. El sistema lleva cuenta sola.

### 2.3 — Firmar la nota (2 min)

- Al terminar: botón "Firmar nota"
- Aparece dialog de confirmación (esto es nuevo, antes era el popup feo del navegador) → "Al firmar esta nota se bloquea la edición permanentemente"
- Click "Sí, firmar" → nota queda bloqueada, marcada como firmada
- **Importante**: después de firmar NO puedes editar. Sube consentimientos ANTES.

### 2.4 — Recetas y órdenes de exámenes (4 min)

- Panel derecho tiene **Recetas** y **Órdenes de Exámenes**
- Crear ejemplo: "Folicare 150 UI × 10 días, SC"
- Impresión PDF con membrete de la clínica (botón "Imprimir")
- Paciente puede ver sus recetas/órdenes desde el portal

---

## Bloque 3 — Admin / Owner (10 min)

**Actores:** owner y/o admin.
**Objetivo:** ver reportes, configurar, gestionar equipo.

### 3.1 — Dashboard (3 min)

- `/dashboard` (automático al login)
- Cards: Ingresos del mes, Cobranza pendiente, Citas (completadas/no-show/canceladas), Pacientes nuevos vs recurrentes, Rendimiento por recepcionista, % de Ocupación, Meta del mes, Timeline últimos 30 días
- Explicar que estos se actualizan en vivo con cada cita

### 3.2 — Reportes (3 min)

- `/reports` → 3 tabs: Operacional, Financiero, Retención, Marketing
- Top 5 tratamientos
- Ingresos por servicio
- Estadísticas de no-show por doctor
- Exportar a CSV

### 3.3 — Settings (2 min)

- `/settings`
- Agenda: cambios al portal, al booking público, toggle de descuentos
- Correos: plantillas de emails que la clínica envía (recordatorios, confirmaciones)
- WhatsApp: plantillas para copiar al portapapeles
- Integraciones: Mercado Pago, etc.

### 3.4 — Admin (2 min)

- `/admin` → CRUD de doctores, servicios, consultorios, plantillas
- `/admin/discount-codes` (si Vitra quiere códigos reutilizables, plan Pro)
- `/admin/doctors/[id]` → configurar especialidad, consultorio default, color

---

## Bloque 4 — Demo del portal del paciente (5 min)

**Mostrar en celular real.**

- Abrir `https://yenda.app/portal/vitra` (o la URL con slug)
- Log in con email de paciente de prueba → magic link llega al email → click
- Vista "Resumen":
  - Tiles: Próxima cita, Citas completadas, Última visita, Especialistas
  - Hero card: próxima cita con fecha, doctor, servicio, lugar
  - Tabs: Próximas / Historial
  - Botón "Agendar cita" (según config de `allow_online_booking`)
- Tap en una cita → detalle: doctor, servicio, consultorio, notas, opción de cancelar (si allowed) + "Añadir al calendario" (.ics)
- Sidebar del perfil (desktop) / botón avatar (mobile): info del paciente, teléfono editable
- Card "Mi plan" si tiene plan activo: barra de progreso, pagado vs total

---

## Cierre (2 min)

### Canal de feedback activo

Acordar **DÓNDE** van a reportar bugs/preguntas:
- WhatsApp de soporte (tú)
- O un Google Doc compartido (ver `vitra-feedback-log.md`)

### Formato de reporte de bugs

- Qué estaban haciendo
- Qué esperaban que pase
- Qué pasó en cambio
- Screenshot si es visible
- URL de la página
- Hora aproximada

### Agenda

- Revisión **Viernes a las 4pm** (30 min) — primera semana es crítica
- Semana 2 en adelante: cada Viernes, siguen 30 min
- Al final del mes: reunión de evaluación de 1h

### Pregunta abierta

"¿Qué les preocupa o qué se les ocurre que les gustaría que haga el sistema en las próximas semanas?"

Anotar todo. Es material para COMING-UPDATES.md.

---

## Tips para ti durante el training

- **Habla lento**, deja pausas. El equipo de Vitra no conoce el sistema.
- **Deja que ellos hagan click, no tú todo el tiempo**. Si hacen todo solo con observar, no van a recordar.
- **No prometas features**. Si algo no existe aún, di "está en roadmap, lo evaluamos juntos".
- **No expliques arquitectura**. Lo que les importa es "qué botón hago" y "qué pasa si".
- **Empatiza con resistencia al cambio**. Los sistemas anteriores siempre "hacían algo mejor" según el usuario nostálgico. Anota y sigue.
- **Graba la sesión**. Para ti y para ellos.
- Al final, **déjales el link al training grabado** y el WhatsApp de soporte visible.
