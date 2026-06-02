-- Two pricing decisions applied together (2026-06-02):
--
-- 1. Pacientes ilimitados en los 3 planes.
--    El cap de patients era acumulado total (count(*) FROM patients), nunca se
--    resetea, así que penalizaba a los clientes con más antigüedad sin reflejar
--    ningún costo real. Hoy solo emitía toasts molestos (PRD §5: "NO enforced:
--    patients"). Se elimina como palanca de pricing.
--
-- 2. Independiente: incluir 1 recepcionista.
--    El caso del doctor independiente con secretaria (ej. Dra. Patricia) es la
--    configuración más común de consultorio individual en LATAM. Forzar el salto
--    a Centro Médico (S/349) solo para sumar recepción era fricción innecesaria.
--    Centro Médico sigue diferenciado por 3 doctores + reportes/export + más
--    consultorios; no canibaliza el upgrade.
--
-- Todos los UPDATE aflojan límites — ninguna org queda por encima de su tope.

UPDATE plans
SET max_patients = NULL
WHERE slug IN ('independiente', 'professional');
-- 'enterprise' ya estaba en NULL.

UPDATE plans
SET max_members = 2,
    max_receptionists = 1
WHERE slug = 'independiente';

-- Sanity: max_doctors / max_doctor_members siguen en 1 (la diferencia con
-- Centro Médico sigue siendo 3 doctores). Solo se abre el seat de recepción.
