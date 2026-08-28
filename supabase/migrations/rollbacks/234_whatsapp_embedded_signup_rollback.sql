-- Rollback de la mig 234: quita las columnas del Embedded Signup.
-- ATENCIÓN: se pierde el PIN de registro y el rastro de qué clínicas
-- conectaron vía popup de Meta (connected_via/coexistence). El token,
-- waba_id y phone_number_id NO se tocan — las conexiones siguen vivas
-- y el envío no se interrumpe. Revertir junto con el deploy que lee
-- estas columnas (ruta /api/whatsapp/embedded-signup y la card de
-- Integraciones).

ALTER TABLE whatsapp_config
  DROP COLUMN IF EXISTS connected_via,
  DROP COLUMN IF EXISTS coexistence,
  DROP COLUMN IF EXISTS register_pin,
  DROP COLUMN IF EXISTS registration_status,
  DROP COLUMN IF EXISTS display_phone_number,
  DROP COLUMN IF EXISTS verified_name;
