#!/usr/bin/env bash
# Pruebas de la mig 275 (bandeja de WhatsApp) en un Postgres desechable:
#   runuser -u postgres -- bash supabase/tests/inbox/run.sh
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55435}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$ROOT/supabase/tests/inbox"
DATA=${DATA:-/tmp/inbox-pgdata-$$}
export PATH="$PGBIN:$PATH"
cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
sleep 1
psql -h /tmp -p $PORT -U postgres -q -c "CREATE DATABASE inbox_test;"
apply() { PGOPTIONS='-c client_min_messages=warning' psql -h /tmp -p $PORT -U postgres -d inbox_test -v ON_ERROR_STOP=1 -q -f "$1"; }
apply "$HERE/00_prelude_stub.sql"
apply "$ROOT/supabase/migrations/206_wa_capture.sql"
# Datos previos a la 275: un entrante capturado por F1 en cada org.
apply "$HERE/05_pre_data.sql"
apply "$ROOT/supabase/migrations/275_whatsapp_inbox.sql"
apply "$ROOT/supabase/migrations/275_whatsapp_inbox.sql"
echo "  aplicada  275 (x2, idempotente)"
apply "$ROOT/supabase/migrations/276_wa_kb_playbook.sql"
apply "$ROOT/supabase/migrations/276_wa_kb_playbook.sql"
echo "  aplicada  276 (x2, idempotente)"
apply "$ROOT/supabase/migrations/277_wa_inbox_perf.sql"
apply "$ROOT/supabase/migrations/277_wa_inbox_perf.sql"
echo "  aplicada  277 (x2, idempotente)"
out=$(psql -h /tmp -p $PORT -U postgres -d inbox_test -v ON_ERROR_STOP=1 -q -f "$HERE/10_inbox_test.sql" 2>&1) || { echo "$out"; exit 1; }
grep -E "PASS|ERROR" <<<"$out"
apply "$ROOT/supabase/migrations/rollbacks/277_wa_inbox_perf_rollback.sql"
apply "$ROOT/supabase/migrations/rollbacks/277_wa_inbox_perf_rollback.sql"
apply "$ROOT/supabase/migrations/rollbacks/276_wa_kb_playbook_rollback.sql"
apply "$ROOT/supabase/migrations/rollbacks/276_wa_kb_playbook_rollback.sql"
psql -h /tmp -p $PORT -U postgres -d inbox_test -q -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN ASSERT to_regclass('public.wa_kb_cases') IS NULL; ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wa_inbox_settings' AND column_name = 'ai_playbook'); ASSERT (SELECT count(*) FROM wa_kb_entries WHERE kind = 'objection') = 0; BEGIN INSERT INTO wa_kb_entries(organization_id, kind, title, content) VALUES ('00000000-0000-0000-0000-00000000000a', 'objection', 't', 'c'); RAISE EXCEPTION 'RB276: el CHECK original no volvió'; EXCEPTION WHEN check_violation THEN NULL; END; RAISE NOTICE 'PASS  RB rollback 276 x2: quita casos y guía, repone el CHECK de tipos'; END \$\$;" 2>&1 | grep PASS
apply "$ROOT/supabase/migrations/rollbacks/275_whatsapp_inbox_rollback.sql"
apply "$ROOT/supabase/migrations/rollbacks/275_whatsapp_inbox_rollback.sql"
psql -h /tmp -p $PORT -U postgres -d inbox_test -q -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN ASSERT to_regclass('public.wa_messages') IS NULL; ASSERT (SELECT count(*) FROM wa_inbound_messages) = 2; ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_conversations' AND policyname = 'Members read own org wa_conversations'); ASSERT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wa_inbound_messages' AND policyname = 'Members read own org wa_inbound_messages'); RAISE NOTICE 'PASS  RB rollback x2: quita la 275 y conserva los entrantes y repone las políticas de la 206'; END \$\$;" 2>&1 | grep PASS
echo "OK"
