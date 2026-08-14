-- 212_inventory_invariants_f2.sql
--
-- Dos de los hallazgos que la auditoría matemática de Almacén dejó diferidos
-- a F2. Se resuelven en la base y no en la interfaz a propósito: las dos
-- funciones que los provocarían (ajuste manual de stock y descontinuar un
-- producto) todavía no existen en la app, así que una validación en el
-- formulario protegería a un formulario que nadie ha escrito. La invariante
-- financiera vive aquí abajo y aguanta venga de donde venga la escritura —
-- interfaz futura, script, o SQL a mano.
--
-- Verificado antes de escribirla: los datos de producción ya cumplen ambas
-- (0 ajustes positivos sin costo, 0 productos descontinuados con stock), así
-- que se pueden añadir sin tocar ni una fila.

-- ── 1. Un ajuste que SUMA stock tiene que traer su costo ─────────────────
--
-- El costo promedio ponderado se recalcula con cada entrada. Un ajuste
-- positivo sin `unit_cost` mete unidades gratis en la mezcla: baja el
-- promedio, y con él sube el margen que muestra Rentabilidad. El error no se
-- nota en el momento y ya no se puede deshacer, porque el promedio se arrastra
-- hacia adelante.
--
-- Los contra-asientos quedan fuera: heredan el costo del movimiento que
-- anulan, y deshacer una salida antigua sin costo registrado no debe quedar
-- bloqueado por esto.
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_positive_adjustment_needs_cost
  CHECK (
    movement_type <> 'ajuste'
    OR quantity <= 0
    OR reverses_movement_id IS NOT NULL
    OR unit_cost IS NOT NULL
  );

-- ── 2. No se descontinúa un producto que todavía tiene unidades ──────────
--
-- `is_discontinued` saca al producto de los listados y del control de
-- vencimientos. Con stock distinto de cero, esas unidades quedan huérfanas:
-- siguen en el kardex y siguen contando como capital inmovilizado, pero
-- desaparecen de la vista donde alguien podría darles salida — y si tienen
-- fecha de caducidad, nadie vuelve a verlas.
--
-- Es un trigger y no un CHECK porque la condición depende de otra tabla.
CREATE OR REPLACE FUNCTION inventory_block_discontinue_with_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_stock numeric;
BEGIN
  -- Solo en la transición a descontinuado: reactivar o editar otros campos
  -- de un producto ya descontinuado no debe pasar por aquí.
  IF NEW.is_discontinued IS NOT TRUE OR OLD.is_discontinued IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(quantity), 0)
    INTO current_stock
    FROM inventory_movements
   WHERE product_id = NEW.id;

  IF current_stock <> 0 THEN
    RAISE EXCEPTION
      'No se puede descontinuar "%": todavía tiene % unidades en stock. Da salida a las unidades restantes primero.',
      NEW.name, current_stock
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_block_discontinue_with_stock ON inventory_products;

CREATE TRIGGER trg_inventory_block_discontinue_with_stock
  BEFORE UPDATE OF is_discontinued ON inventory_products
  FOR EACH ROW
  EXECUTE FUNCTION inventory_block_discontinue_with_stock();
