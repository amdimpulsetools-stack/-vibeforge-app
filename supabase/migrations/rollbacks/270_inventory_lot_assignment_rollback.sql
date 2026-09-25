-- Rollback 270: quita el RPC, la guarda y la auditoría de asignaciones de
-- lote. OJO: si ya hay asignaciones, sus pares de ajustes quedan en el
-- kardex (append-only) y el rollback falla al quitar la columna/el motivo
-- mientras existan: exportar y decidir antes. Sin asignaciones, es limpio.

DROP FUNCTION IF EXISTS public.inventory_assign_unlotted(uuid, numeric, uuid, text, date, text);
DROP TRIGGER IF EXISTS trg_inventory_movements_lot_assignment_guard ON inventory_movements;
DROP FUNCTION IF EXISTS inventory_movements_lot_assignment_guard();
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inv_mov_lot_assignment_chk;
DROP INDEX IF EXISTS idx_inventory_movements_lot_assignment;
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS lot_assignment_id;
DROP TABLE IF EXISTS inventory_lot_assignments;

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_code_check;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_reason_code_check CHECK (reason_code IN (
    'saldo_inicial','compra','venta','uso_en_cita','uso_interno',
    'conteo_fisico','rotura','vencido','robo_perdida',
    'error_registro','devolucion_paciente','devolucion_proveedor',
    'donacion','muestra_medica','otro'));
