#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Pruebas de la agenda (mig 273 "Por reprogramar") contra un Postgres
# DESECHABLE. initdb no corre como root:
#
#   runuser -u postgres -- bash supabase/tests/agenda/run.sh
#
# Aplica el stub (00_), la 273 DOS veces (idempotencia), las pruebas
# (10_: superusuario + `authenticated` con RLS real), el rollback y su
# verificación (20_). Si termina sin error, todo pasó.
# ═══════════════════════════════════════════════════════════════════
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
# Migraciones: sin el ruido de NOTICE "already exists, skipping".
apply_quiet() { PGOPTIONS='-c client_min_messages=warning' apply "$1"; }
# Muestra PASS/TODAS y cualquier error; los WARNING esperados (D1/D2) se
# ocultan. Si psql falla, el script termina con su código.
run_test() {
  local out rc=0
  out=$(apply "$1" 2>&1) || rc=$?
  grep -E "PASS|TODAS|ERROR|FAIL|CONTEXT" <<<"$out" || true
  return $rc
}

apply_quiet "$HERE/00_prelude_stub.sql"
apply_quiet "$ROOT/supabase/migrations/273_appointment_reschedule_pending.sql"
apply_quiet "$ROOT/supabase/migrations/273_appointment_reschedule_pending.sql"
echo "  aplicada  273 (x2, idempotente)"
run_test "$HERE/10_reschedule_pending_test.sql"
apply_quiet "$ROOT/supabase/migrations/rollbacks/273_appointment_reschedule_pending_rollback.sql"
apply_quiet "$ROOT/supabase/migrations/rollbacks/273_appointment_reschedule_pending_rollback.sql"
echo "  rollback  273 (x2, idempotente)"
run_test "$HERE/20_rollback_check.sql"
echo "OK"
