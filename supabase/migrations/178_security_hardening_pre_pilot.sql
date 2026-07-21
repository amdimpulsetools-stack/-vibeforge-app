-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 178: hardening de seguridad pre-piloto
--
-- Fuente: Game Day B (auditoría de aislamiento multi-tenant) + security
-- advisors de Supabase, 2026-07-21/22. Dos clínicas piloto competidoras
-- comparten la base: el aislamiento es existencial (Ley 29733).
--
-- Hallazgos que cierra:
-- 1. CRÍTICO — get_report_metrics_for_ai(org_id,...): SECURITY DEFINER
--    sin guard de membresía y con EXECUTE público → cualquier usuario
--    (incluso anon vía /rest/v1/rpc) podía obtener el panel de negocio
--    completo de OTRA org pasando su org_id (citas, ingresos, tasas,
--    orígenes de pacientes). Se revoca EXECUTE a anon/authenticated;
--    los 2 callers legítimos (/api/ai-reports, /api/ai-briefs/generate)
--    pasan a invocarla con service-role TRAS validar membresía (mismo
--    commit). La función queda inalcanzable desde el exterior.
-- 2. MEDIO — find_user_by_email (mig 015b): oráculo global email→user_id
--    sin guard, invocable por cualquier authenticated de cualquier org.
--    Se revoca EXECUTE; su único caller (/api/members POST, gateado a
--    admin/owner) pasa a service-role en el mismo commit.
-- 3. ALTO — tablas cs_* (sistema de contenido ajeno a la app; cero
--    referencias en el repo) con policies USING(true) WITH CHECK(true)
--    abiertas incluso a anon — cs_api_keys incluida (¡claves API
--    legibles/escribibles con la anon key pública!). Se eliminan las
--    policies permisivas: RLS queda activo sin policies = deny-all vía
--    PostgREST. Cualquier herramienta backend con service-role sigue
--    funcionando; si algo usaba la anon key, ESA era la exposición.
-- 4. ERROR advisor — addon_canonical_categories sin RLS: catálogo
--    global, pero escribible por cualquiera con la anon key. RLS on +
--    SELECT para authenticated (la app solo lo lee); sin write policies.
-- 5. MEDIO — user_profiles con INSERT WITH CHECK(true) (policy de
--    signup): permitía a anon insertar perfiles arbitrarios. El signup
--    real crea el perfil vía trigger handle_new_user (SECURITY DEFINER,
--    no necesita policy). Se restringe a auth.uid() = id.
--
-- Todo es revocación/restricción de accesos que la app no usa por esas
-- vías (callers migrados a service-role en el mismo commit). Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- 1. get_report_metrics_for_ai: solo service-role
REVOKE EXECUTE ON FUNCTION public.get_report_metrics_for_ai(uuid, date, date)
  FROM PUBLIC, anon, authenticated;

-- 2. find_user_by_email: solo service-role
REVOKE EXECUTE ON FUNCTION public.find_user_by_email(text)
  FROM PUBLIC, anon, authenticated;

-- 3. cs_*: eliminar policies always-true (deny-all por defecto con RLS on)
DROP POLICY IF EXISTS "cs_accounts_all" ON public.cs_accounts;
DROP POLICY IF EXISTS "cs_activity_log_all" ON public.cs_activity_log;
DROP POLICY IF EXISTS "cs_api_keys_all" ON public.cs_api_keys;
DROP POLICY IF EXISTS "cs_content_items_all" ON public.cs_content_items;
DROP POLICY IF EXISTS "cs_content_metrics_all" ON public.cs_content_metrics;
DROP POLICY IF EXISTS "cs_custom_columns_all" ON public.cs_custom_columns;
DROP POLICY IF EXISTS "cs_profiles_all" ON public.cs_profiles;
DROP POLICY IF EXISTS "Allow all access to task preferences" ON public.cs_task_preferences;
DROP POLICY IF EXISTS "Authenticated users can manage hooks" ON public.cs_hooks;
DROP POLICY IF EXISTS "Authenticated users can manage prompt templates" ON public.cs_prompt_templates;

-- 4. addon_canonical_categories: RLS on + lectura solo authenticated
ALTER TABLE public.addon_canonical_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read canonical categories"
  ON public.addon_canonical_categories;
CREATE POLICY "Authenticated can read canonical categories"
  ON public.addon_canonical_categories FOR SELECT
  TO authenticated
  USING (true);

-- 5. user_profiles: INSERT solo del propio perfil
DROP POLICY IF EXISTS "Allow profile creation on signup" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
