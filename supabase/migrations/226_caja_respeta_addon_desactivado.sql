-- ═══════════════════════════════════════════════════════════════════
-- 226 — Caja respeta el flag del addon al desactivar
-- ═══════════════════════════════════════════════════════════════════
-- Bug real (org de la Dra. Patricia, 2026-08-20): el owner desactivó el
-- módulo Caja desde la tarjeta de módulos, pero siguió recibiendo el
-- aviso nocturno de "Cobros fuera de turno".
--
-- Causa: la mig 214 definió que "la FILA de cash_settings es el
-- interruptor del módulo". Pero desactivar el addon desde la UI apaga
-- organization_addons.enabled y NO toca cash_settings (a propósito: la
-- config —arqueo ciego, tolerancias— debe sobrevivir a una reactivación).
-- Resultado: con el addon apagado, caja_stamp_payment seguía marcando
-- cada cobro como "fuera de turno" y el cron caja-sweep seguía avisando.
--
-- Arreglo: el interruptor pasa a ser addon habilitado + fila de config.
-- La config no se borra nunca al desactivar; simplemente deja de actuar.
-- (El cron caja-sweep aplica el mismo filtro del lado de la app.)

CREATE OR REPLACE FUNCTION caja_stamp_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text;
  v_shift uuid;
BEGIN
  -- Sellos de metadata del pago (mig 213): NO dependen del módulo Caja.
  -- created_by y tender_kind se estampan siempre, addon activo o no.
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();  -- NULL con service_role: correcto
  END IF;
  IF NEW.tender_kind IS NULL THEN
    NEW.tender_kind := caja_classify_tender(NEW.payment_method);
  END IF;

  -- Ya viene atado (POS de Farmacia, caja_attach_payment, importador):
  -- se respeta. El trigger no reasigna turnos.
  IF NEW.cash_shift_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Addon Caja desactivado: la config queda en pausa, no se atribuye
  -- nada a turnos y por tanto no se genera "fuera de turno".
  IF NOT EXISTS (
    SELECT 1
      FROM organization_addons oa
     WHERE oa.organization_id = NEW.organization_id
       AND oa.addon_key = 'caja'
       AND oa.enabled
  ) THEN
    RETURN NEW;
  END IF;

  SELECT shift_scope INTO v_scope
    FROM cash_settings
   WHERE organization_id = NEW.organization_id;

  -- Org sin módulo Caja configurado: cero cambio de comportamiento.
  IF v_scope IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_shift
    FROM cash_shifts s
   WHERE s.organization_id = NEW.organization_id
     AND s.status = 'open'
     AND (v_scope = 'organization' OR s.opened_by = auth.uid())
   ORDER BY s.opened_at DESC
   LIMIT 1;

  -- Puede quedar NULL. El pago SE GRABA igual: cobrar jamás depende
  -- de que la caja esté abierta.
  NEW.cash_shift_id := v_shift;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION caja_stamp_payment() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION caja_stamp_payment() IS
  'Caja F3 (mig 214, ajustada en 226): sella created_by/tender_kind siempre; la atribución a turnos exige addon ''caja'' habilitado Y fila en cash_settings. Desactivar el addon pausa el módulo sin perder la configuración.';
