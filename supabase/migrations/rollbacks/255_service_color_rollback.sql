-- Rollback 255. Las tarjetas vuelven a pintarse solo con el color del doctor.
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_color_hex_chk;
ALTER TABLE services DROP COLUMN IF EXISTS color;
