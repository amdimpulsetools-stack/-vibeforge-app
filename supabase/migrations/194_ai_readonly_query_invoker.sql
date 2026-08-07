-- 194: ai_readonly_query pasa de SECURITY DEFINER a SECURITY INVOKER.
--
-- Con DEFINER la función ejecutaba el SELECT arbitrario del asistente IA
-- como su owner (postgres), SALTÁNDOSE RLS: cualquier admin de una org
-- podía leer datos de TODAS las organizaciones. Con INVOKER el SELECT
-- corre como el usuario autenticado que llama y RLS aplica el scoping
-- por organización — que es lo que el prompt del asistente ya asumía.
--
-- Además: se acepta WITH ... SELECT (CTEs, necesarias para analítica de
-- crecimiento/porcentajes) y se fija statement_timeout para que una
-- consulta pesada no bloquee conexiones.
create or replace function ai_readonly_query(query text)
returns json
language plpgsql
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
declare
  result json;
  normalized text;
begin
  normalized := lower(trim(query));

  -- Solo SELECT o WITH ... SELECT
  if not (normalized like 'select%' or normalized like 'with%') then
    raise exception 'Only SELECT queries are allowed';
  end if;

  -- Rechazar keywords peligrosos incluso dentro de un SELECT
  if normalized ~* '(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|execute|do\s+\$|pg_read_file|pg_ls_dir|copy\s)' then
    raise exception 'Query contains forbidden operations';
  end if;

  execute format('select json_agg(row_to_json(t)) from (%s) t', query) into result;
  return coalesce(result, '[]'::json);
end;
$$;

revoke all on function ai_readonly_query(text) from public, anon;
grant execute on function ai_readonly_query(text) to authenticated;
