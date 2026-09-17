-- Rollback 264: elimina los dos RPC y la tabla de auditoría.
--
-- OJO: la tabla guarda el snapshot de los productos eliminados de verdad;
-- borrarla pierde esa auditoría. Los productos archivados NO se tocan: la
-- baja lógica (is_discontinued) es de la mig 209 y sigue vigente.

DROP FUNCTION IF EXISTS public.inventory_archive_or_delete_product(uuid, text);
DROP FUNCTION IF EXISTS public.inventory_restore_product(uuid);

DROP TABLE IF EXISTS inventory_product_deletions;
