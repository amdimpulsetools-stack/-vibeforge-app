-- Rollback de la mig 228: elimina el opt-out de recordatorios por
-- servicio. Todas las citas vuelven a recibir recordatorios 24h/2h y
-- confirmaciones automáticas, como antes de la 228. El código tolera
-- la ausencia de la columna solo si también se revierte el deploy que
-- la selecciona — revertir ambos juntos.

ALTER TABLE services
  DROP COLUMN IF EXISTS send_reminders;
