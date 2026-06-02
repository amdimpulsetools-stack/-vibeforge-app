-- ============================================================
-- 164: handle_new_user — sembrar 1 consultorio por defecto (no 2)
--
-- Contexto: el plan Independiente permite max_offices = 1, pero el
-- trigger sembraba 2 consultorios fijos ('Consultorio 1' +
-- 'Consultorio 2') para TODA org nueva, sin importar el plan.
-- Resultado: una org Independiente nacía en 2/1 consultorios — ya
-- por encima de su límite — y los offices SÍ están enforced
-- (app/api/offices/route.ts:79 → checkPlanLimit(..., "offices")),
-- así que el upgrade-warner la marcaba en rojo desde el día uno.
--
-- El plan no se conoce en el momento del signup (se elige luego en
-- /select-plan), así que el trigger no puede ser plan-aware. La
-- solución correcta es sembrar 1 solo consultorio: todos los planes
-- permiten >= 1, y el usuario crea más si su plan lo admite.
--
-- Solo cambia la sección 8 respecto a la migración 154; el resto del
-- cuerpo se reproduce verbatim para mantener la función intacta.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
    WHERE LOWER(email) = LOWER(NEW.email)
      AND status = 'pending'
      AND expires_at > now()
  ) INTO has_invitation;

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

  SELECT id INTO cat_origin_id FROM public.lookup_categories WHERE slug = 'origin' AND organization_id = new_org_id;
  SELECT id INTO cat_payment_id FROM public.lookup_categories WHERE slug = 'payment_method' AND organization_id = new_org_id;
  SELECT id INTO cat_status_id FROM public.lookup_categories WHERE slug = 'appointment_status' AND organization_id = new_org_id;
  SELECT id INTO cat_responsible_id FROM public.lookup_categories WHERE slug = 'responsible' AND organization_id = new_org_id;

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

  -- 8. Seed default office (single — ver cabecera de esta migración)
  INSERT INTO public.offices (name, description, display_order, organization_id) VALUES
    ('Consultorio principal', 'Consultorio principal', 1, new_org_id);

  -- 9. Seed email settings + templates
  INSERT INTO public.email_settings (organization_id, sender_name, brand_color)
  VALUES (new_org_id, org_name, '#10b981')
  ON CONFLICT (organization_id) DO NOTHING;

  PERFORM public.seed_email_templates(new_org_id);

  RETURN NEW;
END;
$function$;
