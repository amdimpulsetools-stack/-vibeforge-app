#!/usr/bin/env bash
# Postgres 16 desechable (mismo método que supabase/tests/pharmacy/run.sh):
# stub del esquema → mig 251 VERBATIM → borrador get_custom_report → test.
# initdb no corre como root: el cluster vive en el home del usuario
# `postgres` y los .sql (que están en el scratchpad de root) se le pasan
# por stdin, así no hay que mover ni abrir permisos de nada.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55434}
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO=/home/user/-vibeforge-app
PGHOME=/var/lib/postgresql
DATA="$PGHOME/custom_report_pgdata"
SOCK="$PGHOME"
AS_PG="runuser -u postgres --"

cleanup() { $AS_PG "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
rm -rf "$DATA"
$AS_PG "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
$AS_PG "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $SOCK" -l "$DATA/log" start >/dev/null
sleep 1
$AS_PG "$PGBIN/psql" -h "$SOCK" -p $PORT -U postgres -q -c "CREATE DATABASE custom_report_test;"
run() { cat "$1" | $AS_PG "$PGBIN/psql" -h "$SOCK" -p $PORT -U postgres -d custom_report_test -v ON_ERROR_STOP=1 -q; }
run "$HERE/00_stub_schema.sql"                                        >/dev/null && echo "  ok  stub"
run "$REPO/supabase/migrations/251_reports_collected_by_doctor.sql"   >/dev/null && echo "  ok  mig 251 (verbatim)"
run "$HERE/get_custom_report.sql"                                     >/dev/null && echo "  ok  get_custom_report (borrador)"
run "$HERE/10_reconcile_test.sql" > "$HERE/test-output.txt" 2>&1 || { echo "  FALLÓ (ver test-output.txt)"; grep -E "ERROR|FAIL" "$HERE/test-output.txt" | head -20; exit 1; }
grep -E "PASS|FAIL|TODAS" "$HERE/test-output.txt"
