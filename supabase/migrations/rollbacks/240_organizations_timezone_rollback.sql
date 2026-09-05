-- Rollback de la mig 240. La app tolera la ausencia de la columna
-- (resolveOrgTimezone → America/Lima), pero el selector de Ajustes daría
-- error al guardar hasta volver a aplicarla.

ALTER TABLE organizations DROP COLUMN IF EXISTS timezone;
