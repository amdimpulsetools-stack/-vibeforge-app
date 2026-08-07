-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 203: índices org-scoped preventivos (Lote 3, ítems 3.2 y 3.3).
--
-- Impacto hoy marginal (clínica piloto, volumen bajo); su valor es evitar
-- degradación al crecer:
--
-- 3.2 — patients(organization_id, last_name, first_name):
--   el listado de /patients ordena SIEMPRE por last_name dentro de la org
--   activa (RLS). Sin este índice, una org con miles de pacientes paga
--   scan + sort por página; con él, el planner lee en orden del índice.
--   (El idx_patients_name de mig 008 es (last_name, first_name) sin org:
--   no sirve para el patrón real org + orden.)
--
-- 3.3 — appointments(organization_id, service_id, appointment_date):
--   respalda los filtros por servicio con rango de fechas del historial y
--   los agregados por servicio de reportes. Relevante recién con decenas
--   de miles de citas.

CREATE INDEX IF NOT EXISTS idx_patients_org_name
  ON patients(organization_id, last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_appointments_org_service_date
  ON appointments(organization_id, service_id, appointment_date);
