-- 193: Cierre de superficie RPC (advisors 0028/0029/0011)
-- Ya aplicada en producción el 2026-08-07 vía MCP (mismo contenido).
--
-- a) anon fuera de todas las SECURITY DEFINER de public, salvo allowlist:
--    - get_invitation_by_token: flujo pre-login por token
--    - helpers de policies RLS keyed en auth.uid() (devuelven vacío/false sin
--      sesión; revocarlos convertiría lecturas anon en errores de permiso
--      dentro de las policies que los usan)
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND p.proname NOT IN (
        'get_invitation_by_token',
        'is_org_admin','get_user_org_ids','get_user_org_role','get_org_peer_user_ids',
        'is_doctor_patients_restricted','org_has_insurance_feature','get_own_is_founder'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
  END LOOP;
END $$;

-- b) Solo service-role: fuera también authenticated (todas se llaman con el
--    admin client del servidor; verificado call-site por call-site en el repo)
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'founder_revenue_summary','founder_revenue_compact',
      'get_user_id_by_email','find_user_by_email',
      'anonymize_org','purchase_addon_atomic','reserve_einvoice_correlative',
      'handle_new_user','cleanup_expired_portal_tokens',
      'seed_email_templates','seed_fertility_services','seed_budget_pdf_settings_default',
      'notifications_freeze_routing'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END $$;

-- c) search_path fijo en toda función propia de public que no lo tenga
--    (linter 0011); se excluyen las funciones instaladas por extensiones
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn.sig);
  END LOOP;
END $$;

-- d) Las funciones futuras nacen cerradas. Los default privileges de Supabase
--    otorgaban EXECUTE a anon/authenticated en cada CREATE FUNCTION — causa
--    del drift repo/prod: cada CREATE OR REPLACE reabría los grants aunque la
--    migración original los hubiera revocado. Toda función nueva que necesite
--    ser llamada por clientes debe llevar su GRANT explícito.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
