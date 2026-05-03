-- ============================================================================
-- Migration 135: prevenir doctores duplicados por user_id + organization_id
-- ============================================================================
--
-- Bug detectado en testeo de invitación de Vitra (2026-05-03):
-- dos rows en `doctors` con el mismo `user_id` + `organization_id` creados
-- con 0.8ms de diferencia. Race condition entre dos paths concurrentes
-- (probablemente accept-invite + un retry/trigger paralelo) — ambos SELECT
-- vieron 0 rows y ambos INSERT crearon su propia fila.
--
-- El fix de aplicación (commit 86cd118) hace SELECT-then-INSERT condicional
-- pero es vulnerable a TOCTOU. Esta constraint cierra el flanco a nivel DB:
-- el segundo INSERT concurrente falla con error 23505 (unique_violation),
-- la app puede capturarlo o ignorarlo (ya tiene el row que necesitaba).
--
-- INDEX PARCIAL: `WHERE user_id IS NOT NULL` permite seguir teniendo doctores
-- "huérfanos" sin auth user (catálogo manual creado por admin desde
-- /admin/doctors), patrón válido del producto. Solo previene duplicados de
-- doctores vinculados a una cuenta auth real.
--
-- Idempotente: `IF NOT EXISTS` permite re-correr sin error.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS doctors_user_org_unique
  ON doctors(user_id, organization_id)
  WHERE user_id IS NOT NULL;

DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes
  FROM (
    SELECT user_id, organization_id, COUNT(*) c
    FROM doctors
    WHERE user_id IS NOT NULL
    GROUP BY user_id, organization_id
    HAVING COUNT(*) > 1
  ) sub;

  IF v_dupes > 0 THEN
    RAISE NOTICE 'Atención: % combinaciones (user_id, organization_id) tienen >1 doctor row. El UNIQUE INDEX no se creará hasta que limpies los duplicados manualmente.', v_dupes;
  ELSE
    RAISE NOTICE 'OK: sin duplicados, UNIQUE INDEX activo.';
  END IF;
END $$;
