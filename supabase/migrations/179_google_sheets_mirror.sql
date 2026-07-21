-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 179: Google Sheets mirror (espejo de citas)
--
-- Extiende la integración de Google existente (mig 106) con un respaldo
-- opcional en Google Sheets. La MISMA fila de google_calendar_integrations
-- (una por org, tokens cifrados, refresh transparente) sostiene ahora dos
-- productos sobre la misma cuenta Google: Calendar (mig 106) y Sheets.
--
--   sheets_enabled       → el cron nocturno espeja las citas de la org a
--                          una hoja de cálculo en el Drive del cliente.
--   sheets_spreadsheet_id→ id del documento que Yenda creó (via scope
--                          drive.file). NULL = aún no creado; la primera
--                          corrida lo crea y guarda el id aquí. Si el
--                          cliente borra el archivo, el cron detecta el 404,
--                          crea uno nuevo y sobreescribe este id.
--
-- El scope drive.file se pide de forma incremental (include_granted_scopes)
-- al reconectar; las orgs ya conectadas no se rompen y la UI detecta por la
-- columna `scope` si falta drive.file para mostrar el CTA de reconexión.
--
-- Datos SOLO operativos en la hoja (Ley 29733): nada de notes, DNI, email
-- ni fecha de nacimiento — la hoja vive fuera de Yenda, en el Drive del
-- cliente. Idempotente: seguro re-ejecutar.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE google_calendar_integrations
  ADD COLUMN IF NOT EXISTS sheets_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sheets_spreadsheet_id text;

COMMENT ON COLUMN google_calendar_integrations.sheets_enabled IS
  'Si TRUE, el cron nocturno /api/cron/sheets-mirror espeja las citas de la org (ventana -30/+90 días) a Google Sheets. Requiere scope drive.file en la columna scope; si no lo tiene, el cron la salta y la UI pide reconectar. Default false = comportamiento idéntico al previo a la mig 179.';

COMMENT ON COLUMN google_calendar_integrations.sheets_spreadsheet_id IS
  'ID del spreadsheet que Yenda creó en el Drive del cliente (scope drive.file). NULL = aún no creado (la próxima corrida lo crea y guarda aquí). Auto-recuperación: si el fetch da 404 (cliente borró el archivo) el cron crea uno nuevo y sobreescribe este valor.';
