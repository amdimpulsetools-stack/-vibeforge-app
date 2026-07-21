-- =============================================
-- Migration 177: Consolidación de asientos + corrección de aritmética (owner)
-- =============================================
-- Contexto: auditoría de billing 2026-07-17. Dos problemas se resuelven juntos,
-- siguiendo el precedente exacto de la mig 162 (que arregló el mismo bug de
-- aritmética de asientos en Clínica/enterprise).
--
-- Problema A — DRIFT de producción en Centro Médico (professional):
--   La fila `professional` de PROD fue editada a mano y sus valores NO existen
--   en ninguna migración (ninguna org queda por encima; solo desalineación
--   entre repo y prod). Las migraciones (mig 020) dicen:
--     max_members=4, max_doctors=2, max_doctor_members=2, max_admins=1,
--     max_receptionists=1, max_offices=2
--   PROD real es:
--     max_members=6, max_doctors=3, max_doctor_members=3, max_admins=1,
--     max_receptionists=2, max_offices=3
--   Esta migración consolida los valores de PROD en el repo → deja de existir
--   el drift.
--
-- Problema B — La aritmética de asientos NO cuenta al owner (mismo bug que 162):
--   get_org_usage cuenta TODAS las filas activas de organization_members,
--   INCLUIDO el owner. Por lo tanto max_members debe incluir al owner:
--     * professional: 1 owner + 1 admin + 2 recepción + 3 doctores = 7 filas.
--       max_members=6 dejaba topado al piloto Vitra (Centro Médico) en 6/6:
--       no podía agregar el admin que el plan anuncia. → max_members = 7.
--     * independiente: 1 owner + 1 doctora + 1 recepcionista = 3 filas (el caso
--       real del piloto Dra. Patricia: doctor con secretaria, cfr. mig 163).
--       PROD max_members=2 la dejaba sobre-límite (3/2). → max_members = 3.
--       (max_doctors y max_doctor_members siguen en 1, max_receptionists en 1:
--        la diferencia con Centro Médico sigue siendo 3 doctores.)
--
-- Todos los cambios AFLOJAN límites (suben topes; ninguno baja), por lo que
-- ninguna organización existente queda por encima de su límite. Idempotente.
-- =============================================

-- 1 + 2. Centro Médico (professional): consolidar valores de PROD y corregir
--        max_members para incluir al owner (6 → 7).
UPDATE plans
SET max_members = 7,          -- era 6 en prod; +1 por el owner (1+1+2+3)
    max_doctors = 3,          -- valor de prod (mig 020 decía 2)
    max_doctor_members = 3,   -- valor de prod (mig 020 decía 2)
    max_admins = 1,           -- valor de prod (= mig 020)
    max_receptionists = 2,    -- valor de prod (mig 020 decía 1)
    max_offices = 3           -- valor de prod (mig 020 decía 2)
WHERE slug = 'professional';

-- 3. Independiente: incluir al owner en la cuenta (2 → 3). max_doctors,
--    max_doctor_members y max_receptionists se mantienen en 1 (ver mig 163).
UPDATE plans
SET max_members = 3
WHERE slug = 'independiente';

-- Fuente: auditoría de billing 2026-07-17. Precedente: mig 162 (misma
-- corrección de "max_members debe incluir al owner" aplicada a enterprise).
