-- =============================================
-- VibeForge Database Verification Script
-- Run in Supabase SQL Editor to verify schema integrity
-- Generated: 2026-03-03
-- =============================================

-- =============================================
-- SECTION 1: Verify all tables exist with correct columns
-- =============================================

WITH expected_tables AS (
  SELECT unnest(ARRAY[
    'user_profiles',
    'organizations',
    'organization_members',
    'organization_subscriptions',
    'organization_invitations',
    'plans',
    'plan_addons',
    'payment_history',
    'offices',
    'doctors',
    'doctor_services',
    'doctor_schedules',
    'service_categories',
    'services',
    'appointments',
    'patients',
    'patient_tags',
    'patient_payments',
    'schedule_blocks',
    'lookup_categories',
    'lookup_values',
    'global_variables',
    'email_settings',
    'email_templates'
  ]) AS table_name
),
actual_tables AS (
  SELECT tablename AS table_name
  FROM pg_tables
  WHERE schemaname = 'public'
)
SELECT
  e.table_name,
  CASE WHEN a.table_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  'Table exists' AS check_type
FROM expected_tables e
LEFT JOIN actual_tables a ON e.table_name = a.table_name
ORDER BY e.table_name;


-- =============================================
-- SECTION 2: Verify key columns on each table
-- =============================================

WITH expected_columns AS (
  SELECT * FROM (VALUES
    -- user_profiles
    ('user_profiles', 'id'),
    ('user_profiles', 'full_name'),
    ('user_profiles', 'avatar_url'),
    ('user_profiles', 'role'),
    ('user_profiles', 'phone'),
    ('user_profiles', 'email'),
    ('user_profiles', 'professional_title'),
    ('user_profiles', 'is_founder'),
    ('user_profiles', 'created_at'),
    ('user_profiles', 'updated_at'),

    -- organizations
    ('organizations', 'id'),
    ('organizations', 'name'),
    ('organizations', 'slug'),
    ('organizations', 'logo_url'),
    ('organizations', 'plan'),
    ('organizations', 'is_active'),
    ('organizations', 'organization_type'),
    ('organizations', 'created_at'),
    ('organizations', 'updated_at'),

    -- organization_members
    ('organization_members', 'id'),
    ('organization_members', 'user_id'),
    ('organization_members', 'organization_id'),
    ('organization_members', 'role'),
    ('organization_members', 'is_active'),
    ('organization_members', 'created_at'),
    ('organization_members', 'updated_at'),

    -- organization_subscriptions
    ('organization_subscriptions', 'id'),
    ('organization_subscriptions', 'organization_id'),
    ('organization_subscriptions', 'plan_id'),
    ('organization_subscriptions', 'status'),
    ('organization_subscriptions', 'started_at'),
    ('organization_subscriptions', 'expires_at'),
    ('organization_subscriptions', 'trial_ends_at'),
    ('organization_subscriptions', 'cancelled_at'),
    ('organization_subscriptions', 'external_id'),
    ('organization_subscriptions', 'payment_provider'),
    ('organization_subscriptions', 'mp_preapproval_id'),
    ('organization_subscriptions', 'mp_payer_email'),
    ('organization_subscriptions', 'mp_next_payment_date'),
    ('organization_subscriptions', 'mp_last_payment_status'),
    ('organization_subscriptions', 'created_at'),
    ('organization_subscriptions', 'updated_at'),

    -- organization_invitations
    ('organization_invitations', 'id'),
    ('organization_invitations', 'organization_id'),
    ('organization_invitations', 'email'),
    ('organization_invitations', 'role'),
    ('organization_invitations', 'professional_title'),
    ('organization_invitations', 'invited_by'),
    ('organization_invitations', 'token'),
    ('organization_invitations', 'status'),
    ('organization_invitations', 'expires_at'),
    ('organization_invitations', 'created_at'),

    -- plans
    ('plans', 'id'),
    ('plans', 'slug'),
    ('plans', 'name'),
    ('plans', 'description'),
    ('plans', 'price_monthly'),
    ('plans', 'price_yearly'),
    ('plans', 'currency'),
    ('plans', 'is_active'),
    ('plans', 'is_default'),
    ('plans', 'display_order'),
    ('plans', 'max_members'),
    ('plans', 'max_doctors'),
    ('plans', 'max_offices'),
    ('plans', 'max_patients'),
    ('plans', 'max_appointments_per_month'),
    ('plans', 'max_storage_mb'),
    ('plans', 'max_admins'),
    ('plans', 'max_receptionists'),
    ('plans', 'max_doctor_members'),
    ('plans', 'addon_price_per_office'),
    ('plans', 'addon_price_per_member'),
    ('plans', 'target_audience'),
    ('plans', 'feature_reports'),
    ('plans', 'feature_export'),
    ('plans', 'feature_custom_roles'),
    ('plans', 'feature_api_access'),
    ('plans', 'feature_priority_support'),
    ('plans', 'feature_ai_assistant'),
    ('plans', 'created_at'),
    ('plans', 'updated_at'),

    -- plan_addons
    ('plan_addons', 'id'),
    ('plan_addons', 'organization_id'),
    ('plan_addons', 'addon_type'),
    ('plan_addons', 'quantity'),
    ('plan_addons', 'unit_price'),
    ('plan_addons', 'is_active'),
    ('plan_addons', 'created_at'),
    ('plan_addons', 'updated_at'),

    -- payment_history
    ('payment_history', 'id'),
    ('payment_history', 'organization_id'),
    ('payment_history', 'subscription_id'),
    ('payment_history', 'mp_payment_id'),
    ('payment_history', 'amount'),
    ('payment_history', 'currency'),
    ('payment_history', 'status'),
    ('payment_history', 'payment_type'),
    ('payment_history', 'description'),
    ('payment_history', 'mp_raw_data'),
    ('payment_history', 'created_at'),
    ('payment_history', 'updated_at'),

    -- offices
    ('offices', 'id'),
    ('offices', 'name'),
    ('offices', 'description'),
    ('offices', 'is_active'),
    ('offices', 'display_order'),
    ('offices', 'organization_id'),
    ('offices', 'created_at'),
    ('offices', 'updated_at'),

    -- doctors
    ('doctors', 'id'),
    ('doctors', 'full_name'),
    ('doctors', 'cmp'),
    ('doctors', 'photo_url'),
    ('doctors', 'color'),
    ('doctors', 'is_active'),
    ('doctors', 'organization_id'),
    ('doctors', 'user_id'),
    ('doctors', 'created_at'),
    ('doctors', 'updated_at'),

    -- doctor_services
    ('doctor_services', 'id'),
    ('doctor_services', 'doctor_id'),
    ('doctor_services', 'service_id'),
    ('doctor_services', 'organization_id'),
    ('doctor_services', 'created_at'),

    -- doctor_schedules
    ('doctor_schedules', 'id'),
    ('doctor_schedules', 'doctor_id'),
    ('doctor_schedules', 'day_of_week'),
    ('doctor_schedules', 'start_time'),
    ('doctor_schedules', 'end_time'),
    ('doctor_schedules', 'office_id'),
    ('doctor_schedules', 'is_active'),
    ('doctor_schedules', 'organization_id'),
    ('doctor_schedules', 'created_at'),
    ('doctor_schedules', 'updated_at'),

    -- service_categories
    ('service_categories', 'id'),
    ('service_categories', 'name'),
    ('service_categories', 'description'),
    ('service_categories', 'is_active'),
    ('service_categories', 'display_order'),
    ('service_categories', 'organization_id'),
    ('service_categories', 'created_at'),
    ('service_categories', 'updated_at'),

    -- services
    ('services', 'id'),
    ('services', 'name'),
    ('services', 'category_id'),
    ('services', 'base_price'),
    ('services', 'duration_minutes'),
    ('services', 'is_active'),
    ('services', 'display_order'),
    ('services', 'organization_id'),
    ('services', 'created_at'),
    ('services', 'updated_at'),

    -- appointments
    ('appointments', 'id'),
    ('appointments', 'patient_name'),
    ('appointments', 'patient_phone'),
    ('appointments', 'doctor_id'),
    ('appointments', 'office_id'),
    ('appointments', 'service_id'),
    ('appointments', 'appointment_date'),
    ('appointments', 'start_time'),
    ('appointments', 'end_time'),
    ('appointments', 'status'),
    ('appointments', 'origin'),
    ('appointments', 'payment_method'),
    ('appointments', 'responsible'),
    ('appointments', 'notes'),
    ('appointments', 'patient_id'),
    ('appointments', 'edited_by_name'),
    ('appointments', 'edited_at'),
    ('appointments', 'price_snapshot'),
    ('appointments', 'organization_id'),
    ('appointments', 'created_at'),
    ('appointments', 'updated_at'),

    -- patients
    ('patients', 'id'),
    ('patients', 'dni'),
    ('patients', 'first_name'),
    ('patients', 'last_name'),
    ('patients', 'phone'),
    ('patients', 'email'),
    ('patients', 'status'),
    ('patients', 'origin'),
    ('patients', 'custom_field_1'),
    ('patients', 'custom_field_2'),
    ('patients', 'referral_source'),
    ('patients', 'notes'),
    ('patients', 'document_type'),
    ('patients', 'birth_date'),
    ('patients', 'departamento'),
    ('patients', 'distrito'),
    ('patients', 'is_foreigner'),
    ('patients', 'nationality'),
    ('patients', 'organization_id'),
    ('patients', 'created_at'),
    ('patients', 'updated_at'),

    -- patient_tags
    ('patient_tags', 'id'),
    ('patient_tags', 'patient_id'),
    ('patient_tags', 'tag'),
    ('patient_tags', 'organization_id'),
    ('patient_tags', 'created_at'),

    -- patient_payments
    ('patient_payments', 'id'),
    ('patient_payments', 'patient_id'),
    ('patient_payments', 'appointment_id'),
    ('patient_payments', 'amount'),
    ('patient_payments', 'payment_method'),
    ('patient_payments', 'notes'),
    ('patient_payments', 'payment_date'),
    ('patient_payments', 'organization_id'),
    ('patient_payments', 'created_at'),

    -- schedule_blocks
    ('schedule_blocks', 'id'),
    ('schedule_blocks', 'block_date'),
    ('schedule_blocks', 'start_time'),
    ('schedule_blocks', 'end_time'),
    ('schedule_blocks', 'office_id'),
    ('schedule_blocks', 'all_day'),
    ('schedule_blocks', 'reason'),
    ('schedule_blocks', 'created_by'),
    ('schedule_blocks', 'organization_id'),
    ('schedule_blocks', 'created_at'),

    -- lookup_categories
    ('lookup_categories', 'id'),
    ('lookup_categories', 'slug'),
    ('lookup_categories', 'name'),
    ('lookup_categories', 'description'),
    ('lookup_categories', 'is_system'),
    ('lookup_categories', 'organization_id'),
    ('lookup_categories', 'created_at'),
    ('lookup_categories', 'updated_at'),

    -- lookup_values
    ('lookup_values', 'id'),
    ('lookup_values', 'category_id'),
    ('lookup_values', 'label'),
    ('lookup_values', 'value'),
    ('lookup_values', 'color'),
    ('lookup_values', 'icon'),
    ('lookup_values', 'display_order'),
    ('lookup_values', 'is_active'),
    ('lookup_values', 'is_default'),
    ('lookup_values', 'metadata'),
    ('lookup_values', 'organization_id'),
    ('lookup_values', 'created_at'),
    ('lookup_values', 'updated_at'),

    -- global_variables
    ('global_variables', 'id'),
    ('global_variables', 'name'),
    ('global_variables', 'key'),
    ('global_variables', 'value'),
    ('global_variables', 'description'),
    ('global_variables', 'sort_order'),
    ('global_variables', 'is_active'),
    ('global_variables', 'organization_id'),
    ('global_variables', 'created_at'),

    -- email_settings
    ('email_settings', 'id'),
    ('email_settings', 'organization_id'),
    ('email_settings', 'sender_name'),
    ('email_settings', 'sender_email'),
    ('email_settings', 'reply_to_email'),
    ('email_settings', 'brand_color'),
    ('email_settings', 'email_logo_url'),
    ('email_settings', 'created_at'),
    ('email_settings', 'updated_at'),

    -- email_templates
    ('email_templates', 'id'),
    ('email_templates', 'organization_id'),
    ('email_templates', 'slug'),
    ('email_templates', 'category'),
    ('email_templates', 'name'),
    ('email_templates', 'description'),
    ('email_templates', 'subject'),
    ('email_templates', 'body'),
    ('email_templates', 'is_enabled'),
    ('email_templates', 'channel'),
    ('email_templates', 'timing_value'),
    ('email_templates', 'timing_unit'),
    ('email_templates', 'min_plan_slug'),
    ('email_templates', 'sort_order'),
    ('email_templates', 'created_at'),
    ('email_templates', 'updated_at')
  ) AS t(table_name, column_name)
),
actual_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
)
SELECT
  e.table_name,
  e.column_name,
  CASE WHEN a.column_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  'Column exists' AS check_type
FROM expected_columns e
LEFT JOIN actual_columns a ON e.table_name = a.table_name AND e.column_name = a.column_name
WHERE a.column_name IS NULL  -- Only show failures to reduce noise
ORDER BY e.table_name, e.column_name;


-- =============================================
-- SECTION 3: Verify all triggers are active
-- =============================================

WITH expected_triggers AS (
  SELECT * FROM (VALUES
    -- updated_at triggers
    ('set_updated_at_user_profiles',      'user_profiles'),
    ('set_updated_at_organizations',      'organizations'),
    ('set_updated_at_org_members',        'organization_members'),
    ('set_updated_at_organization_members', 'organization_members'),
    ('set_updated_at_plans',              'plans'),
    ('set_updated_at_org_subs',           'organization_subscriptions'),
    ('set_updated_at_plan_addons',        'plan_addons'),
    ('set_updated_at_offices',            'offices'),
    ('set_updated_at_doctors',            'doctors'),
    ('set_updated_at_doctor_schedules',   'doctor_schedules'),
    ('set_updated_at_service_categories', 'service_categories'),
    ('set_updated_at_services',           'services'),
    ('set_updated_at_appointments',       'appointments'),
    ('set_updated_at_patients',           'patients'),
    ('set_updated_at_lookup_categories',  'lookup_categories'),
    ('set_updated_at_lookup_values',      'lookup_values'),
    ('set_updated_at_email_settings',     'email_settings'),
    ('set_updated_at_email_templates',    'email_templates'),

    -- Auth trigger (on auth.users)
    ('on_auth_user_created',              'users'),

    -- Sync triggers
    ('on_profile_name_change',            'user_profiles'),
    ('on_doctor_name_change',             'doctors'),
    ('on_member_active_change',           'organization_members'),
    ('on_member_delete_deactivate_doctor','organization_members')
  ) AS t(trigger_name, table_name)
),
actual_triggers AS (
  SELECT trigger_name, event_object_table AS table_name
  FROM information_schema.triggers
  WHERE trigger_schema IN ('public', 'auth')

  UNION

  -- Also check pg_trigger for auth schema triggers
  SELECT t.tgname AS trigger_name, c.relname AS table_name
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname IN ('public', 'auth')
    AND NOT t.tgisinternal
)
SELECT
  e.trigger_name,
  e.table_name,
  CASE WHEN a.trigger_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  'Trigger exists' AS check_type
FROM expected_triggers e
LEFT JOIN actual_triggers a ON e.trigger_name = a.trigger_name
ORDER BY e.table_name, e.trigger_name;


-- =============================================
-- SECTION 4: Verify all RPC functions exist
-- =============================================

WITH expected_functions AS (
  SELECT unnest(ARRAY[
    'update_updated_at',
    'handle_new_user',
    'get_user_org_ids',
    'is_org_admin',
    'ai_readonly_query',
    'ensure_user_has_org',
    'find_user_by_email',
    'get_org_plan',
    'get_org_usage',
    'get_founder_stats',
    'get_doctor_personal_stats',
    'accept_invitation',
    'get_invitation_by_token',
    'seed_email_templates',
    'sync_profile_name_to_doctor',
    'sync_doctor_name_to_profile',
    'sync_member_active_to_doctor',
    'deactivate_doctor_on_member_delete'
  ]) AS function_name
),
actual_functions AS (
  SELECT DISTINCT routine_name AS function_name
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
)
SELECT
  e.function_name,
  CASE WHEN a.function_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  'Function exists' AS check_type
FROM expected_functions e
LEFT JOIN actual_functions a ON e.function_name = a.function_name
ORDER BY e.function_name;


-- =============================================
-- SECTION 5: Verify RLS is enabled on all tables
-- =============================================

WITH expected_rls_tables AS (
  SELECT unnest(ARRAY[
    'user_profiles',
    'organizations',
    'organization_members',
    'organization_subscriptions',
    'organization_invitations',
    'plans',
    'plan_addons',
    'payment_history',
    'offices',
    'doctors',
    'doctor_services',
    'doctor_schedules',
    'service_categories',
    'services',
    'appointments',
    'patients',
    'patient_tags',
    'patient_payments',
    'schedule_blocks',
    'lookup_categories',
    'lookup_values',
    'global_variables',
    'email_settings',
    'email_templates'
  ]) AS table_name
),
actual_rls AS (
  SELECT relname AS table_name, relrowsecurity AS rls_enabled
  FROM pg_class
  JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
  WHERE pg_namespace.nspname = 'public'
    AND pg_class.relkind = 'r'
)
SELECT
  e.table_name,
  CASE
    WHEN a.table_name IS NULL THEN 'FAIL (table not found)'
    WHEN a.rls_enabled = true THEN 'PASS'
    ELSE 'FAIL (RLS disabled)'
  END AS status,
  'RLS enabled' AS check_type
FROM expected_rls_tables e
LEFT JOIN actual_rls a ON e.table_name = a.table_name
ORDER BY e.table_name;


-- =============================================
-- SECTION 6: Detect ANY public tables without RLS
-- (Security audit - no table should be exposed)
-- =============================================

SELECT
  c.relname AS table_name,
  'FAIL' AS status,
  'Table exists WITHOUT RLS enabled (security risk)' AS check_type
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
ORDER BY c.relname;


-- =============================================
-- SECTION 7: Verify RLS policies exist per table
-- =============================================

WITH expected_policies AS (
  SELECT * FROM (VALUES
    -- user_profiles
    ('user_profiles',              'Users can view own profile'),
    ('user_profiles',              'Users can update own profile (safe columns)'),
    ('user_profiles',              'Users can insert own profile'),
    ('user_profiles',              'Members can view profiles in same org'),

    -- organizations
    ('organizations',              'org_select_organizations'),
    ('organizations',              'org_insert_organizations'),
    ('organizations',              'org_update_organizations'),
    ('organizations',              'org_delete_organizations'),

    -- organization_members
    ('organization_members',       'Users can view own memberships'),
    ('organization_members',       'Org owner can add members'),
    ('organization_members',       'Org owner can update members'),
    ('organization_members',       'Org owner can delete members'),
    ('organization_members',       'org_select_members'),
    ('organization_members',       'org_insert_members'),
    ('organization_members',       'org_update_members'),
    ('organization_members',       'org_delete_members'),

    -- organization_subscriptions
    ('organization_subscriptions', 'org_subs_select'),
    ('organization_subscriptions', 'org_subs_insert'),
    ('organization_subscriptions', 'org_subs_update'),

    -- organization_invitations
    ('organization_invitations',   'org_admins_manage_invitations'),

    -- plans
    ('plans',                      'plans_select'),

    -- plan_addons
    ('plan_addons',                'plan_addons_select'),
    ('plan_addons',                'plan_addons_insert'),
    ('plan_addons',                'plan_addons_update'),

    -- payment_history
    ('payment_history',            'org_admins_view_payments'),
    ('payment_history',            'service_role_manage_payments'),

    -- offices
    ('offices',                    'org_select_offices'),
    ('offices',                    'org_insert_offices'),
    ('offices',                    'org_update_offices'),
    ('offices',                    'org_delete_offices'),

    -- doctors
    ('doctors',                    'org_select_doctors'),
    ('doctors',                    'org_insert_doctors'),
    ('doctors',                    'org_update_doctors'),
    ('doctors',                    'org_delete_doctors'),

    -- doctor_services
    ('doctor_services',            'org_select_doctor_services'),
    ('doctor_services',            'org_insert_doctor_services'),
    ('doctor_services',            'org_delete_doctor_services'),

    -- doctor_schedules
    ('doctor_schedules',           'org_select_doctor_schedules'),
    ('doctor_schedules',           'org_insert_doctor_schedules'),
    ('doctor_schedules',           'org_update_doctor_schedules'),
    ('doctor_schedules',           'org_delete_doctor_schedules'),

    -- service_categories
    ('service_categories',         'org_select_service_categories'),
    ('service_categories',         'org_insert_service_categories'),
    ('service_categories',         'org_update_service_categories'),
    ('service_categories',         'org_delete_service_categories'),

    -- services
    ('services',                   'org_select_services'),
    ('services',                   'org_insert_services'),
    ('services',                   'org_update_services'),
    ('services',                   'org_delete_services'),

    -- appointments
    ('appointments',               'org_select_appointments'),
    ('appointments',               'org_insert_appointments'),
    ('appointments',               'org_update_appointments'),
    ('appointments',               'org_delete_appointments'),

    -- patients
    ('patients',                   'org_select_patients'),
    ('patients',                   'org_insert_patients'),
    ('patients',                   'org_update_patients'),
    ('patients',                   'org_delete_patients'),

    -- patient_tags
    ('patient_tags',               'org_select_patient_tags'),
    ('patient_tags',               'org_insert_patient_tags'),
    ('patient_tags',               'org_delete_patient_tags'),

    -- patient_payments
    ('patient_payments',           'org_select_patient_payments'),
    ('patient_payments',           'org_insert_patient_payments'),
    ('patient_payments',           'org_update_patient_payments'),
    ('patient_payments',           'org_delete_patient_payments'),

    -- schedule_blocks
    ('schedule_blocks',            'org_select_schedule_blocks'),
    ('schedule_blocks',            'org_insert_schedule_blocks'),
    ('schedule_blocks',            'org_update_schedule_blocks'),
    ('schedule_blocks',            'org_delete_schedule_blocks'),

    -- lookup_categories
    ('lookup_categories',          'org_select_lookup_categories'),
    ('lookup_categories',          'org_insert_lookup_categories'),
    ('lookup_categories',          'org_update_lookup_categories'),
    ('lookup_categories',          'org_delete_lookup_categories'),

    -- lookup_values
    ('lookup_values',              'org_select_lookup_values'),
    ('lookup_values',              'org_insert_lookup_values'),
    ('lookup_values',              'org_update_lookup_values'),
    ('lookup_values',              'org_delete_lookup_values'),

    -- global_variables
    ('global_variables',           'org_select_global_variables'),
    ('global_variables',           'org_insert_global_variables'),
    ('global_variables',           'org_update_global_variables'),
    ('global_variables',           'org_delete_global_variables'),

    -- email_settings
    ('email_settings',             'email_settings_select'),
    ('email_settings',             'email_settings_insert'),
    ('email_settings',             'email_settings_update'),

    -- email_templates
    ('email_templates',            'email_templates_select'),
    ('email_templates',            'email_templates_insert'),
    ('email_templates',            'email_templates_update'),
    ('email_templates',            'email_templates_delete')
  ) AS t(table_name, policy_name)
),
actual_policies AS (
  SELECT tablename AS table_name, policyname AS policy_name
  FROM pg_policies
  WHERE schemaname = 'public'
)
SELECT
  e.table_name,
  e.policy_name,
  CASE WHEN a.policy_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  'RLS policy exists' AS check_type
FROM expected_policies e
LEFT JOIN actual_policies a ON e.table_name = a.table_name AND e.policy_name = a.policy_name
ORDER BY e.table_name, e.policy_name;


-- =============================================
-- SECTION 8: Verify storage buckets exist
-- =============================================

WITH expected_buckets AS (
  SELECT unnest(ARRAY['avatars', 'org-assets']) AS bucket_name
),
actual_buckets AS (
  SELECT id AS bucket_name FROM storage.buckets
)
SELECT
  e.bucket_name,
  CASE WHEN a.bucket_name IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS status,
  'Storage bucket exists' AS check_type
FROM expected_buckets e
LEFT JOIN actual_buckets a ON e.bucket_name = a.bucket_name
ORDER BY e.bucket_name;


-- =============================================
-- SECTION 9: Summary report
-- =============================================

SELECT '=== VERIFICATION SUMMARY ===' AS report;

SELECT
  'Tables' AS category,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t.table_name
  )) AS pass_count,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t.table_name
  )) AS fail_count,
  count(*) AS total
FROM (
  SELECT unnest(ARRAY[
    'user_profiles','organizations','organization_members','organization_subscriptions',
    'organization_invitations','plans','plan_addons','payment_history','offices','doctors',
    'doctor_services','doctor_schedules','service_categories','services','appointments',
    'patients','patient_tags','patient_payments','schedule_blocks','lookup_categories',
    'lookup_values','global_variables','email_settings','email_templates'
  ]) AS table_name
) t

UNION ALL

SELECT
  'RLS Enabled' AS category,
  count(*) FILTER (WHERE c.relrowsecurity = true) AS pass_count,
  count(*) FILTER (WHERE c.relrowsecurity = false) AS fail_count,
  count(*) AS total
FROM (
  SELECT unnest(ARRAY[
    'user_profiles','organizations','organization_members','organization_subscriptions',
    'organization_invitations','plans','plan_addons','payment_history','offices','doctors',
    'doctor_services','doctor_schedules','service_categories','services','appointments',
    'patients','patient_tags','patient_payments','schedule_blocks','lookup_categories',
    'lookup_values','global_variables','email_settings','email_templates'
  ]) AS table_name
) t
LEFT JOIN pg_class c ON c.relname = t.table_name
LEFT JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = 'public'

UNION ALL

SELECT
  'Functions' AS category,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = f.function_name
  )) AS pass_count,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = f.function_name
  )) AS fail_count,
  count(*) AS total
FROM (
  SELECT unnest(ARRAY[
    'update_updated_at','handle_new_user','get_user_org_ids','is_org_admin',
    'ai_readonly_query','ensure_user_has_org','find_user_by_email',
    'get_org_plan','get_org_usage','get_founder_stats','get_doctor_personal_stats',
    'accept_invitation','get_invitation_by_token','seed_email_templates',
    'sync_profile_name_to_doctor','sync_doctor_name_to_profile',
    'sync_member_active_to_doctor','deactivate_doctor_on_member_delete'
  ]) AS function_name
) f;
