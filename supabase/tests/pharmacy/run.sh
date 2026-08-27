#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Pruebas de invariantes del módulo Farmacia (migs 216/217) contra un
# Postgres DESECHABLE. Mismo método con el que se validó Caja (F3): la
# aritmética fiscal y la atomicidad de "stock y dinero juntos" no se
# comprueban leyendo el SQL, se comprueban ejecutándolo.
#
#   bash supabase/tests/pharmacy/run.sh
#
# Levanta un cluster temporal, aplica el stub del esquema previo
# (00_prelude_stub.sql — solo lo que las migraciones 209..217 tocan) y
# encima las migraciones reales, sin inventar ni una línea de ellas.
# Si el script termina sin error, todos los invariantes se cumplen.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55433}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
HERE="$ROOT/supabase/tests/pharmacy"
DATA=${DATA:-/tmp/pharmacy-pgdata-$$}
SOCK=/tmp

export PATH="$PGBIN:$PATH"

cleanup() {
  pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK" -l "$DATA/log" start >/dev/null
sleep 1

psql -h $SOCK -p $PORT -U postgres -q -c "CREATE DATABASE farmacia_test;"

apply() {
  psql -h $SOCK -p $PORT -U postgres -d farmacia_test -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null
}

apply "$HERE/00_prelude_stub.sql"
for m in 209_inventory_foundation 212_inventory_invariants_f2 \
         213_caja_farmacia_base 214_caja_module 215_caja_rpcs \
         216_pharmacy_module 217_pharmacy_rpcs 232_pharmacy_sale_date; do
  apply "$ROOT/supabase/migrations/$m.sql"
  echo "  aplicada  $m"
done

echo
# 10_ corre como superusuario (bypassa RLS): prueba aritmética y atomicidad.
# 20_ se pone en la piel de un `authenticated`: prueba los permisos.
for t in 10_pharmacy_invariants_test 20_pharmacy_rls_test; do
  psql -h $SOCK -p $PORT -U postgres -d farmacia_test -v ON_ERROR_STOP=1 -q \
    -f "$HERE/$t.sql" 2>&1 | grep -E "PASS|FAIL|TODAS"
done
