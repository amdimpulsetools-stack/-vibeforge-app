-- Rollback de la mig 260: elimina el RPC del "Resumen de cobros del periodo".
-- La función es nueva en la 260 (no reemplazó a ninguna), así que el
-- rollback es un DROP limpio. No toca datos ni ninguna otra función:
-- get_reports_overview (mig 251), de la que copia las CTEs, sigue intacta.
--
-- Tras aplicarlo, GET /api/reports/custom (y el PDF que lo consume)
-- devolverán 500 con el mensaje de "function does not exist" hasta que se
-- retire también la pestaña de Reportes que los llama.

DROP FUNCTION IF EXISTS public.get_custom_report(uuid, date, date, text[]);
