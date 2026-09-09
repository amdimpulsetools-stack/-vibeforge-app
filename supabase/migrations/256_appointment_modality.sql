-- 256: Modalidad por cita (presencial / virtual)
--
-- Pedido de la Dra. Patricia (9-sep-2026): un solo servicio "Primera
-- consulta de fertilidad" con modalidad "Ambos" (mig 038) y elegir en cada
-- cita si es presencial o virtual, sin duplicar servicios.
--
-- Hasta hoy la app NO guardaba si una cita era virtual: lo deducía de que
-- tuviera `meeting_url`. Con un servicio "Ambos", el formulario rellenaba
-- solo el link por defecto del doctor → toda cita de ese servicio salía
-- con camarita aunque fuera presencial, y la confirmación usaba la
-- plantilla virtual.
--
--   modality  'in_person' | 'virtual' | NULL
--             NULL = cita anterior a la migración: se sigue deduciendo como
--             antes (meeting_url presente → virtual). Decisión del founder:
--             las citas viejas quedan como están; el cambio aplica a las
--             nuevas. Fuente única de lectura: lib/appointment-modality.ts.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS modality text;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_modality_chk;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_modality_chk
  CHECK (modality IS NULL OR modality IN ('in_person', 'virtual'));

COMMENT ON COLUMN appointments.modality IS
  'Mig 256: presencial/virtual elegido en la cita. NULL = cita previa (se deduce por meeting_url). Leer siempre vía resolveAppointmentModality() en lib/appointment-modality.ts.';
