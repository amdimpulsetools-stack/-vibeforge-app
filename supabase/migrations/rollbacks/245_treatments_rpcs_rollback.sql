-- Rollback de la mig 245: elimina los RPCs del módulo Tratamientos.

DROP FUNCTION IF EXISTS get_treatments_overview(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS treatment_reopen(UUID);
DROP FUNCTION IF EXISTS treatment_close(UUID, TEXT, TEXT, TEXT, DATE);
DROP FUNCTION IF EXISTS treatment_start_from_budget(UUID, UUID, UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS treatments_caller_role(UUID);
