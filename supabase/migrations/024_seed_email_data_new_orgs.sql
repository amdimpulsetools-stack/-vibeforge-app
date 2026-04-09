-- =============================================
-- Migration 024: Seed Email Data for New Organizations
-- Fixes handle_new_user() and ensure_user_has_org()
-- to also create email_settings and email_templates
-- when a new organization is created.
-- =============================================

-- 1. Update handle_new_user to seed email data
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

  -- 2. Check if there's a pending invitation for this email
  SELECT EXISTS (
    SELECT 1 FROM public.organization_invitations
    WHERE email = NEW.email
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

  INSERT INTO public.organizations (id, name, slug)
  VALUES (new_org_id, org_name, new_org_id::text);

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

-- 2. Update ensure_user_has_org to also seed email data
CREATE OR REPLACE FUNCTION ensure_user_has_org()
RETURNS JSON AS $$
DECLARE
  existing_org_id UUID;
  new_org_id UUID;
  current_user_id UUID;
  org_name TEXT;
  cat_origin_id UUID;
  cat_payment_id UUID;
  cat_status_id UUID;
  cat_responsible_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an org
  SELECT organization_id INTO existing_org_id
  FROM organization_members
  WHERE user_id = current_user_id
  LIMIT 1;

  IF existing_org_id IS NOT NULL THEN
    RETURN json_build_object('organization_id', existing_org_id, 'created', false);
  END IF;

  -- Get org name from user metadata
  SELECT COALESCE(raw_user_meta_data->>'org_name', 'Mi Clínica')
  INTO org_name
  FROM auth.users
  WHERE id = current_user_id;

  -- Create organization
  new_org_id := gen_random_uuid();

  INSERT INTO organizations (id, name, slug)
  VALUES (new_org_id, org_name, new_org_id::text);

  -- Make user the owner
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (current_user_id, new_org_id, 'owner');

  -- Seed global variables
  INSERT INTO global_variables (name, key, value, description, sort_order, organization_id) VALUES
    ('Nombre de la Clínica',    'clinic_name',         org_name,           'Nombre visible en reportes y documentos',   1, new_org_id),
    ('Teléfono de contacto',    'clinic_phone',        '+51 999 000 000',  'Teléfono principal de la clínica',          2, new_org_id),
    ('Correo de contacto',      'clinic_email',        'info@clinica.com', 'Email para notificaciones',                 3, new_org_id),
    ('Máx. citas por slot',     'max_appts_per_slot',  '1',                'Cantidad máxima de citas en el mismo slot', 4, new_org_id),
    ('Moneda',                  'currency_symbol',     'S/.',              'Símbolo monetario usado en reportes',       5, new_org_id);

  -- Seed lookup categories
  INSERT INTO lookup_categories (id, slug, name, description, is_system, organization_id) VALUES
    (gen_random_uuid(), 'origin',             'Origen del Paciente', 'De dónde conoció al consultorio', true, new_org_id),
    (gen_random_uuid(), 'payment_method',     'Método de Pago',     'Formas de pago aceptadas',        true, new_org_id),
    (gen_random_uuid(), 'appointment_status', 'Estado de Cita',     'Estados posibles de una cita',    true, new_org_id),
    (gen_random_uuid(), 'responsible',        'Responsable',        'Personas responsables',           true, new_org_id);

  SELECT id INTO cat_origin_id FROM lookup_categories
    WHERE slug = 'origin' AND organization_id = new_org_id;
  SELECT id INTO cat_payment_id FROM lookup_categories
    WHERE slug = 'payment_method' AND organization_id = new_org_id;
  SELECT id INTO cat_status_id FROM lookup_categories
    WHERE slug = 'appointment_status' AND organization_id = new_org_id;
  SELECT id INTO cat_responsible_id FROM lookup_categories
    WHERE slug = 'responsible' AND organization_id = new_org_id;

  -- Seed lookup values
  INSERT INTO lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_origin_id, 'TikTok',      'tiktok',      1, new_org_id),
    (cat_origin_id, 'Instagram',   'instagram',   2, new_org_id),
    (cat_origin_id, 'Google',      'google',      3, new_org_id),
    (cat_origin_id, 'Recomendado', 'recommended', 4, new_org_id);

  INSERT INTO lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_payment_id, 'Efectivo', 'cash', 1, new_org_id),
    (cat_payment_id, 'Yape',    'yape', 2, new_org_id),
    (cat_payment_id, 'Visa',    'visa', 3, new_org_id);

  INSERT INTO lookup_values (category_id, label, value, color, display_order, organization_id) VALUES
    (cat_status_id, 'Programada', 'scheduled', '#9ca3af', 1, new_org_id),
    (cat_status_id, 'Confirmada', 'confirmed', '#3b82f6', 2, new_org_id),
    (cat_status_id, 'Completada', 'completed', '#22c55e', 3, new_org_id),
    (cat_status_id, 'Cancelada',  'cancelled', '#ef4444', 4, new_org_id);

  INSERT INTO lookup_values (category_id, label, value, display_order, organization_id) VALUES
    (cat_responsible_id, 'Admin', 'admin', 1, new_org_id);

  -- Seed default offices
  INSERT INTO offices (name, description, display_order, organization_id) VALUES
    ('Consultorio 1', 'Consultorio principal',  1, new_org_id),
    ('Consultorio 2', 'Consultorio secundario', 2, new_org_id);

  -- Seed email settings and templates for the new org
  INSERT INTO email_settings (organization_id, sender_name, brand_color)
  VALUES (new_org_id, org_name, '#10b981')
  ON CONFLICT (organization_id) DO NOTHING;

  PERFORM seed_email_templates(new_org_id);

  RETURN json_build_object('organization_id', new_org_id, 'created', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill: seed email data for any existing orgs that are missing it
DO $$
DECLARE
  org RECORD;
BEGIN
  -- Seed email_settings for orgs that don't have it
  INSERT INTO email_settings (organization_id, sender_name, brand_color)
  SELECT o.id, o.name, '#10b981'
  FROM organizations o
  LEFT JOIN email_settings es ON es.organization_id = o.id
  WHERE es.id IS NULL
  ON CONFLICT (organization_id) DO NOTHING;

  -- Seed email_templates for orgs that don't have any
  FOR org IN
    SELECT o.id
    FROM organizations o
    LEFT JOIN email_templates et ON et.organization_id = o.id
    WHERE et.id IS NULL
    GROUP BY o.id
  LOOP
    PERFORM seed_email_templates(org.id);
  END LOOP;
END $$;
