-- =============================================
-- Migration 134: Fix invitation email case sensitivity
--
-- Problem: handle_new_user() compares organization_invitations.email = NEW.email
-- case-sensitively. Supabase normalizes auth.users.email to lowercase, but
-- invitations were inserted with the casing typed by the inviter. As a result
-- a pending invitation for "User@example.com" never matches the new auth user
-- "user@example.com", and the trigger creates a stray "Mi Clinica" org for the
-- invited user instead of waiting for the invitation acceptance flow.
--
-- Fix:
--   1. Recreate handle_new_user() comparing LOWER(email) = LOWER(NEW.email).
--   2. Backfill organization_invitations to lowercase any historical emails.
--   3. Add CHECK constraint to enforce lowercase emails going forward.
--
-- Idempotent: CREATE OR REPLACE, IF NOT EXISTS guards.
-- =============================================

-- 1. Recreate handle_new_user() with case-insensitive invitation lookup.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  cat_origin_id UUID;
  cat_payment_id UUID;
  cat_status_id UUID;
  cat_responsible_id UUID;
  has_invitation BOOLEAN;
BEGIN
  -- 1. Create user profile
  INSERT INTO public.user_profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  -- 2. Check if there's a pending invitation for this email (case-insensitive)
  SELECT EXISTS (
    SELECT 1 FROM public.organization_invitations
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
  ) INTO has_invitation;

  -- If invited, skip org creation — invitation will be accepted via accept_invitation()
  IF has_invitation THEN
    RETURN NEW;
  END IF;

  -- 3. Create organization (only for non-invited users)
  org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', 'Mi Clínica');
  new_org_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (new_org_id, org_name, new_org_id::text, NEW.id);

  -- 4. Make user the owner
  INSERT INTO public.organization_members (user_id, organization_id, role)
  VALUES (NEW.id, new_org_id, 'owner');

  -- 5. Seed global variables
  INSERT INTO public.global_variables (name, key, value, description, sort_order, organization_id) VALUES
    ('Nombre de la Clínica',    'clinic_name',         org_name,           'Nombre visible en reportes y documentos',   1, new_org_id),
    ('Teléfono de contacto',    'clinic_phone',        '+51 999 000 000',  'Teléfono principal de la clínica',          2, new_org_id),
    ('Correo de contacto',      'clinic_email',        'info@clinica.com', 'Email para notificaciones',                 3, new_org_id),
    ('Máx. citas por slot',     'max_appts_per_slot',  '1',                'Cantidad máxima de citas en el mismo slot', 4, new_org_id),
    ('Moneda',                  'currency_symbol',     'S/.',              'Símbolo monetario usado en reportes',       5, new_org_id);

  -- 6. Seed lookup categories
  INSERT INTO public.lookup_categories (id, slug, name, description, is_system, organization_id) VALUES
    (gen_random_uuid(), 'origin',             'Origen del Paciente', 'De dónde conoció al consultorio', true, new_org_id),
    (gen_random_uuid(), 'payment_method',     'Método de Pago',     'Formas de pago aceptadas',        true, new_org_id),
    (gen_random_uuid(), 'appointment_status', 'Estado de Cita',     'Estados posibles de una cita',    true, new_org_id),
    (gen_random_uuid(), 'responsible',        'Responsable',        'Personas responsables',           true, new_org_id);

  SELECT id INTO cat_origin_id FROM public.lookup_categories
    WHERE slug = 'origin' AND organization_id = new_org_id;
  SELECT id INTO cat_payment_id FROM public.lookup_categories
    WHERE slug = 'payment_method' AND organization_id = new_org_id;
  SELECT id INTO cat_status_id FROM public.lookup_categories
    WHERE slug = 'appointment_status' AND organization_id = new_org_id;
  SELECT id INTO cat_responsible_id FROM public.lookup_categories
    WHERE slug = 'responsible' AND organization_id = new_org_id;

  -- 7. Seed lookup values
  INSERT INTO public.lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_origin_id, 'TikTok',      'tiktok',      1, new_org_id),
    (cat_origin_id, 'Instagram',   'instagram',   2, new_org_id),
    (cat_origin_id, 'Google',      'google',      3, new_org_id),
    (cat_origin_id, 'Recomendado', 'recommended', 4, new_org_id);

  INSERT INTO public.lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_payment_id, 'Efectivo', 'cash', 1, new_org_id),
    (cat_payment_id, 'Yape',    'yape', 2, new_org_id),
    (cat_payment_id, 'Visa',    'visa', 3, new_org_id);

  INSERT INTO public.lookup_values (category_id, label, value, color, display_order, organization_id) VALUES
    (cat_status_id, 'Programada', 'scheduled', '#9ca3af', 1, new_org_id),
    (cat_status_id, 'Confirmada', 'confirmed', '#3b82f6', 2, new_org_id),
    (cat_status_id, 'Completada', 'completed', '#22c55e', 3, new_org_id),
    (cat_status_id, 'Cancelada',  'cancelled', '#ef4444', 4, new_org_id);

  INSERT INTO public.lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_responsible_id, 'Admin', 'admin', 1, new_org_id);

  -- 8. Seed default offices
  INSERT INTO public.offices (name, description, display_order, organization_id) VALUES
    ('Consultorio 1', 'Consultorio principal',  1, new_org_id),
    ('Consultorio 2', 'Consultorio secundario', 2, new_org_id);

  -- 9. Seed email settings and templates for the new org
  INSERT INTO public.email_settings (organization_id, sender_name, brand_color)
  VALUES (new_org_id, org_name, '#10b981')
  ON CONFLICT (organization_id) DO NOTHING;

  PERFORM seed_email_templates(new_org_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Backfill existing invitations to lowercase emails.
UPDATE public.organization_invitations
SET email = LOWER(email)
WHERE email <> LOWER(email);

-- 3. Defensive CHECK constraint to enforce lowercase emails on future inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_invitations_email_lowercase'
  ) THEN
    ALTER TABLE public.organization_invitations
      ADD CONSTRAINT organization_invitations_email_lowercase
      CHECK (email = LOWER(email));
  END IF;
END $$;
