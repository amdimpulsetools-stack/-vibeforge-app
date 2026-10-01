# Banco de rendimiento de Conversaciones (Postgres desechable):
#   runuser -u postgres -- bash supabase/tests/inbox/perf/run.sh
# Siembra 1 000 conversaciones / 50 000 mensajes y mide cada consulta de la
# bandeja con EXPLAIN ANALYZE. Falla si alguna hace un recorrido completo de
# wa_conversations o wa_messages, o supera su tope de tiempo.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORT=${PORT:-55436}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
HERE="$ROOT/supabase/tests/inbox"
DATA=${DATA:-/tmp/inbox-perf-pgdata-$$}
export PATH="$PGBIN:$PATH"
cleanup() { pg_ctl -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
sleep 1
psql -h /tmp -p $PORT -U postgres -q -c "CREATE DATABASE inbox_perf;"
apply() { PGOPTIONS='-c client_min_messages=warning' psql -h /tmp -p $PORT -U postgres -d inbox_perf -v ON_ERROR_STOP=1 -q -f "$1"; }
apply "$HERE/00_prelude_stub.sql"
apply "$ROOT/supabase/migrations/206_wa_capture.sql"
apply "$HERE/05_pre_data.sql"
apply "$ROOT/supabase/migrations/275_whatsapp_inbox.sql"
apply "$ROOT/supabase/migrations/276_wa_kb_playbook.sql"
for f in "$ROOT"/supabase/migrations/27[7-9]_wa_*.sql "$ROOT"/supabase/migrations/28[0-9]_wa_*.sql; do [ -e "$f" ] && apply "$f" && echo "  aplicada  $(basename "$f")"; done
# t_ids y helper t_id() del test funcional (mismos ids de org).
psql -h /tmp -p $PORT -U postgres -d inbox_perf -v ON_ERROR_STOP=1 -q -c "
  CREATE TABLE t_ids (k text PRIMARY KEY, id uuid NOT NULL DEFAULT gen_random_uuid());
  CREATE FUNCTION t_id(p text) RETURNS uuid LANGUAGE sql STABLE AS \$\$ SELECT id FROM t_ids WHERE k = p \$\$;
  INSERT INTO t_ids(k, id) VALUES ('orgA', '00000000-0000-0000-0000-00000000000a'), ('orgB', '00000000-0000-0000-0000-00000000000b');"
start=$(date +%s)
apply "$HERE/perf/20_seed.sql"
echo "  semilla   1 000 conversaciones / 50 000 mensajes en $(( $(date +%s) - start )) s"
out=$(psql -h /tmp -p $PORT -U postgres -d inbox_perf -v ON_ERROR_STOP=1 -q -f "$HERE/perf/30_measure.sql" 2>&1) || { echo "$out" | tail -5; exit 1; }
grep -E "PERF|SIZE|PASS|ERROR" <<<"$out" | sed 's/.*NOTICE: *//'
echo "OK"
