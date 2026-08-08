-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 204: registro de ejecuciones de crons (Panel CEO, Fase 1).
--
-- PROBLEMA: ningún cron dejaba constancia de haber corrido — solo efectos
-- secundarios (billing_events, reminder_logs). "¿Corrió billing-status
-- ayer?" no era respondible, y la página Health del founder panel mostraba
-- estados HARDCODEADOS ("webhook ok") en vez de verificar nada (auditoría
-- 2026-08-08). Con el Cron Bridge de GitHub Actions como único disparador
-- real, un secret desalineado apaga TODOS los crons en silencio.
--
-- SOLUCIÓN: tabla append-mostly que cada cron escribe al empezar y al
-- terminar (helper lib/cron-runs.ts). El Panel CEO/Health leen la última
-- corrida por cron y alertan si un cron diario lleva >36h sin correr.
--
-- Acceso: solo service_role (los crons y los endpoints founder usan admin
-- client). RLS habilitado SIN policies = nadie más lee ni escribe.

CREATE TABLE IF NOT EXISTS cron_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name   TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  ok          BOOLEAN,
  -- Resumen JSON del resultado (contadores que ya devuelve cada cron) o
  -- mensaje de error. Sin PHI: solo números y nombres de pasos.
  summary     JSONB
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_name_started
  ON cron_runs(cron_name, started_at DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;
