-- Rollback 252: elimina el RPC. El historial escrito queda intacto (los
-- motivos ya estampados se conservan); la app degrada a actualizar
-- sale_price directo, sin motivo.
DROP FUNCTION IF EXISTS public.inventory_set_sale_price(uuid, numeric, text);
