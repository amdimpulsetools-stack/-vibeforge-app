-- Safe read-only SQL execution function for the AI assistant
-- Only SELECT queries are permitted; any other DML/DDL raises an exception.
create or replace function ai_readonly_query(query text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
  normalized text;
begin
  normalized := lower(trim(query));

  -- Reject anything that isn't a SELECT
  if not (normalized like 'select%') then
    raise exception 'Only SELECT queries are allowed';
  end if;

  -- Reject dangerous keywords even inside SELECT
  if normalized ~* '(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|execute|do\s+\$|pg_read_file|pg_ls_dir|copy\s)' then
    raise exception 'Query contains forbidden operations';
  end if;

  execute format('select json_agg(row_to_json(t)) from (%s) t', query) into result;
  return coalesce(result, '[]'::json);
end;
$$;

-- Only authenticated users can call this function
revoke all on function ai_readonly_query(text) from public;
grant execute on function ai_readonly_query(text) to authenticated;
