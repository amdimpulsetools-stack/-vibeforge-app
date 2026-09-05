-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 240: organizations.timezone — zona horaria civil de cada org.
--
-- Bug reportado 2026-09-04: la Dra. Patricia abrió el dashboard en la vista
-- "Hoy" pasadas las 19:00 y no vio ingresos. Causa: el Server Component
-- calcula `p_today` con `new Date()` en Vercel (UTC); a las 19:00 hora
-- Lima ya es el día siguiente en UTC, así que pedía los ingresos de
-- MAÑANA. Lo mismo en el dashboard de recepción (p_today), en el RPC del
-- doctor (CURRENT_DATE, mig 241) y en los formularios de cobro del
-- cliente (`toISOString()` estampa payment_date de mañana tras las 19:00).
--
-- Hasta hoy el "hoy" estaba parcheado a mano y fijo a America/Lima en
-- varios sitios (facturación, farmacia, crons). Esta columna hace que la
-- zona sea de la ORG: la app la resuelve con lib/org-time.ts (Intl, IANA)
-- y cae a America/Lima si la columna es nula/inválida.
--
-- Aditiva, default = comportamiento actual para todas las orgs existentes.
-- Editable por owner/admin desde Ajustes (el trigger guard de la mig 237
-- solo congela owner_id/is_active).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Lima';

COMMENT ON COLUMN organizations.timezone IS
  'Mig 240: zona horaria IANA de la org (p.ej. America/Lima). Define el "hoy" civil de dashboards, cobros y agenda. La app valida con Intl y cae a America/Lima si es inválida.';

-- Verificación sugerida:
-- SELECT name, timezone FROM organizations;  → todas 'America/Lima'.
