-- Rollback 253. Las citas ya liberadas conservan su end_time acortado (es
-- lo que la agenda mostró); solo se pierde la marca para la reserva online.
ALTER TABLE appointments DROP COLUMN IF EXISTS online_busy_until;
