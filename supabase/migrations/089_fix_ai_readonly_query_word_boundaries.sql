-- =============================================
-- Migration 089: Fix ai_readonly_query keyword regex
--
-- The previous regex matched SQL verbs as substrings, so legitimate
-- columns like "created_at" / "updated_at" were rejected as if they
-- contained CREATE / UPDATE statements. This broke nearly every
-- time-filtered AI Assistant query in production.
--
-- Fix: use PostgreSQL word boundaries (\y) for SQL verbs and keep
-- substring matching only for identifiers that can never appear in a
-- legitimate user query (pg_*, information_schema., auth., ...).
-- =============================================

CREATE OR REPLACE FUNCTION ai_readonly_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(trim(query));

  IF normalized NOT LIKE 'select%' AND normalized NOT LIKE 'with%' THEN
    RAISE EXCEPTION 'Solo se permiten consultas SELECT';
  END IF;

  -- Word-bounded SQL verbs — don't match inside identifiers
  IF normalized ~* '\y(insert|update|delete|drop|truncate|alter|grant|revoke|perform|call|load|dblink|lo_import|lo_export)\y' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- CREATE/REPLACE only when followed by a DDL keyword
  IF normalized ~* '\ycreate\s+(or\s+replace\s+)?(table|index|view|schema|function|trigger|role|database|temp|materialized|sequence|extension|policy|rule)\y'
     OR normalized ~* '\yreplace\s+(function|procedure|view|trigger|rule)\y' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- Dynamic SQL verbs
  IF normalized ~* '\yexecute\s+(immediate|format|dynamic|statement)\y' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- System schemas / functions (substring is safe — no user table uses these)
  IF normalized ~* '(pg_read_file|pg_ls_dir|pg_sleep|pg_terminate|pg_cancel|pg_catalog\.|pg_authid|pg_shadow|pg_roles|information_schema\.|auth\.|current_setting\s*\()' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- Session state
  IF normalized ~* '\yset\s+(role|session|local)\y' OR normalized ~* '\yreset\s+(role|all|session)\y' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- File copy
  IF normalized ~* '\ycopy\s+(\w+\s+)?(to|from)\y' THEN
    RAISE EXCEPTION 'La consulta contiene operaciones no permitidas';
  END IF;

  -- Stacked queries
  IF normalized ~ ';\s*\w' THEN
    RAISE EXCEPTION 'No se permiten múltiples consultas';
  END IF;

  SET LOCAL statement_timeout = '5s';

  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION ai_readonly_query(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_readonly_query(text) TO authenticated;
