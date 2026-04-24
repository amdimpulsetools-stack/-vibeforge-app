# Vitra — Feedback log del pilot

**Inicio:** `[FECHA]`
**Owner del log:** tú
**Frecuencia de revisión:** diaria los primeros 7 días, luego en cada reunión semanal del Viernes.

---

## Cómo usar este doc

Cada entrada que llegue (WhatsApp, email, durante la reunión) → agrégala a la tabla de abajo en orden cronológico. NO borres entradas resueltas — taja con `~~tachado~~` o mueve a la sección "Cerrados" al final.

**Formato de cada entrada:**

| Fecha | Reportado por | Tipo | Severidad | Página/Flujo | Descripción | Estado | Resolución |
|---|---|---|---|---|---|---|---|

### Convenciones

- **Tipo**: 🐛 Bug · ✨ Feature request · ❓ Pregunta · 🎨 UX
- **Severidad**:
  - 🔴 P0 — bloquea operación (no se puede agendar, no se puede cobrar, datos perdidos)
  - 🟠 P1 — afecta uso pero hay workaround
  - 🟡 P2 — molestia, no bloquea
  - 🔵 P3 — nice to have
- **Estado**:
  - 📥 Nuevo — recién reportado, sin investigar
  - 🔍 Investigando — confirmé que pasa, viendo causa
  - 🚧 En progreso — fix en desarrollo
  - ✅ Resuelto — fix deployado y verificado por Vitra
  - ⏸️ Diferido — válido pero no se ataca este mes (a COMING-UPDATES)
  - ❌ No es bug — comportamiento esperado, explicar a Vitra

---

## Bugs y feedback abiertos

| # | Fecha | Reportado por | Tipo | Sev | Página/Flujo | Descripción | Estado | Resolución |
|---|---|---|---|---|---|---|---|---|
| 1 | YYYY-MM-DD | Vanessa (recep) | 🐛 | 🟠 | /scheduler | Al crear cita Lun 28, el slot de 10:30 no aparece disponible aunque debería estar libre. | 📥 |  |
| 2 |  |  |  |  |  |  |  |  |

*(añadir filas según vayan llegando)*

---

## Métricas semanales del pilot

Llenar cada Viernes después de la reunión:

### Semana 1 (`[FECHAS]`)

| Métrica | Valor |
|---|---|
| Citas creadas | |
| Citas completadas | |
| Citas canceladas | |
| % no-show | |
| Pacientes nuevos | |
| Consentimientos subidos | |
| Pagos registrados (S/) | |
| Bugs P0 reportados | |
| Bugs P1 reportados | |
| Feature requests | |
| Tickets resueltos en la semana | |
| **Estado de ánimo del equipo (1-10)** | |
| **Lo más solicitado** | |

### Semana 2

*(repetir tabla)*

### Semana 3

*(repetir tabla)*

### Semana 4 — final

*(repetir tabla + sección de evaluación)*

---

## Notas de las reuniones semanales

### Reunión Viernes 1 — `[FECHA]`

**Asistentes:** owner, recep, dr.

**Lo bueno:**
- ...

**Lo que les frenó:**
- ...

**Lo que extrañan del sistema anterior:**
- ...

**Comentarios del paciente (si han probado el portal):**
- ...

**Reportes/vistas que quieren:**
- ...

**Decisiones tomadas en reunión:**
- ...

### Reunión Viernes 2 — `[FECHA]`

*(repetir formato)*

### Reunión Viernes 3 — `[FECHA]`

*(repetir formato)*

### Reunión Viernes 4 / Final — `[FECHA]`

**Evaluación por módulo (1-10):**

| Módulo | Vitra | Notas |
|---|---|---|
| Scheduler | | |
| Historia clínica | | |
| Portal del paciente | | |
| Cobros y descuentos | | |
| Reportes | | |
| Treatment plans | | |
| Performance general | | |

**Decisión comercial:**
- [ ] Renueva — Plan: `_______`
- [ ] Renueva con condiciones: `_______`
- [ ] No renueva — Razones: `_______`

**Features que están dispuestos a pagar extra:**
- ...

**Referidos potenciales que mencionaron:**
- ...

---

## Cerrados / archivo

| # | Fecha | Tipo | Sev | Resolución | Tiempo de fix |
|---|---|---|---|---|---|
| | | | | | |

---

## Recordatorios para ti

- **Responde dentro de 4h en horario laboral** los primeros 7 días, después dentro de 24h.
- **No prometas tiempos de fix sin chequear**. "Lo veo y te confirmo en X horas" es mejor que "lo arreglo hoy".
- **Si un bug no es bug** (ej: "no encuentro el botón" → estaba ahí), explica con screenshot. No los hagas sentir tontos.
- **Cierra bucles**. Cuando arregles algo, dile a Vitra "deployé la solución para [bug #5], pruébenlo y avísenme si quedó bien".
- **Cada Viernes en la noche, archiva el log** copiando una versión a `docs/vitra-feedback-log-YYYY-MM-DD.md` para no perder histórico si el doc se reescribe.
