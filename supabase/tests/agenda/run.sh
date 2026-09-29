#!/usr/bin/env bash
# Pruebas de la agenda (mig 273) contra un Postgres DESECHABLE.
#   runuser -u postgres -- bash supabase/tests/agenda/run.sh
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55434}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$ROOT/supabase/tests/agenda"
DATA=${DATA:-/tmp/agenda-pgdata-$$}
SOCK=/tmp
export PATH="$PGBIN:$PATH"
cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK" -l "$DATA/log" start >/dev/null
sleep 1
psql -h $SOCK -p $PORT -U postgres -q -c "CREATE DATABASE agenda_test;"
apply() { psql -h $SOCK -p $PORT -U postgres -d agenda_test -v ON_ERROR_STOP=1 -q -f "$1"; }
apply "$HERE/00_prelude_stub.sql"
apply "$ROOT/supabase/migrations/273_appointment_reschedule_pending.sql"
echo "  aplicada  273 (x2, idempotente)"
apply "$ROOT/supabase/migrations/273_appointment_reschedule_pending.sql"
apply "$HERE/10_reschedule_pending_test.sql"
apply "$ROOT/supabase/migrations/rollbacks/273_appointment_reschedule_pending_rollback.sql"
echo "  rollback 273 OK"
