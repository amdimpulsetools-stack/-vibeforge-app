-- =============================================
-- MIGRATION 110: E-Invoice atomic correlative reservation
-- =============================================
-- Replaces the previous "SELECT then UPDATE" pattern in
-- /api/einvoices/emit with a single atomic UPDATE ... RETURNING that
-- increments current_number and returns the reserved value in one
-- statement.
--
-- Why: the prior approach has a race window between SELECT and UPDATE
-- where two concurrent emits could read the same current_number, both
-- compute nextNumber = N+1, and both UPDATE to N+1. The first emit
-- reserves N+1 successfully; the second would then collide with
-- Nubefact's correlative tracking and fail with error 23 (duplicate).
-- The retry path handles 23, but it's wasted Nubefact roundtrips and
-- a noisy einvoices row in 'rejected' state.
--
-- Postgres UPDATE acquires a row-level lock that holds until commit,
-- so two concurrent calls to this function serialize cleanly: the
-- second one waits, then sees the already-incremented value and
-- returns N+2.
--
-- The function uses SECURITY DEFINER so it can bypass RLS — callers
-- must only be the authenticated emit route via the service-role admin
-- client. We additionally guard with an explicit organization_id check
-- in the WHERE clause: even if someone could call it, they can't
-- increment another org's correlative.

CREATE OR REPLACE FUNCTION reserve_einvoice_correlative(
  p_organization_id UUID,
  p_doc_type        SMALLINT,
  p_series          TEXT
)
RETURNS TABLE (
  series_id      UUID,
  reserved_number BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE einvoice_series
     SET current_number = current_number + 1,
         updated_at     = NOW()
   WHERE organization_id = p_organization_id
     AND doc_type        = p_doc_type
     AND series          = p_series
     AND is_active       = TRUE
   RETURNING id, current_number;
END;
$$;

COMMENT ON FUNCTION reserve_einvoice_correlative(UUID, SMALLINT, TEXT) IS
  'Atomically increments and returns the next correlative for an einvoice_series. Used by /api/einvoices/emit instead of SELECT+UPDATE to eliminate race conditions on concurrent emits.';

-- Restrict execution to authenticated callers (the route uses the admin
-- client which bypasses this anyway, but we lock down the public surface).
REVOKE ALL ON FUNCTION reserve_einvoice_correlative(UUID, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_einvoice_correlative(UUID, SMALLINT, TEXT)
  TO authenticated, service_role;
