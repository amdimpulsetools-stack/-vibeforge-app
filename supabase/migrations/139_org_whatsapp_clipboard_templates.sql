-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 139: Multi-kind WhatsApp clipboard templates per-org
--
-- Hasta ahora existía UNA sola plantilla de "copy WhatsApp" después
-- de reservar cita, persistida en localStorage por dispositivo. Esta
-- migración la mueve a la base de datos por organización y agrega
-- 2 plantillas más para los seguimientos de fertilidad:
--
--   - post_appointment              → general, todas las orgs
--   - second_consultation_followup  → addon fertility_basic
--   - budget_followup               → addon fertility_basic
--
-- Solo el toggle de "habilitar modal post-cita" sigue siendo
-- per-device (localStorage), porque depende del flujo del usuario.
--
-- Idempotente: ON CONFLICT DO NOTHING en todos los inserts.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tabla principal ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_whatsapp_clipboard_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'post_appointment',
    'second_consultation_followup',
    'budget_followup'
  )),
  template TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_owct_org
  ON org_whatsapp_clipboard_templates(organization_id);

-- ── 2. Trigger updated_at (mismo helper que el resto del schema) ──
CREATE TRIGGER set_updated_at_org_whatsapp_clipboard_templates
  BEFORE UPDATE ON org_whatsapp_clipboard_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── 3. RLS ────────────────────────────────────────────────────────
ALTER TABLE org_whatsapp_clipboard_templates ENABLE ROW LEVEL SECURITY;

-- Cualquier miembro de la org puede leer las plantillas (las usa el
-- modal post-cita).
CREATE POLICY "owct_select" ON org_whatsapp_clipboard_templates
  FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Solo admin/owner puede crear o editar plantillas.
CREATE POLICY "owct_insert" ON org_whatsapp_clipboard_templates
  FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "owct_update" ON org_whatsapp_clipboard_templates
  FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "owct_delete" ON org_whatsapp_clipboard_templates
  FOR DELETE
  USING (is_org_admin(organization_id));

-- ── 4. Función seed_whatsapp_clipboard_templates(org_id) ──────────
-- Inserta los 3 defaults para una org. Idempotente vía ON CONFLICT.
-- IMPORTANTE: esta función debería llamarse al crear una nueva org,
-- pero NO se cablea automáticamente desde handle_new_user() en esta
-- migración para mantener el cambio acotado. La activación del addon
-- fertility_basic puede llamar esta función para asegurar que las
-- plantillas existan. El backfill de abajo se encarga de las orgs
-- existentes.
CREATE OR REPLACE FUNCTION seed_whatsapp_clipboard_templates(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO org_whatsapp_clipboard_templates (organization_id, kind, template)
  VALUES
    (
      p_org_id,
      'post_appointment',
      E'Hola {{NOMBRE}}, tu cita ha sido reservada para el día {{FECHA}} a las {{HORA}} con {{DOCTOR}} en {{CLINICA}}.\n\nDirección: {{DIRECCION}}.\n¡Te esperamos!'
    ),
    (
      p_org_id,
      'second_consultation_followup',
      E'Hola {{NOMBRE}}, somos de {{CLINICA}} 👋\n\nQueremos saber cómo te sientes después de tu primera consulta con {{DOCTOR}}. ¿Has podido revisar las indicaciones? Estamos a tu disposición para coordinar tu segunda consulta cuando estés lista.\n\n¿Te gustaría agendar?'
    ),
    (
      p_org_id,
      'budget_followup',
      E'Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para hacer seguimiento al presupuesto de {{TRATAMIENTO}} que te enviamos. ¿Has tenido oportunidad de revisarlo? Cualquier duda con gusto te la resolvemos.\n\nQuedamos atentos a tus comentarios 💚'
    )
  ON CONFLICT (organization_id, kind) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION seed_whatsapp_clipboard_templates(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_whatsapp_clipboard_templates(UUID) FROM authenticated;
REVOKE ALL ON FUNCTION seed_whatsapp_clipboard_templates(UUID) FROM anon;

-- ── 5. Backfill: post_appointment para TODAS las orgs ─────────────
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    INSERT INTO org_whatsapp_clipboard_templates (organization_id, kind, template)
    VALUES (
      org.id,
      'post_appointment',
      E'Hola {{NOMBRE}}, tu cita ha sido reservada para el día {{FECHA}} a las {{HORA}} con {{DOCTOR}} en {{CLINICA}}.\n\nDirección: {{DIRECCION}}.\n¡Te esperamos!'
    )
    ON CONFLICT (organization_id, kind) DO NOTHING;
  END LOOP;
END $$;

-- ── 6. Backfill seguimientos: solo orgs con fertility_basic activo ─
-- Las orgs sin el addon no necesitan estas plantillas todavía. Cuando
-- activen el addon, la API podrá llamar seed_whatsapp_clipboard_templates
-- (o la app simplemente devolverá los defaults inline si no existen).
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN
    SELECT DISTINCT oa.organization_id AS id
      FROM organization_addons oa
     WHERE oa.addon_key IN ('fertility_basic', 'fertility_premium')
       AND oa.enabled = true
  LOOP
    INSERT INTO org_whatsapp_clipboard_templates (organization_id, kind, template)
    VALUES
      (
        org.id,
        'second_consultation_followup',
        E'Hola {{NOMBRE}}, somos de {{CLINICA}} 👋\n\nQueremos saber cómo te sientes después de tu primera consulta con {{DOCTOR}}. ¿Has podido revisar las indicaciones? Estamos a tu disposición para coordinar tu segunda consulta cuando estés lista.\n\n¿Te gustaría agendar?'
      ),
      (
        org.id,
        'budget_followup',
        E'Hola {{NOMBRE}} 👋\n\nTe escribimos de {{CLINICA}} para hacer seguimiento al presupuesto de {{TRATAMIENTO}} que te enviamos. ¿Has tenido oportunidad de revisarlo? Cualquier duda con gusto te la resolvemos.\n\nQuedamos atentos a tus comentarios 💚'
      )
    ON CONFLICT (organization_id, kind) DO NOTHING;
  END LOOP;
END $$;
