-- Rollback 271: quita el RPC, el trigger y el historial de ediciones de
-- producto. Las ediciones ya hechas quedan en inventory_products (no se
-- revierten); el historial se pierde con la tabla, exportarlo antes si importa.

DROP FUNCTION IF EXISTS public.inventory_update_product(uuid, text, text, text, numeric, boolean, text);
DROP TRIGGER IF EXISTS trg_inventory_products_audit ON inventory_products;
DROP FUNCTION IF EXISTS inventory_products_audit();
DROP TABLE IF EXISTS inventory_product_changes;
