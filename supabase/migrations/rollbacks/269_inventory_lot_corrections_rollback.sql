-- Rollback 269: quita el RPC, los triggers y la auditoría de lotes. Las
-- correcciones ya hechas quedan en inventory_lots (no se revierten); el
-- historial se pierde con la tabla, así que exportarlo antes si importa.

DROP FUNCTION IF EXISTS public.inventory_update_lot(uuid, text, date, text);
DROP TRIGGER IF EXISTS trg_inventory_lots_audit ON inventory_lots;
DROP FUNCTION IF EXISTS inventory_lots_audit();
DROP TRIGGER IF EXISTS trg_inventory_lots_guard ON inventory_lots;
DROP FUNCTION IF EXISTS inventory_lots_guard();
DROP TABLE IF EXISTS inventory_lot_changes;
