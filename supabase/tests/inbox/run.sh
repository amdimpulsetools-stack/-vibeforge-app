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
out=$(psql -h /tmp -p $PORT -U postgres -d inbox_test -v ON_ERROR_STOP=1 -q -f "$HERE/10_inbox_test.sql" 2>&1) || { echo "$out"; exit 1; }
grep -E "PASS|ERROR" <<<"$out"
apply "$ROOT/supabase/migrations/rollbacks/275_whatsapp_inbox_rollback.sql"
apply "$ROOT/supabase/migrations/rollbacks/275_whatsapp_inbox_rollback.sql"
psql -h /tmp -p $PORT -U postgres -d inbox_test -q -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN ASSERT to_regclass('public.wa_messages') IS NULL; ASSERT (SELECT count(*) FROM wa_inbound_messages) = 2; RAISE NOTICE 'PASS  RB rollback x2: quita la 275 y conserva los entrantes'; END \$\$;" 2>&1 | grep PASS
echo "OK"
