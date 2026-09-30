#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Pruebas de la agenda (mig 273 "Por reprogramar" y mig 274
# "Pre-reserva") contra un Postgres
# DESECHABLE. initdb no corre como root:
#
#   runuser -u postgres -- bash supabase/tests/agenda/run.sh
#
# Aplica los stubs (00_, 01_), la 273 y la 274 DOS veces cada una
# (idempotencia), las pruebas (10_ = 273, 30_ = 274: superusuario +
# `authenticated` con RLS real), el rollback de la 274 y su verificación
# (40_), y el de la 273 y la suya (20_). Si termina sin error, todo pasó.
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
apply_quiet "$HERE/01_prelude_274_stub.sql"
apply_quiet "$ROOT/supabase/migrations/273_appointment_reschedule_pending.sql"
apply_quiet "$ROOT/supabase/migrations/273_appointment_reschedule_pending.sql"
echo "  aplicada  273 (x2, idempotente)"
apply_quiet "$ROOT/supabase/migrations/274_appointment_prereservation.sql"
apply_quiet "$ROOT/supabase/migrations/274_appointment_prereservation.sql"
echo "  aplicada  274 (x2, idempotente)"
run_test "$HERE/10_reschedule_pending_test.sql"
run_test "$HERE/30_prereserva_test.sql"
apply_quiet "$ROOT/supabase/migrations/rollbacks/274_appointment_prereservation_rollback.sql"
apply_quiet "$ROOT/supabase/migrations/rollbacks/274_appointment_prereservation_rollback.sql"
echo "  rollback  274 (x2, idempotente)"
run_test "$HERE/40_prereserva_rollback_check.sql"
apply_quiet "$ROOT/supabase/migrations/rollbacks/273_appointment_reschedule_pending_rollback.sql"
apply_quiet "$ROOT/supabase/migrations/rollbacks/273_appointment_reschedule_pending_rollback.sql"
echo "  rollback  273 (x2, idempotente)"
run_test "$HERE/20_rollback_check.sql"
echo "OK"
