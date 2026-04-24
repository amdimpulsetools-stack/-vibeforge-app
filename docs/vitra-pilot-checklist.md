# Vitra Pilot — Checklist de implementación (1 mes)

**Cliente:** Vitra — Centro de Fertilidad
**Inicio:** semana del `[FECHA_LUNES]`
**Duración:** 1 mes de prueba
**Objetivo del pilot:** evaluación de la plataforma, identificación de bugs, ajuste operativo antes de renovación anual.

---

## Fase 0 — Pre-launch (antes del Lunes)

### DB — Migraciones pendientes

Aplicar en Supabase SQL Editor **en orden** si alguna no está:

```sql
-- 1. Verificar estado
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'patients' AND column_name IN ('sex','is_recurring','is_foreigner','nationality'))
    OR (table_name = 'services' AND column_name = 'requires_consent')
    OR (table_name = 'clinical_notes' AND column_name = 'consent_registered')
    OR (table_name = 'founder_2fa_sessions' AND column_name = 'token'));
-- Esperas 8 filas. Si faltan, correr:
```

Migraciones en orden:
- [ ] 091 + 092 — addons + anthropometry (SQL catchup en docs antiguos)
- [ ] 094, 095, 096, 097, 098, 099, 100, 101, 102 (aplicadas)
- [ ] 103 — performance indexes (aplicada)
- [ ] **104 — founder_2fa_sessions** (CRÍTICA — sin ella el panel founder rompe)

### Deploy

- [ ] Merge de `claude/review-pdr-c4vLE` a `main`
- [ ] Deploy automático de Vercel verificado
- [ ] Verificar en `https://yenda.app`:
  - [ ] Login normal funciona
  - [ ] Crear cita en scheduler no arroja errores
  - [ ] Portal del paciente carga `/portal/<slug-de-prueba>`
  - [ ] Booking público carga `/book/<slug-de-prueba>`

### Organización de Vitra

- [ ] Crear Organization "Vitra" (si es nueva) o confirmar que ya existe
- [ ] Definir el `slug` público: sugerido `vitra` → URLs `/book/vitra`, `/portal/vitra`
- [ ] Invitar al owner de Vitra como miembro owner
- [ ] Setup de `global_variables` con `clinic_phone`, `clinic_email` reales
- [ ] Accent color de marca (preguntar a Vitra)
- [ ] Logo (subir a Supabase Storage, setear en `organizations.logo_url`)

### Datos clínicos — ver `vitra-seed-data.sql`

- [ ] **Doctores**: nombre, CMP, especialidad "Ginecología" o "Medicina Reproductiva", color, consultorio default
- [ ] **Consultorios**: los que usen (202, 203, Procedimientos según screenshots previos)
- [ ] **Servicios**: catálogo completo con precios y **`requires_consent`** donde aplique
- [ ] **Horarios de cada doctor** (doctor_schedules)
- [ ] **Especialidad de la org**: `fertility` / `medicina-reproductiva`

### Configuración del portal

- [ ] `booking_settings.is_enabled` = true (habilita /book)
- [ ] `booking_settings.allow_online_booking` = decisión de Vitra (SI → paciente agenda desde el portal; NO → modal con WhatsApp)
- [ ] `booking_settings.portal_enabled` = true
- [ ] `booking_settings.portal_allow_cancel` = decisión de Vitra
- [ ] `booking_settings.portal_min_cancel_hours` = sugerido 24
- [ ] `booking_settings.portal_welcome_message` = "Bienvenida a tu portal de Vitra. Aquí puedes ver tus próximas citas y tu plan de tratamiento."
- [ ] `booking_settings.accent_color` = hex de Vitra
- [ ] `booking_settings.discounts_enabled` = true

### Monitoreo

- [ ] Sentry configurado y confirmado que llegan alertas por email
- [ ] Verificar Vercel logs accesibles desde tu panel
- [ ] Canal de bugs creado (WhatsApp o Google Doc) — ver `vitra-feedback-log.md`
- [ ] Dashboard de Supabase abierto en otra pestaña por los primeros 2-3 días

### Testing smoke-test completo

Antes de entregar, haces tú mismo este flujo con un paciente de prueba:

- [ ] Recepción crea paciente nueva → guarda
- [ ] Recepción agenda cita con DNI existente → verificar patient_id se vincula correcto (fix commit `47d1fdc`)
- [ ] Cita con servicio que requiere consentimiento → bloque ámbar aparece en la nota clínica
- [ ] Recepción sube foto de consentimiento desde el sidebar (celular) → queda listado
- [ ] Doctor firma nota clínica → se bloquea
- [ ] Registrar pago con descuento inline 10% → total correcto
- [ ] Crear plan de tratamiento con 2 items (ej: 6 controles + 4 ecografías) → sesiones generadas
- [ ] Agendar cita con paciente que tiene plan → banner azul aparece con opciones
- [ ] Paciente accede al portal → ve su próxima cita + su plan con saldo

Si algo falla aquí, NO entregues el Lunes.

---

## Fase 1 — Onboarding (Lunes y Martes)

### Training del equipo (45 min)

Ver `vitra-training-script.md`. Se divide:
- **Bloque 1 (15 min)**: Recepción — scheduler, crear cita, cobrar, subir consentimiento
- **Bloque 2 (15 min)**: Doctor(es) — nota clínica, firmar, plan de tratamiento
- **Bloque 3 (10 min)**: Admin/Owner — reportes, settings, códigos de descuento
- **Bloque 4 (5 min)**: Demo del portal del paciente desde un celular

Grabar por Loom para referencia posterior del staff.

### Acceso

- [ ] Owner de Vitra recibe invitación y loguea
- [ ] Recepcionista(s) recibe invitación
- [ ] Doctor(es) recibe invitación
- [ ] Todos prueban sus flujos básicos durante la sesión (NO dejes que se vayan sin haber creado al menos 1 cita cada uno)

### Bug log activo

- [ ] Canal de feedback abierto en pantalla del equipo
- [ ] Acordado formato de reporte: qué pasó + qué esperaban + URL + hora

---

## Fase 2 — Primera semana (Lunes a Viernes)

### Actividades diarias

- [ ] **Cada mañana 10 min**: revisar Sentry del día anterior + Vercel logs + bug log
- [ ] Cualquier error **crítico** (fuga de datos, login roto, scheduler no carga) → fix en horas
- [ ] Errores **medianos** → mismo día
- [ ] Feature requests / preguntas → a COMING-UPDATES.md, respuesta a Vitra dentro de 24h

### Reunión Viernes (30 min)

Preguntas a Vitra:
1. ¿Qué flujo les fue fluido esta semana?
2. ¿Qué flujo les frenó o no encontraron?
3. ¿Qué extrañan del sistema anterior?
4. ¿El paciente (si han probado el portal) preguntó algo o se confundió con algo?
5. ¿Algún reporte o vista que quieran tener?

Documenta cada respuesta. Son oro para la priorización.

---

## Fase 3 — Semanas 2 y 3 — Cadencia estable

### Reunión semanal (Viernes 30 min)

- Review de bugs reportados: cuáles fixed, cuáles pendientes, cuáles no son bugs sino "así es el diseño"
- Review de uso: ¿cuántas citas se crearon? ¿el portal se está usando?
- Feature requests: priorizar con Vitra (qué quieren primero)
- Salud del sistema: Sentry tendencias, quejas recurrentes

### Métricas que debes estar viendo semanalmente

- Citas creadas por semana
- Citas completadas
- % de no-show
- Pacientes activos
- Consentimientos registrados (cita completed con `services.requires_consent = true` → debería tener `consent_registered = true` o un adjunto)
- Pagos registrados

---

## Fase 4 — Semana 4 — Evaluación

### Reunión final del mes (1h)

Con el owner de Vitra:

1. **Feedback estructurado por módulo**:
   - Scheduler: 1-10
   - Historia clínica: 1-10
   - Portal del paciente: 1-10
   - Facturación / cobros: 1-10
   - Reportes: 1-10
   - Treatment plans: 1-10

2. **Decisión comercial**:
   - ¿Renuevan anual? ¿Con qué plan (Professional / Enterprise)?
   - ¿Qué features están dispuestos a pagar extra? (templates de consentimiento, códigos de descuento, módulo de lab)
   - ¿Referirían a otras clínicas? (clave — primera referencia vale oro)

3. **Siguientes pasos**:
   - Qué bugs/features se atacan en el mes siguiente
   - SLA acordado para soporte
   - Agenda de reuniones (mensual → trimestral)

---

## Artefactos que salen del pilot

Al terminar el mes tienes:

- ✅ Un caso de estudio con números reales (cuántos pacientes, cuántas citas, tiempo promedio de una consulta, etc.)
- ✅ Lista priorizada de bugs/features basada en uso real
- ✅ Testimonial de Vitra para marketing (si fue bien)
- ✅ Plantilla de onboarding reusable para las próximas clínicas
- ✅ Confianza tuya sobre qué aguanta el sistema y qué no

---

## Recordatorios críticos

- **No prometas fixes que no puedas entregar en la semana**. Si un feature es grande, dile "lo ponemos en roadmap Q2".
- **El pilot no es el momento de construir nuevas features**. Es el momento de pulir lo existente.
- **Sé responsivo en los primeros 3 días**. El resto del mes puedes bajar la intensidad.
- **Escribe TODO lo que Vitra dice**. La memoria selecciona mal; el doc no.
