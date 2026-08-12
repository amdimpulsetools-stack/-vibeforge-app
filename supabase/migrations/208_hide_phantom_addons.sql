-- ============================================================
-- Ocultar addons fantasma del marketplace (hallazgo 2026-08-12)
--
-- La mig 091 sembró el catálogo completo de addons con is_active
-- DEFAULT true — incluidos cuatro que prometen funcionalidad que NO
-- existe en el código: inventory, lab_integration, telehealth y
-- advanced_reports. Ninguna org los tiene activados, pero cualquier
-- owner podía entrar a Settings → Módulos, pulsar "Activar" en
-- "Inventario", recibir un 200… y no pasaba absolutamente nada (sin
-- página, sin sidebar, sin tablas). Un campo minado el día de la
-- instalación del piloto (viernes 14-ago).
--
-- is_active=false los saca del marketplace para todos. Cuando cada
-- módulo se construya de verdad, su migración lo re-activa (patrón
-- Captación, mig 207: nace oculto, grant beta, luego se enciende).
-- Los addons de ESPECIALIDAD (gynecology, dermatology, etc.) no se
-- tocan: esos sí funcionan como etiquetas de especialidad.
-- ============================================================

UPDATE addons
SET is_active = false
WHERE key IN ('inventory', 'lab_integration', 'telehealth', 'advanced_reports')
  -- Paranoia: solo si de verdad nadie los tiene activados. Si alguna
  -- org llegara a tenerlos, mejor fallar en revisión que ocultárselo.
  AND NOT EXISTS (
    SELECT 1 FROM organization_addons oa
    WHERE oa.addon_key = addons.key AND oa.enabled
  );
