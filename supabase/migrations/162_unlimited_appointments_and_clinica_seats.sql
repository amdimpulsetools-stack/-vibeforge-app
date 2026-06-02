-- =============================================
-- Migration 162: Citas ilimitadas + corrección de asientos Clínica
-- =============================================
-- Contexto: decisión canónica documentada en PRD § 5 ("Decisiones canónicas")
-- y en el changelog del soft-wall v0.15.16. Las citas defienden cero revenue
-- (rows en Postgres, sin per-call externo) y un cap rompe la operación al
-- cliente. Se eliminan los caps de citas en los planes que aún los tenían.
--
-- Además se corrigen dos valores de la fila Clínica (enterprise) que estaban
-- desalineados con el PRD:
--   * max_members 14 → 15. La cuenta correcta incluye al owner:
--     1 owner + 1 admin + 3 recepción + 10 doctores = 15 filas en
--     organization_members (get_org_usage cuenta TODAS las filas, incl. owner).
--   * max_doctor_members 3 → 10. Era un copy-paste del valor de Centro Médico;
--     un plan que vende "10 doctores" cuyo bucket de asientos-doctor topaba en 3.
--     Efecto secundario visible: /select-plan y /plans mostraban "3 doctores"
--     para Clínica (buildFeatures usa max_doctor_members ?? max_doctors).
--
-- Todos los cambios AFLOJAN límites (NULL = ilimitado, o suben el tope), por lo
-- que ninguna organización existente queda por encima de su límite. Idempotente.
-- =============================================

-- 1. Citas ilimitadas en Independiente y Centro Médico (Clínica ya estaba en NULL)
UPDATE plans
SET max_appointments_per_month = NULL
WHERE slug IN ('independiente', 'professional');

-- 2. Clínica: asientos totales y bucket de doctores alineados al PRD
UPDATE plans
SET max_members = 15,
    max_doctor_members = 10
WHERE slug = 'enterprise';
