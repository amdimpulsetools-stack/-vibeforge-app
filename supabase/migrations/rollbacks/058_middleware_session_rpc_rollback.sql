-- ═══════════════════════════════════════════════════════════════════
-- ROLLBACK for 058_middleware_session_rpc.sql
-- Removes the RPC function. To fully revert, also restore the old
-- middleware.ts code (the 3 sequential queries version from git).
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS get_user_session_check(uuid);
