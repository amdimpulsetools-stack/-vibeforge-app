-- 255: Color por servicio en la agenda
--
-- Pedido de la Dra. Patricia (9-sep-2026): distinguir de un vistazo sus
-- consultas de los procedimientos. Hoy la tarjeta toma TODO su color del
-- doctor (fondo pastel + borde izquierdo); el servicio no aporta nada.
--
-- Color opcional por servicio, misma paleta de 10 colores que los doctores.
-- NULL (default) = la tarjeta se pinta exactamente como hasta hoy. Con
-- color: el fondo y el texto usan el del servicio y el borde izquierdo
-- SIGUE siendo el del doctor, para leer "quién" y "qué" en la misma tarjeta.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS color text;

ALTER TABLE services
  DROP CONSTRAINT IF EXISTS services_color_hex_chk;
ALTER TABLE services
  ADD CONSTRAINT services_color_hex_chk
  CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');

COMMENT ON COLUMN services.color IS
  'Mig 255: color hex opcional para la tarjeta en la agenda (fondo + texto). NULL = color del doctor, como siempre. El borde izquierdo es siempre del doctor.';
