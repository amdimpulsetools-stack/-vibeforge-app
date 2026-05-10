# Evaluación: Citas con Doble Tratamiento (consulta + procedimiento en el mismo slot)

> Análisis de viabilidad arquitectónica para soportar que un paciente consuma 2+ servicios en una sola cita (mismo doctor, misma franja horaria) — botox post-consulta estética, ecografía post-consulta gineco, DIU tras consejería, etc.

## 1. Estado actual

Hoy `appointments` tiene una **relación 1:1 con `services`**: la columna `appointments.service_id UUID NOT NULL REFERENCES services(id)` definida en `supabase/migrations/007_appointments.sql:11` y el snapshot de precio en `appointments.price_snapshot NUMERIC(10,2)` (`011_appointment_edit_history.sql:11`). El descuento (`discount_amount`, `discount_reason`, `discount_code_id`, `100_discounts.sql:56-60`) y la duración del slot (`end_time = start_time + service.duration_minutes`, ver `appointment-form-modal.tsx:192`) también asumen un único servicio. El formulario de cita (`app/(dashboard)/scheduler/appointment-form-modal.tsx:11`, `:587`) inserta un solo `service_id`, los reportes financiero y operacional agregan `appt.services?.base_price` (`reports/financial-report.tsx:105-107`, `reports/operational-report.tsx:108-116`), el dashboard del doctor muestra un solo `service_name` (`dashboard/doctor-dashboard.tsx:580,790,855`), y la vista del calendario imprime `services?.name` por cita (`scheduler/day-view.tsx:377`). El módulo de facturación electrónica (`108_einvoice_module.sql`) ya está bien diseñado: tiene tabla **N:N** `einvoice_line_items` con FK opcional a `services(id)` — pero cuando el operador genera un comprobante desde una cita, `components/einvoice/emit-dialog.tsx:298-310` siembra **un único item** desde `appointment.service_id`. Treatment plans sí tienen junction (`treatment_plan_items`, `099_treatment_plan_items_and_links.sql`), demostrando que el equipo ya sabe modelar N:N. **No existe sistema de comisiones** (`grep` por `commission|doctor_payouts` no devuelve nada).

## 2. ¿Es necesario un junction table?

**Sí, es lo correcto** — y la deuda técnica de no hacerlo crecerá rápido cuando llegue el addon de Dermatología (procedimientos múltiples por visita son la norma allí). Hoy el modelo es estrictamente 1:1; los tres lugares donde ya existe N:N (`einvoice_line_items`, `treatment_plan_items`, ambos con `service_id + quantity + unit_price`) son la prueba de que la convención del codebase es junction-table cuando hace falta. Postergarlo significa que cada nuevo consumidor (KPIs, comisiones, integraciones) heredará el supuesto 1:1.

## 3. Tres opciones arquitectónicas

### Opción A — Junction `appointment_services` (recomendada)

Una nueva tabla con `appointment_id`, `service_id`, `quantity`, `unit_price` (snapshot), `discount_amount`, `display_order`, `organization_id`. La columna `appointments.service_id` se conserva temporalmente como "servicio principal" para retrocompatibilidad y se deprecia en una fase posterior, o bien se migra a un trigger que la mantenga sincronizada con la primera fila del junction.

| Pros | Cons |
|---|---|
| Modelo limpio, alineado con `einvoice_line_items` y `treatment_plan_items` | Migración moderada (~80% de los consumidores tocan `service_id`) |
| FK real → integridad referencial, RLS por org natural | Hay que migrar datos existentes (copiar `service_id` → junction con `quantity=1`) |
| Reportes futuros (volumen real de servicios) cuadran sin trucos | Más joins en consultas del scheduler (mitigable con view o select anidado) |
| Permite descuento por línea + descuento global | El cálculo de `end_time` deja de ser trivial (suma de duraciones) |

### Opción B — Múltiples appointments en el mismo slot

Relajar la convención de slot único permitiendo N citas con mismo `doctor_id + appointment_date + start_time` (no hay UNIQUE constraint hoy, así que técnicamente ya funciona).

| Pros | Cons |
|---|---|
| Cero cambio de schema | Cada KPI que cuenta `appointments` sobre-cuenta visitas reales |
| Sale "gratis" en code paths existentes | El calendario muestra dos cards superpuestas — feo y confuso |
| | Atribución (`128_extend_followups_and_appointments_for_attribution.sql`) y triggers (`129_appointments_attribution_trigger.sql`) se duplican |
| | El paciente recibe 2 emails de confirmación, 2 recordatorios WhatsApp |
| | Google Calendar (`106_google_calendar_integration.sql`) sincroniza dos eventos en el mismo horario |
| | Clinical note tiene `UNIQUE(appointment_id)` (`050_clinical_notes.sql:44`) — dos notas separadas para una misma visita |

### Opción C — Campo `additional_services` JSONB en `appointments`

Array tipo `[{service_id, quantity, unit_price}]` en una columna JSONB.

| Pros | Cons |
|---|---|
| Migración minimalista | Sin FK → no hay integridad cuando se borra un service |
| | Reportes via `jsonb_array_elements` — frágil y lento |
| | RLS no se extiende limpiamente al contenido del array |
| | Imposible aplicar descuento por código (`discount_codes.applies_to_service_ids`) granularmente |
| | Tipos de Supabase quedan sucios (Database type generator no enriquece JSONB) |

### Recomendación: **Opción A**

Yenda ya tiene dos junctions equivalentes funcionando bien. Mantener la coherencia del modelo paga dividendos en cada feature siguiente (comisiones, vertical Dermatología, addon de paquetes pre-pagados).

## 4. Implicaciones por área (Opción A)

**DB schema** — nueva migración:
```sql
CREATE TABLE appointment_services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id      uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quantity        integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price      numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_as_appt ON appointment_services(appointment_id);
CREATE INDEX idx_as_service ON appointment_services(service_id);
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;
-- 4 policies usando organization_id IN (SELECT get_user_org_ids())
```
Backfill: `INSERT ... SELECT id, service_id, organization_id, 1, COALESCE(price_snapshot, services.base_price), discount_amount, 0 FROM appointments JOIN services ...`. Mantener `appointments.service_id` poblado para retrocompatibilidad temporal.

**Form UI (`appointment-form-modal.tsx`)** — reemplazar el `<select>` único de servicio (líneas 1139-1158) por un repeater "+ Agregar servicio". Sub-precio editable por línea (heredando `services.base_price`). `end_time` = `start_time + Σ duration_minutes`, o un override manual ("dura lo mismo aunque haya 2 servicios — son simultáneos en este caso").

**Calendar display (`day-view.tsx:377`, `week-view.tsx`)** — concatenar nombres con separador (`"Consulta + Botox"` cuando hay 2; `"Consulta +1"` cuando hay >2). Tooltip con desglose. La altura del card se sigue calculando por `end_time - start_time` del appointment (no por cada servicio).

**Pricing/billing** — `price_snapshot` deja de ser autoritativo; pasa a ser `Σ (unit_price * quantity) - Σ discount_amount` (vista o columna calculada). Mantener `appointments.discount_amount` como descuento global a nivel cita (independiente del per-line).

**Nubefact line items (`emit-dialog.tsx:298-310`, `lib/einvoice/mapper.ts`)** — cambio trivial y bien alineado: el seed inicial pasa de "1 item desde `service_id`" a "N items desde `appointment_services`". El resto del flujo (`computeInvoiceTotals`, `mapItem`) ya soporta N items.

**Treatment plans / budget_records** — `treatment_sessions.appointment_id` es 1:1; si una sesión cubre solo *uno* de los servicios de la cita, hay que decidir si la sesión apunta a `appointment_services.id` (más preciso) o sigue apuntando a `appointment_id`. Recomendado: agregar `treatment_sessions.appointment_service_id` opcional para vincular a la línea exacta. `budget_records` no se afecta (es agregado, no por-línea).

**Clinical history / clinical_notes** — `clinical_notes` tiene `UNIQUE(appointment_id)` (`050_clinical_notes.sql:44`); una sola nota SOAP cubre toda la visita. No se rompe. Si se quiere registrar "qué procedimiento se realizó" en la nota, agregar un campo de array `services_performed` o un sub-bloque, sin tocar el FK 1:1.

**Reportes (`reports/operational-report.tsx:108-143`, `reports/financial-report.tsx:97-115`, `dashboard/doctor-dashboard.tsx`)** — switch de `appointments.services?.name/base_price` a un join por `appointment_services`. KPI "Servicios Top" pasa a contar líneas, no citas. KPI "citas atendidas" sigue contando `appointments.id`. RPCs en migraciones `047`, `060` (admin dashboard) y `074` (doctor stats) usan `price_snapshot` — funciona si mantenemos `price_snapshot = total de la cita`, sin cambios al RPC.

**RLS** — el patrón establecido es `organization_id IN (SELECT get_user_org_ids())` (ver `100_discounts.sql:42-49`). Aplicar idéntico a `appointment_services`.

**Backwards compat** — backfill descrito arriba. La columna `service_id` queda como "servicio principal" o se elimina en una migración v2 cuando todos los consumidores migraron.

## 5. UX

**En creación (caso mayoritario):** repeater de servicios en el formulario de cita. Recepcionista selecciona `Consulta` y luego `+ Agregar servicio` → `Botox`. Precio total se actualiza en vivo. El bloque de descuento sigue funcionando a nivel cita.

**Después de creada (last-minute add-ons, post-visita):** botón **"Agregar servicio"** en el detalle de la cita (sidebar `appointment-sidebar.tsx`). Útil cuando durante la consulta surge "ah y aprovecha que estás aquí, hagamos la ecografía". Insert directo en `appointment_services` sin tocar `start_time/end_time`. Esto es importante porque la realidad clínica peruana es que muchos add-ons se deciden en la consulta misma.

## 6. Estimación de esfuerzo (dev senior, stack Yenda)

| Tarea | Horas |
|---|---|
| Migración + RLS + backfill + tipos generados | 4–6h |
| Refactor form modal (repeater, recompute end_time) | 6–8h |
| Calendar display (day/week views, tooltips) | 3–4h |
| Pricing logic + price_snapshot view | 3–4h |
| Nubefact emit-dialog seed con N items | 2–3h |
| Reportes + dashboards (operational, financial, doctor) | 6–8h |
| Atribución, Google Calendar description, WhatsApp templates | 3–4h |
| Backwards compat, testing E2E, QA con clínica piloto | 6–8h |
| **Total** | **33–45 horas** (≈ 1 semana de dev senior) |

## 7. Casos borde

- **Mismo doctor, mismo paciente, mismo slot pero distinto consultorio** — no aplica por la restricción del founder; se asume mismo room.
- **Cancelación parcial** — paciente cancela el botox pero hace la consulta. Modelar como `appointment_services.status` (`pending|completed|cancelled`) o soft-delete del item. Recomendado: status por línea desde el inicio.
- **Descuento global vs por servicio** — soportar ambos: `appointment_services.discount_amount` (per-línea) + `appointments.discount_amount` (global). Códigos de descuento (`discount_codes.applies_to_service_ids`) ya están listos para per-line.
- **Comisiones diferentes por servicio** — no hay sistema de comisiones hoy, pero la junction lo deja preparado: cuando llegue, se calcula sobre `appointment_services` con `service.commission_rate`.
- **IGV mixto** — `services.igv_affectation` ya existe (`108_einvoice_module.sql:313`). Cada línea del comprobante respeta su propio código → ya soportado.
- **Servicio dentro de treatment plan ya pagado** — si el botox era parte de un plan prepagado, esa línea entra al comprobante con `unit_price=0` o se excluye del cobro, pero sigue contando para "servicios realizados". Recomendado: flag `appointment_services.billable BOOLEAN DEFAULT TRUE`.

## 8. Recomendación final

**Hacerlo ahora, antes del addon de Dermatología** y antes de implementar comisiones — postergarlo significa migrar dos sistemas más adelante en lugar de uno, y duplicar lógica de N:N en el módulo de derm. Riesgo de postergar: cada nuevo consumidor (reporting, addons verticales, comisiones, packs prepagados) heredará el supuesto 1:1 y la deuda técnica se vuelve geométrica.
