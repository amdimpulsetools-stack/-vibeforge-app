-- ═══════════════════════════════════════════════════════════════════
-- 223: Addon catalog cleanup before the Dermosalud demo.
--
-- 1. Hide the `aesthetic` addon: it promises "mapa facial de
--    inyectables, tracking de unidades de toxina…" and has ZERO
--    implementation — same phantom-addon situation mig 208 fixed for
--    inventory/lab_integration/telehealth/advanced_reports, but this
--    one was left visible. An org can "activate" it and nothing
--    happens. Hidden until it actually exists.
--
-- 2. Rewrite the `dermatology` description to match what the addon
--    really does today. The seeded copy (mig 091) promised body map,
--    Fitzpatrick scale and consent templates — none of which shipped.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

UPDATE addons SET is_active = false WHERE key = 'aesthetic';

UPDATE addons
SET description = 'Seguimiento fotográfico antes/después: comparador interactivo, galería por paciente, compresión automática de imágenes y protección de fotos sensibles.'
WHERE key = 'dermatology';
