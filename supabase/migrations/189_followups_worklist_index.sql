-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 189: índice de soporte para la cola de trabajo del bucket
-- Pendientes
--
-- ── Qué cambió arriba ─────────────────────────────────────────────
-- `app/api/clinical-followups/dashboard/route.ts` (bucket=pending) dejó
-- de ordenar solo por `expected_by` y ahora ordena como una cola de
-- trabajo:
--
--   ORDER BY last_contacted_at ASC NULLS FIRST,   -- nunca contactadas primero
--            expected_by       ASC NULLS LAST,    -- la más vencida arriba
--            created_at        ASC,               -- desempate estable
--            id                ASC                -- orden total (paginación)
--
-- El `created_at`/`id` del final no son cosméticos: `.range()` sobre un
-- ORDER BY no total puede repetir u omitir filas entre páginas cuando
-- varias comparten fecha.
--
-- ── Por qué el índice es OPCIONAL ─────────────────────────────────
-- La consulta ya está acotada por `organization_id` + `status IN (...)`,
-- que es lo que hace el índice de la mig 128
-- (`organization_id, status, expected_by`). Con los volúmenes actuales
-- (cientos de filas abiertas por clínica) Postgres resuelve el sort en
-- memoria sin problema. Este índice existe para que el orden nuevo no se
-- degrade cuando una clínica acumule miles de seguimientos abiertos.
--
-- ── Por qué parcial ───────────────────────────────────────────────
-- El bucket Pendientes solo mira `pendiente | contactado | pospuesto`
-- (PENDING_STATUSES en el route). Las filas cerradas —que con el tiempo
-- son la mayoría de la tabla— nunca entran a esta consulta, así que
-- quedan fuera del índice: menos páginas que mantener en cada UPDATE de
-- cierre.
--
-- NULLS FIRST en `last_contacted_at` va explícito porque el default de
-- Postgres para ASC es NULLS LAST: sin declararlo, el índice no serviría
-- para este ORDER BY.
--
-- Idempotente: IF NOT EXISTS. Re-aplicarla no cambia nada.
-- Rollback: DROP INDEX IF EXISTS idx_clinical_followups_worklist;
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_clinical_followups_worklist
  ON clinical_followups (
    organization_id,
    last_contacted_at ASC NULLS FIRST,
    expected_by ASC NULLS LAST,
    created_at ASC,
    id ASC
  )
  WHERE status IN ('pendiente', 'contactado', 'pospuesto');

COMMENT ON INDEX idx_clinical_followups_worklist IS
  'Mig 189: soporta el ORDER BY de la cola de trabajo del bucket Pendientes (last_contacted_at NULLS FIRST → expected_by → created_at → id). Parcial sobre los tres estados abiertos: las filas cerradas nunca entran a esa consulta.';
