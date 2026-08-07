-- 195: Repone el regex con límites de palabra de la mig 089 en ai_readonly_query.
-- Ya aplicada en producción el 2026-08-07 vía MCP (mismo contenido).
--
-- La 194 (hotfix de seguridad) reescribió la función desde la versión 010 sin
-- advertir que la 089 ya había arreglado el regex: sin \y, "created_at"
-- contiene "create" y "updated_at" contiene "update", así que casi toda
-- consulta con filtro temporal se rechazaba. Esta migración restaura el
-- cuerpo de la 089 (verbos con \y, checks de pg_sleep/dblink/current_setting,
-- anti stacked-queries) conservando lo que la 194 sí aportó: search_path
-- fijado y statement_timeout de 8s a nivel de función.
CREATE OR REPLACE FUNCTION ai_readonly_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '8s'
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

  EXECUTE format('SELECT json_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION ai_readonly_query(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ai_readonly_query(text) TO authenticated;
