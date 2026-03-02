-- =============================================
-- Migration 023: Organization Invitations
-- Allows admins to invite users by email.
-- Users who don't have an account yet receive
-- an email with a registration link.
-- =============================================

-- 1. Create invitations table
CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','receptionist','doctor')),
  professional_title TEXT CHECK (professional_title IN ('doctor','especialista','licenciada')),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admins_manage_invitations"
  ON organization_invitations FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- Allow unauthenticated reads by token (for registration page)
CREATE POLICY "anyone_can_read_by_token"
  ON organization_invitations FOR SELECT
  USING (true);

-- 3. Indexes
CREATE INDEX idx_invitations_email ON organization_invitations(email);
CREATE INDEX idx_invitations_token ON organization_invitations(token);
CREATE INDEX idx_invitations_org ON organization_invitations(organization_id);
CREATE INDEX idx_invitations_status ON organization_invitations(status);

-- 4. RPC: Accept invitation (called after user registers)
CREATE OR REPLACE FUNCTION accept_invitation(invite_token UUID)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Find the pending, non-expired invitation
  SELECT * INTO inv
  FROM organization_invitations
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_or_expired');
  END IF;

  -- Remove user from any previous organization
  DELETE FROM organization_members WHERE user_id = auth.uid();

  -- Add user to the organization with the invited role
  INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (auth.uid(), inv.organization_id, inv.role)
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role;

  -- Set professional title if doctor role
  IF inv.role = 'doctor' AND inv.professional_title IS NOT NULL THEN
    UPDATE user_profiles
    SET professional_title = inv.professional_title
    WHERE id = auth.uid();
  END IF;

  -- Mark invitation as accepted
  UPDATE organization_invitations
  SET status = 'accepted'
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', inv.organization_id,
    'role', inv.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update handle_new_user to check for pending invitations
-- If there's a pending invite for this email, skip org creation
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
