-- =============================================
-- Migration 041: Fix Plan Clínica limits
--
-- Corrige max_doctor_members de 3 a 10 para el plan Clínica.
-- Los psicólogos y otros licenciados no son doctores, por eso
-- el campo se llama "doctor_members" pero representa a todos
-- los especialistas/licenciados/doctores del equipo clínico.
--
-- Plan Clínica composición correcta:
--   - 10 especialistas (doctores/licenciados)
--   - 10 consultorios
--   - 3 recepcionistas
--   - 1 admin
--   - 1 owner (implícito)
--   - Total miembros: 15
--
-- Precios se actualizarán después de pruebas de producción
-- con Mercado Pago. Todo en soles (PEN).
-- =============================================

UPDATE plans SET
  max_doctor_members = 10,
  max_members = 15,
  currency = 'PEN'
WHERE slug = 'enterprise';

-- Asegurar que todos los planes usen PEN como moneda
UPDATE plans SET currency = 'PEN' WHERE currency != 'PEN';
