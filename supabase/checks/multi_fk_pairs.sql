-- ═══════════════════════════════════════════════════════════════════
-- Chequeo: pares de tablas con MÁS DE UNA relación (FK) entre sí
-- SOLO LECTURA — no crea, no modifica, no bloquea nada. Seguro en prod.
--
-- POR QUÉ (incidente 30-sep-2026): la mig 273 agregó una SEGUNDA FK
-- patient_payments → appointments (transferred_from_appointment_id).
-- Con dos relaciones entre las mismas tablas, PostgREST ya no sabe cuál
-- usar en un embed sin hint como `patient_payments(amount)` y responde
-- PGRST201 ("more than one relationship was found"). La consulta de la
-- agenda falló y la grilla se vio vacía. Las pruebas de migración
-- (Postgres local) no lo ven: el error nace en PostgREST, no en SQL.
--
-- CUÁNDO CORRERLA (SQL Editor de Supabase o MCP execute_sql):
--   1. ANTES de aplicar cualquier migración que agregue una FK
--      (REFERENCES / FOREIGN KEY):
--        · Consulta 2 con las dos tablas de cada FK nueva: si ya existe
--          alguna FK entre ellas, la nueva las vuelve AMBIGUAS.
--        · Consulta 1: guarda el resultado (línea base).
--   2. DESPUÉS de aplicarla: Consulta 1 otra vez y compara. Toda fila
--      NUEVA (o un n_fks que subió) es un par cuyos embeds sin hint
--      acaban de romperse.
--      → Quitar la FK (preferido: columna de rastro SIN FK) o, si es
--        imprescindible, dejar TODOS los embeds de ese par con hint
--        explícito `tabla!nombre_constraint(...)` en el mismo PR.
--   3. Luego /api/health/schema como owner/admin (ver
--      docs/migraciones-checklist.md).
--
-- OJO: el SQL Editor de Supabase muestra SOLO el resultado de la última
-- sentencia. Selecciona cada consulta y ejecútala por separado.
--
-- Una fila en la lista NO es un error en sí: significa "todo embed entre
-- estas dos tablas NECESITA hint". Lo peligroso es que aparezca una fila
-- nueva sin que el código se haya preparado.
--
-- Autorreferencias (tabla → sí misma): PostgREST ve DOS caminos (padre e
-- hijos), así que embeber la tabla dentro de sí misma siempre exige hint.
-- ═══════════════════════════════════════════════════════════════════


-- ── Consulta 1 (PRINCIPAL): pares con 2+ FKs y autorreferencias ─────
WITH fks AS (
  SELECT
    c.conname::text                                   AS conname,
    c.conrelid,
    c.confrelid,
    c.conrelid::regclass::text                        AS from_table,
    c.confrelid::regclass::text                       AS to_table,
    (SELECT string_agg(a.attname::text, ', ' ORDER BY k.ord)
       FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a
         ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS from_cols,
    (SELECT string_agg(a.attname::text, ', ' ORDER BY k.ord)
       FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
       JOIN pg_attribute a
         ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS to_cols
  FROM pg_constraint c
  JOIN pg_class      src  ON src.oid  = c.conrelid
  JOIN pg_namespace  srcn ON srcn.oid = src.relnamespace
  JOIN pg_class      dst  ON dst.oid  = c.confrelid
  JOIN pg_namespace  dstn ON dstn.oid = dst.relnamespace
  WHERE c.contype = 'f'
    AND c.conparentid = 0          -- sin las copias por partición
    AND srcn.nspname = 'public'
    AND dstn.nspname = 'public'
),
keyed AS (
  -- Par NO ordenado: A→B y B→A cuentan como el mismo par.
  SELECT fks.*,
         LEAST(from_table, to_table)    AS tabla_a,
         GREATEST(from_table, to_table) AS tabla_b
  FROM fks
)
SELECT
  CASE WHEN tabla_a = tabla_b THEN 'autorreferencia'
       ELSE 'par con varias FKs' END                        AS tipo,
  tabla_a,
  tabla_b,
  count(*)                                                  AS n_fks,
  string_agg(conname, ', ' ORDER BY conname)                AS constraints,
  string_agg(format('%s: %s(%s) -> %s(%s)',
                    conname, from_table, from_cols, to_table, to_cols),
             ' | ' ORDER BY conname)                        AS detalle
FROM keyed
GROUP BY tabla_a, tabla_b
HAVING count(*) >= 2 OR tabla_a = tabla_b
ORDER BY (tabla_a = tabla_b), tabla_a, tabla_b;


-- ── Consulta 2 (ANTES de agregar una FK): ¿ya hay relación entre ellas? ─
-- Edita los dos nombres (orden indiferente; iguales = autorreferencia).
-- 0 filas → la FK nueva será la única entre ambas: sin ambigüedad.
-- 1+ filas → la FK nueva vuelve ambiguos los embeds de este par: evítala
-- (columna sin FK) o agrega hint a TODOS los embeds del par en el mismo PR.
WITH par(tabla_1, tabla_2) AS (
  VALUES ('patient_payments', 'appointments')   -- ← EDITAR
)
SELECT
  c.conname                 AS constraint_existente,
  c.conrelid::regclass      AS desde,
  c.confrelid::regclass     AS hacia
FROM par, pg_constraint c
JOIN pg_class     s  ON s.oid  = c.conrelid
JOIN pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_class     d  ON d.oid  = c.confrelid
JOIN pg_namespace dn ON dn.oid = d.relnamespace
WHERE c.contype = 'f'
  AND c.conparentid = 0
  AND sn.nspname = 'public'
  AND dn.nspname = 'public'
  AND (   (s.relname = par.tabla_1 AND d.relname = par.tabla_2)
       OR (s.relname = par.tabla_2 AND d.relname = par.tabla_1))
ORDER BY c.conname;


-- ── Consulta 3: los hints por NOMBRE de constraint que usa el código ─
-- Un hint `tabla!nombre_fkey(...)` cuyo constraint no existe (renombrado,
-- borrado, o aún sin aplicar) rompe la consulta con PGRST200. Toda fila
-- con existe = false es una pantalla rota. Lista vigente al 30-sep-2026;
-- para regenerarla:
--   grep -rhoE "[a-z_]+![a-z_]+_fkey" app lib components hooks | sort -u
SELECT
  h.hint,
  h.usado_en,
  EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND c.conname = h.hint
  ) AS existe
FROM (VALUES
  ('patient_payments_appointment_id_fkey',
   'agenda (scheduler/page.tsx), live-notifications/emit'),
  ('budget_records_followup_id_fkey',
   'bandeja de seguimientos (clinical-followups/dashboard)'),
  ('clinical_notes_appointment_id_fkey',
   'notas clínicas (api/clinical-notes)'),
  ('patient_photo_comparisons_before_photo_id_fkey',
   'dermatología: comparación (api/dermatology/comparisons)'),
  ('patient_photo_comparisons_after_photo_id_fkey',
   'dermatología: comparación (api/dermatology/comparisons)')
) AS h(hint, usado_en)
ORDER BY existe, h.hint;


-- ── Consulta 4 (complementaria): tablas puente muchos-a-muchos ──────
-- PostgREST también arma una relación A↔B a través de una tabla puente
-- cuya PRIMARY KEY incluye FKs hacia A y hacia B. Si además hay FK
-- directa entre A y B (o dos puentes para el mismo par), el embed A↔B sin
-- hint también es ambiguo. Suele devolver pocas filas; revisa solo si la
-- migración crea una tabla con PK compuesta.
WITH pk AS (
  SELECT c.conrelid, c.conkey
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE c.contype = 'p' AND n.nspname = 'public'
),
pk_fks AS (
  -- FKs cuyas columnas están todas dentro de la PK de su tabla.
  SELECT f.conrelid AS puente, f.confrelid AS destino, f.conname::text AS conname
  FROM pg_constraint f
  JOIN pk ON pk.conrelid = f.conrelid
  JOIN pg_class dst ON dst.oid = f.confrelid
  JOIN pg_namespace dstn ON dstn.oid = dst.relnamespace
  WHERE f.contype = 'f'
    AND f.conparentid = 0
    AND dstn.nspname = 'public'
    AND f.conkey <@ pk.conkey
)
SELECT
  a.puente::regclass::text                                   AS tabla_puente,
  LEAST(a.destino::regclass::text, b.destino::regclass::text)    AS tabla_a,
  GREATEST(a.destino::regclass::text, b.destino::regclass::text) AS tabla_b,
  a.conname || ', ' || b.conname                             AS constraints
FROM pk_fks a
JOIN pk_fks b
  ON b.puente = a.puente
 AND a.destino::regclass::text < b.destino::regclass::text
ORDER BY tabla_a, tabla_b, tabla_puente;
