-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 239: services.is_bookable — "Se agenda como cita".
--
-- Feedback Dra. Patricia (fertilidad): los tratamientos TRA (FIV, ICSI,
-- ovodonación…) no deben aparecer en el select de servicios al crear una
-- cita — no son una cita de S/ 20 000, son un tratamiento que se cobra
-- por fases. Hasta hoy el único interruptor era is_active, que apaga el
-- servicio en TODAS las superficies (incluidos presupuestos y planes).
--
-- is_bookable = false ⇒ el servicio NO se lista al crear citas en el
-- scheduler ni en la reserva online pública, pero sigue activo para:
--   - presupuestos de fertilidad (is_budget_eligible / tiers, mig 140)
--   - planes de tratamiento (treatment_plan_items)
--   - citas YA creadas con ese servicio (no se tocan)
--
-- Es un flag de VISIBILIDAD de core (sin gate de addon): cualquier
-- clínica puede tener servicios no agendables. Default true = ningún
-- servicio existente cambia de comportamiento.
--
-- Los filtros de LECTURA en la app son tolerantes (is_bookable !== false),
-- pero el formulario de servicios ESCRIBE la columna al guardar: aplicar
-- esta migración ANTES del deploy (o inmediatamente después; hasta
-- entonces guardar un servicio daría error de columna inexistente).

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN services.is_bookable IS
  'Mig 239: false = no aparece en los selects de crear cita (scheduler y reserva online). Independiente de is_active e is_budget_eligible.';
