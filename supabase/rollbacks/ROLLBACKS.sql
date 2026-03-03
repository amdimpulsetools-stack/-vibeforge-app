-- ╔═══════════════════════════════════════════════════════════════╗
-- ║           VIBEFORGE — MIGRATION ROLLBACKS                    ║
-- ║                                                               ║
-- ║  USO: Copia SOLO la sección de la migración que quieres      ║
-- ║  revertir y pégala en Supabase SQL Editor.                   ║
-- ║                                                               ║
-- ║  ⚠️  SIEMPRE haz pg_dump ANTES de ejecutar un rollback.      ║
-- ║  ⚠️  Ejecuta los rollbacks en ORDEN INVERSO (030 → 029 →…)  ║
-- ║  ⚠️  Algunos rollbacks PIERDEN datos (marcados con 💀)       ║
-- ╚═══════════════════════════════════════════════════════════════╝


-- ============================================================
-- ROLLBACK 030: Member deactivation + Reverse name sync
-- Riesgo: BAJO (solo triggers/functions y 1 columna)
-- ============================================================
DROP TRIGGER IF EXISTS on_member_delete_deactivate_doctor ON organization_members;
DROP TRIGGER IF EXISTS on_member_active_change ON organization_members;
DROP TRIGGER IF EXISTS on_doctor_name_change ON doctors;
DROP FUNCTION IF EXISTS deactivate_doctor_on_member_delete();
DROP FUNCTION IF EXISTS sync_member_active_to_doctor();
DROP FUNCTION IF EXISTS sync_doctor_name_to_profile();
ALTER TABLE organization_members DROP COLUMN IF EXISTS is_active;


-- ============================================================
-- ROLLBACK 029: Seed organization subscriptions
-- Riesgo: BAJO (solo borra suscripciones creadas por seed)
-- ============================================================
DELETE FROM organization_subscriptions
WHERE payment_provider = 'manual'
  AND started_at > now() - interval '1 hour';
-- Nota: solo borra las creadas recientemente por este seed


-- ============================================================
-- ROLLBACK 028: Sync doctor name + cleanup duplicates
-- Riesgo: MEDIO (trigger, function, datos ya migrados no se revierten)
-- ============================================================
DROP TRIGGER IF EXISTS on_profile_name_change ON user_profiles;
DROP FUNCTION IF EXISTS sync_profile_name_to_doctor();
-- ⚠️ Los doctores duplicados ya mergeados no se pueden deshacer automáticamente


-- ============================================================
-- ROLLBACK 027: Fix doctor linking
-- Riesgo: BAJO (solo reescribe funciones)
-- Restaura accept_invitation y get_doctor_personal_stats a versión 026
-- ============================================================
-- Ejecuta la migración 026 completa para restaurar get_doctor_personal_stats
-- Ejecuta la migración 025 completa para restaurar accept_invitation
-- ⚠️ Los doctores ya mergeados por el DO $$ block no se revierten


-- ============================================================
-- ROLLBACK 026: Auto-link doctor on dashboard
-- Riesgo: BAJO (solo reescribe función)
-- Restaura get_doctor_personal_stats a versión 020
-- ============================================================
-- Ejecuta la función get_doctor_personal_stats de la migración 020


-- ============================================================
-- ROLLBACK 025: Auto-link doctor on invite
-- Riesgo: BAJO (solo reescribe función)
-- Restaura accept_invitation a versión 023
-- ============================================================
-- Ejecuta la función accept_invitation de la migración 023


-- ============================================================
-- ROLLBACK 024: Seed email data for new orgs
-- Riesgo: BAJO (solo reescribe funciones)
-- Restaura handle_new_user y ensure_user_has_org a versión 023
-- ============================================================
-- Ejecuta la función handle_new_user de la migración 023
-- Ejecuta la función ensure_user_has_org de la migración 014


-- ============================================================
-- ROLLBACK 023: Organization invitations
-- Riesgo: 💀 ALTO (borra tabla con datos de invitaciones)
-- ============================================================
DROP FUNCTION IF EXISTS accept_invitation(UUID);
DROP INDEX IF EXISTS idx_invitations_email;
DROP INDEX IF EXISTS idx_invitations_token;
DROP INDEX IF EXISTS idx_invitations_org;
DROP INDEX IF EXISTS idx_invitations_status;
DROP POLICY IF EXISTS "org_admins_manage_invitations" ON organization_invitations;
DROP POLICY IF EXISTS "anyone_can_read_by_token" ON organization_invitations;
DROP TABLE IF EXISTS organization_invitations CASCADE;
-- También restaurar handle_new_user a versión 020 (sin check de invitations)


-- ============================================================
-- ROLLBACK 022: Email settings & templates
-- Riesgo: 💀 ALTO (borra tablas con configuración de emails)
-- ============================================================
DROP FUNCTION IF EXISTS seed_email_templates(UUID);
DROP POLICY IF EXISTS "email_templates_select" ON email_templates;
DROP POLICY IF EXISTS "email_templates_insert" ON email_templates;
DROP POLICY IF EXISTS "email_templates_update" ON email_templates;
DROP POLICY IF EXISTS "email_templates_delete" ON email_templates;
DROP INDEX IF EXISTS idx_email_templates_org;
DROP INDEX IF EXISTS idx_email_templates_category;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP POLICY IF EXISTS "email_settings_select" ON email_settings;
DROP POLICY IF EXISTS "email_settings_insert" ON email_settings;
DROP POLICY IF EXISTS "email_settings_update" ON email_settings;
DROP TABLE IF EXISTS email_settings CASCADE;


-- ============================================================
-- ROLLBACK 021: Test pricing + Mercado Pago
-- Riesgo: MEDIO (revierte precios, borra payment_history)
-- ============================================================
-- Revertir precios a los de migración 020
UPDATE plans SET price_monthly = 0,   price_yearly = NULL, currency = 'USD' WHERE slug = 'starter';
UPDATE plans SET price_monthly = 49,  price_yearly = 490,  currency = 'USD' WHERE slug = 'professional';
UPDATE plans SET price_monthly = 149, price_yearly = 1490, currency = 'USD' WHERE slug = 'enterprise';

-- Quitar campos de Mercado Pago
ALTER TABLE organization_subscriptions
  DROP COLUMN IF EXISTS mp_preapproval_id,
  DROP COLUMN IF EXISTS mp_payer_email,
  DROP COLUMN IF EXISTS mp_next_payment_date,
  DROP COLUMN IF EXISTS mp_last_payment_status;

-- 💀 Borrar historial de pagos MP
DROP POLICY IF EXISTS "org_admins_view_payments" ON payment_history;
DROP POLICY IF EXISTS "service_role_manage_payments" ON payment_history;
DROP INDEX IF EXISTS idx_payment_history_org;
DROP INDEX IF EXISTS idx_payment_history_mp_id;
DROP INDEX IF EXISTS idx_payment_history_sub;
DROP TABLE IF EXISTS payment_history CASCADE;


-- ============================================================
-- ROLLBACK 020: Multi-tier plans & role system
-- Riesgo: 💀 ALTO (cambia roles, estructura de planes)
-- ============================================================
-- Revertir roles expandidos
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));
UPDATE organization_members SET role = 'member' WHERE role IN ('doctor', 'receptionist');

-- Quitar user_id de doctors
ALTER TABLE doctors DROP COLUMN IF EXISTS user_id;

-- Quitar organization_type
ALTER TABLE organizations DROP COLUMN IF EXISTS organization_type;

-- Quitar is_founder
ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_founder;

-- Quitar columnas extras de plans
ALTER TABLE plans
  DROP COLUMN IF EXISTS max_admins,
  DROP COLUMN IF EXISTS max_receptionists,
  DROP COLUMN IF EXISTS max_doctor_members,
  DROP COLUMN IF EXISTS addon_price_per_office,
  DROP COLUMN IF EXISTS addon_price_per_member,
  DROP COLUMN IF EXISTS target_audience,
  DROP COLUMN IF EXISTS feature_ai_assistant;

-- Borrar plan_addons
DROP POLICY IF EXISTS "plan_addons_select" ON plan_addons;
DROP POLICY IF EXISTS "plan_addons_insert" ON plan_addons;
DROP POLICY IF EXISTS "plan_addons_update" ON plan_addons;
DROP TABLE IF EXISTS plan_addons CASCADE;

-- Restaurar RPCs a versión 016
DROP FUNCTION IF EXISTS get_founder_stats();
DROP FUNCTION IF EXISTS get_doctor_personal_stats(UUID, UUID);
-- Ejecutar get_org_plan y get_org_usage de migración 016


-- ============================================================
-- ROLLBACK 019: Patient/appointment enhancements
-- Riesgo: MEDIO (altera constraints y columnas)
-- ============================================================
-- Revertir status constraint
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled'));
-- ⚠️ Esto falla si existen citas con status='no_show', cámbialas primero:
-- UPDATE appointments SET status = 'cancelled' WHERE status = 'no_show';

ALTER TABLE patients
  DROP COLUMN IF EXISTS document_type,
  DROP COLUMN IF EXISTS birth_date,
  DROP COLUMN IF EXISTS departamento,
  DROP COLUMN IF EXISTS distrito,
  DROP COLUMN IF EXISTS is_foreigner,
  DROP COLUMN IF EXISTS nationality;


-- ============================================================
-- ROLLBACK 018: Appointment payment deposits
-- Riesgo: BAJO
-- ============================================================
ALTER TABLE patient_payments ALTER COLUMN patient_id SET NOT NULL;
-- ⚠️ Falla si existen pagos con patient_id=NULL. Arregla primero:
-- DELETE FROM patient_payments WHERE patient_id IS NULL;


-- ============================================================
-- ROLLBACK 017: Professional title
-- Riesgo: BAJO
-- ============================================================
ALTER TABLE user_profiles DROP COLUMN IF EXISTS professional_title;


-- ============================================================
-- ROLLBACK 016: Plans & subscriptions (v2)
-- Riesgo: 💀 ALTO (borra planes y suscripciones)
-- ============================================================
DROP FUNCTION IF EXISTS get_org_plan(UUID);
DROP FUNCTION IF EXISTS get_org_usage(UUID);
DROP POLICY IF EXISTS "org_subs_select" ON organization_subscriptions;
DROP POLICY IF EXISTS "org_subs_insert" ON organization_subscriptions;
DROP POLICY IF EXISTS "org_subs_update" ON organization_subscriptions;
DROP INDEX IF EXISTS idx_org_subs_org;
DROP INDEX IF EXISTS idx_org_subs_plan;
DROP INDEX IF EXISTS idx_org_subs_status;
DROP TABLE IF EXISTS organization_subscriptions CASCADE;
DROP POLICY IF EXISTS "plans_select" ON plans;
DROP TABLE IF EXISTS plans CASCADE;


-- ============================================================
-- ROLLBACK 015b: Member management (email + find_user)
-- Riesgo: BAJO
-- ============================================================
DROP FUNCTION IF EXISTS find_user_by_email(TEXT);
ALTER TABLE user_profiles DROP COLUMN IF EXISTS email;
-- Restaurar handle_new_user a versión 014


-- ============================================================
-- ROLLBACK 015a: Storage buckets
-- Riesgo: 💀 ALTO (borra archivos subidos)
-- ============================================================
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Org assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can upload org assets" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can update org assets" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can delete org assets" ON storage.objects;
DELETE FROM storage.buckets WHERE id IN ('avatars', 'org-assets');


-- ============================================================
-- ROLLBACK 014: Fix orphan users
-- Riesgo: BAJO (solo función)
-- ============================================================
DROP FUNCTION IF EXISTS ensure_user_has_org();
-- ⚠️ Las organizaciones creadas para usuarios huérfanos no se borran


-- ============================================================
-- ROLLBACK 013: Multi-tenant architecture
-- Riesgo: 💀💀 CRÍTICO — Este es el rollback más peligroso.
-- Revierte TODA la arquitectura multi-tenant.
-- Solo ejecutar si realmente necesitas volver a single-tenant.
-- ============================================================
-- PASO 1: Borrar todas las policies org-based
DROP POLICY IF EXISTS "org_select_offices" ON offices;
DROP POLICY IF EXISTS "org_insert_offices" ON offices;
DROP POLICY IF EXISTS "org_update_offices" ON offices;
DROP POLICY IF EXISTS "org_delete_offices" ON offices;
DROP POLICY IF EXISTS "org_select_doctors" ON doctors;
DROP POLICY IF EXISTS "org_insert_doctors" ON doctors;
DROP POLICY IF EXISTS "org_update_doctors" ON doctors;
DROP POLICY IF EXISTS "org_delete_doctors" ON doctors;
DROP POLICY IF EXISTS "org_select_doctor_services" ON doctor_services;
DROP POLICY IF EXISTS "org_insert_doctor_services" ON doctor_services;
DROP POLICY IF EXISTS "org_delete_doctor_services" ON doctor_services;
DROP POLICY IF EXISTS "org_select_doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "org_insert_doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "org_update_doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "org_delete_doctor_schedules" ON doctor_schedules;
DROP POLICY IF EXISTS "org_select_service_categories" ON service_categories;
DROP POLICY IF EXISTS "org_insert_service_categories" ON service_categories;
DROP POLICY IF EXISTS "org_update_service_categories" ON service_categories;
DROP POLICY IF EXISTS "org_delete_service_categories" ON service_categories;
DROP POLICY IF EXISTS "org_select_services" ON services;
DROP POLICY IF EXISTS "org_insert_services" ON services;
DROP POLICY IF EXISTS "org_update_services" ON services;
DROP POLICY IF EXISTS "org_delete_services" ON services;
DROP POLICY IF EXISTS "org_select_appointments" ON appointments;
DROP POLICY IF EXISTS "org_insert_appointments" ON appointments;
DROP POLICY IF EXISTS "org_update_appointments" ON appointments;
DROP POLICY IF EXISTS "org_delete_appointments" ON appointments;
DROP POLICY IF EXISTS "org_select_patients" ON patients;
DROP POLICY IF EXISTS "org_insert_patients" ON patients;
DROP POLICY IF EXISTS "org_update_patients" ON patients;
DROP POLICY IF EXISTS "org_delete_patients" ON patients;
DROP POLICY IF EXISTS "org_select_patient_tags" ON patient_tags;
DROP POLICY IF EXISTS "org_insert_patient_tags" ON patient_tags;
DROP POLICY IF EXISTS "org_delete_patient_tags" ON patient_tags;
DROP POLICY IF EXISTS "org_select_patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "org_insert_patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "org_update_patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "org_delete_patient_payments" ON patient_payments;
DROP POLICY IF EXISTS "org_select_schedule_blocks" ON schedule_blocks;
DROP POLICY IF EXISTS "org_insert_schedule_blocks" ON schedule_blocks;
DROP POLICY IF EXISTS "org_update_schedule_blocks" ON schedule_blocks;
DROP POLICY IF EXISTS "org_delete_schedule_blocks" ON schedule_blocks;
DROP POLICY IF EXISTS "org_select_global_variables" ON global_variables;
DROP POLICY IF EXISTS "org_insert_global_variables" ON global_variables;
DROP POLICY IF EXISTS "org_update_global_variables" ON global_variables;
DROP POLICY IF EXISTS "org_delete_global_variables" ON global_variables;
DROP POLICY IF EXISTS "org_select_lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "org_insert_lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "org_update_lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "org_delete_lookup_categories" ON lookup_categories;
DROP POLICY IF EXISTS "org_select_lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "org_insert_lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "org_update_lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "org_delete_lookup_values" ON lookup_values;
DROP POLICY IF EXISTS "Members can view profiles in same org" ON user_profiles;
DROP POLICY IF EXISTS "org_select_organizations" ON organizations;
DROP POLICY IF EXISTS "org_insert_organizations" ON organizations;
DROP POLICY IF EXISTS "org_update_organizations" ON organizations;
DROP POLICY IF EXISTS "org_delete_organizations" ON organizations;
DROP POLICY IF EXISTS "org_select_members" ON organization_members;
DROP POLICY IF EXISTS "org_insert_members" ON organization_members;
DROP POLICY IF EXISTS "org_update_members" ON organization_members;
DROP POLICY IF EXISTS "org_delete_members" ON organization_members;

-- PASO 2: Revertir unique constraints a globales
ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_org_cmp_unique;
ALTER TABLE doctors ADD CONSTRAINT doctors_cmp_key UNIQUE(cmp);
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_org_name_unique;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_name_key UNIQUE(name);
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_org_dni_unique;
ALTER TABLE patients ADD CONSTRAINT patients_dni_key UNIQUE(dni);
ALTER TABLE lookup_categories DROP CONSTRAINT IF EXISTS lookup_categories_org_slug_unique;
ALTER TABLE lookup_categories ADD CONSTRAINT lookup_categories_slug_key UNIQUE(slug);
ALTER TABLE lookup_values DROP CONSTRAINT IF EXISTS lookup_values_org_cat_value_unique;
ALTER TABLE lookup_values ADD CONSTRAINT lookup_values_category_id_value_key UNIQUE(category_id, value);
ALTER TABLE global_variables DROP CONSTRAINT IF EXISTS global_variables_org_key_unique;
ALTER TABLE global_variables ADD CONSTRAINT global_variables_key_key UNIQUE(key);

-- PASO 3: Quitar organization_id de todas las tablas
ALTER TABLE offices DROP COLUMN IF EXISTS organization_id;
ALTER TABLE doctors DROP COLUMN IF EXISTS organization_id;
ALTER TABLE doctor_services DROP COLUMN IF EXISTS organization_id;
ALTER TABLE doctor_schedules DROP COLUMN IF EXISTS organization_id;
ALTER TABLE service_categories DROP COLUMN IF EXISTS organization_id;
ALTER TABLE services DROP COLUMN IF EXISTS organization_id;
ALTER TABLE appointments DROP COLUMN IF EXISTS organization_id;
ALTER TABLE patients DROP COLUMN IF EXISTS organization_id;
ALTER TABLE patient_tags DROP COLUMN IF EXISTS organization_id;
ALTER TABLE patient_payments DROP COLUMN IF EXISTS organization_id;
ALTER TABLE schedule_blocks DROP COLUMN IF EXISTS organization_id;
ALTER TABLE lookup_categories DROP COLUMN IF EXISTS organization_id;
ALTER TABLE lookup_values DROP COLUMN IF EXISTS organization_id;
ALTER TABLE global_variables DROP COLUMN IF EXISTS organization_id;

-- PASO 4: Borrar funciones helper y tablas de org
DROP FUNCTION IF EXISTS get_user_org_ids();
DROP FUNCTION IF EXISTS is_org_admin(UUID);
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- PASO 5: Restaurar handle_new_user a versión 001 (simple)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 6: Recrear RLS policies originales (de migraciones 003-012)
-- ⚠️ Ejecutar las policies de cada migración original manualmente


-- ============================================================
-- ROLLBACK 012: Global variables
-- Riesgo: 💀 ALTO (borra configuración)
-- ============================================================
DROP TABLE IF EXISTS global_variables CASCADE;


-- ============================================================
-- ROLLBACK 011: Appointment edit history
-- Riesgo: BAJO
-- ============================================================
ALTER TABLE appointments
  DROP COLUMN IF EXISTS edited_by_name,
  DROP COLUMN IF EXISTS edited_at,
  DROP COLUMN IF EXISTS price_snapshot;
DROP INDEX IF EXISTS idx_appointments_status;


-- ============================================================
-- ROLLBACK 010: AI assistant
-- Riesgo: BAJO
-- ============================================================
DROP FUNCTION IF EXISTS ai_readonly_query(TEXT);


-- ============================================================
-- ROLLBACK 009: Schedule blocks
-- Riesgo: 💀 ALTO (borra bloqueos de agenda)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage schedule blocks" ON schedule_blocks;
DROP TABLE IF EXISTS schedule_blocks CASCADE;


-- ============================================================
-- ROLLBACK 008: Patients
-- Riesgo: 💀💀 CRÍTICO (borra TODOS los pacientes y pagos)
-- ============================================================
ALTER TABLE appointments DROP COLUMN IF EXISTS patient_id;
DROP TABLE IF EXISTS patient_payments CASCADE;
DROP TABLE IF EXISTS patient_tags CASCADE;
DROP TABLE IF EXISTS patients CASCADE;


-- ============================================================
-- ROLLBACK 007: Appointments
-- Riesgo: 💀💀 CRÍTICO (borra TODAS las citas)
-- ============================================================
DROP TABLE IF EXISTS appointments CASCADE;


-- ============================================================
-- ROLLBACK 006: Lookup tables
-- Riesgo: 💀 ALTO (borra catálogos configurados)
-- ============================================================
DROP TABLE IF EXISTS lookup_values CASCADE;
DROP TABLE IF EXISTS lookup_categories CASCADE;


-- ============================================================
-- ROLLBACK 005_doctors: Doctors
-- Riesgo: 💀💀 CRÍTICO (borra TODOS los doctores)
-- ============================================================
DROP TABLE IF EXISTS doctor_schedules CASCADE;
DROP TABLE IF EXISTS doctor_services CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;


-- ============================================================
-- ROLLBACK 004_services: Service categories & services
-- Riesgo: 💀 ALTO (borra servicios configurados)
-- ============================================================
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS service_categories CASCADE;


-- ============================================================
-- ROLLBACK 003_offices: Offices
-- Riesgo: 💀 ALTO (borra consultorios)
-- ============================================================
DROP TABLE IF EXISTS offices CASCADE;


-- ============================================================
-- ROLLBACK 005_fix_rls: Fix RLS recursion
-- Riesgo: BAJO (solo policies)
-- ============================================================
DROP POLICY IF EXISTS "Users can view own memberships" ON organization_members;
DROP POLICY IF EXISTS "Org owner can add members" ON organization_members;
DROP POLICY IF EXISTS "Org owner can update members" ON organization_members;
DROP POLICY IF EXISTS "Org owner can delete members" ON organization_members;
-- Restaurar policies originales de migración 004


-- ============================================================
-- ROLLBACK 004_organizations: Organizations
-- Riesgo: 💀💀 CRÍTICO
-- ============================================================
ALTER TABLE organization_subscriptions DROP COLUMN IF EXISTS organization_id;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;


-- ============================================================
-- ROLLBACK 003_plans: Plans & subscriptions
-- Riesgo: 💀 ALTO (borra planes y pagos)
-- ============================================================
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS organization_subscriptions CASCADE;
DROP TABLE IF EXISTS plans CASCADE;


-- ============================================================
-- ROLLBACK 002: Phone column
-- Riesgo: BAJO
-- ============================================================
ALTER TABLE user_profiles DROP COLUMN IF EXISTS phone;


-- ============================================================
-- ROLLBACK 001: Initial schema
-- Riesgo: 💀💀💀 NUCLEAR (borra TODO)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP FUNCTION IF EXISTS update_updated_at();
