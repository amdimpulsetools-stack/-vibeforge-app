-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 199: get_einvoices_kpis — KPIs de /facturacion agregados en SQL
-- (Lote 2, ítem 2.7b).
--
-- PROBLEMA
-- /facturacion calculaba sus 4 KPIs ("Emitido en el período", "Total
-- emitidos", "Pendientes SUNAT", "Rechazados / anulados") en el cliente
-- sobre las filas de la página — máximo 50 (`PAGE_SIZE`). Una org con más de
-- 50 comprobantes en el filtro veía KPIs calculados solo sobre la primera
-- página: montos y conteos incorrectos.
--
-- SOLUCIÓN
-- Un RPC de agregación con LOS MISMOS filtros que la query paginada (rango de
-- issued_at, doc_type, status, serie), llamado en Promise.all con ella. Con
-- ≤50 filas en el filtro los números son idénticos a los de hoy; con más,
-- salen los correctos (ese era el bug). El índice idx_einvoices_org_issued
-- (organization_id, issued_at DESC) respalda el barrido del rango.
--
-- Réplica exacta de la clasificación del cliente:
--   · total_amount / total_count : status IN ('accepted','sending')
--   · pending_count              : 'sending' Ó ('accepted' y sunat_accepted
--                                  no-true — NULL cuenta como pendiente,
--                                  igual que el `!r.sunat_accepted` de JS)
--   · rejected_count             : 'rejected' | 'error' | 'cancelled'
--   · emitted_count              : todas las filas del filtro (el KPI "Total
--                                  emitidos" usaba rows.length)
--
-- Los parámetros de fecha son TIMESTAMPTZ y el cliente manda los mismos
-- literales "YYYY-MM-DDT00:00:00" que mandaba a PostgREST: se interpretan
-- con el mismo TimeZone de la base, así que el corte de día no cambia.
--
-- Seguridad: SECURITY DEFINER filtrado por get_user_org_ids(). GRANT
-- explícito (193(d) dejó los default privileges cerrados), anon fuera.

CREATE OR REPLACE FUNCTION get_einvoices_kpis(
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ,
  p_doc_type INT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_series TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'emitted_count', COUNT(*),
    'total_amount', COALESCE(SUM(total) FILTER (WHERE status IN ('accepted', 'sending')), 0),
    'total_count', COUNT(*) FILTER (WHERE status IN ('accepted', 'sending')),
    'pending_count', COUNT(*) FILTER (
      WHERE status = 'sending'
         OR (status = 'accepted' AND sunat_accepted IS DISTINCT FROM true)
    ),
    'rejected_count', COUNT(*) FILTER (WHERE status IN ('rejected', 'error', 'cancelled'))
  ) INTO result
  FROM einvoices
  WHERE organization_id IN (SELECT get_user_org_ids())
    -- issued_at NULL (borradores nunca emitidos) queda fuera del rango,
    -- igual que con los gte/lte de PostgREST.
    AND issued_at >= p_date_from
    AND issued_at <= p_date_to
    AND (p_doc_type IS NULL OR doc_type = p_doc_type)
    AND (p_status IS NULL OR status = p_status)
    AND (p_series IS NULL OR series = p_series);

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_einvoices_kpis(TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_einvoices_kpis(TIMESTAMPTZ, TIMESTAMPTZ, INT, TEXT, TEXT) TO authenticated;
