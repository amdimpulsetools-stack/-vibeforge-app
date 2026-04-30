-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 125: Plantillas personalizables de Historia Clínica
--
-- Hoy las 3 vistas de impresión (receta / nota clínica / orden de
-- exámenes) y eventualmente las 2 que faltan (consentimiento,
-- plan de tratamiento) usan window.print() con HTML hardcodeado.
-- El membrete (logo + datos de la org) ya es configurable via
-- migración 115. Lo que falta: que el doctor pueda personalizar
-- el cuerpo del documento (encabezado adicional, footer, notas
-- legales, indicaciones generales) sin tocar código.
--
-- Patrón inspirado en `email_templates` (mig 022/049/081/083/086):
-- una fila por (org, slug). El cuerpo se edita con TipTap rich-text
-- en `body_html`. La conversión final a PDF se hace server-side con
-- @react-pdf/renderer (no Puppeteer — sin Chromium en el deploy).
--
-- Slugs cubiertos en POC: 'prescription' (receta).
-- Slugs futuros: 'clinical_note', 'exam_order', 'consent',
-- 'treatment_plan' — los seedearemos cuando migremos cada uno de
-- los prints actuales a este patrón.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinical_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (
    slug IN ('prescription', 'clinical_note', 'exam_order', 'consent', 'treatment_plan')
  ),
  name TEXT NOT NULL,
  description TEXT,
  /** Cuerpo personalizable (HTML de TipTap). Soporta variables
   *  tipo {{paciente_nombre}} interpoladas server-side al renderizar. */
  body_html TEXT NOT NULL DEFAULT '',
  /** Si false, el render usa el default hardcodeado del sistema.
   *  Permite a la org "deshabilitar la personalización" sin perder lo escrito. */
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  /** Una plantilla por (org, slug) — no varias versiones del mismo tipo. */
  UNIQUE(organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_clinical_document_templates_org
  ON clinical_document_templates(organization_id);

CREATE TRIGGER set_updated_at_clinical_document_templates
  BEFORE UPDATE ON clinical_document_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE clinical_document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_document_templates_select" ON clinical_document_templates
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "clinical_document_templates_insert" ON clinical_document_templates
  FOR INSERT WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "clinical_document_templates_update" ON clinical_document_templates
  FOR UPDATE USING (is_org_admin(organization_id));

CREATE POLICY "clinical_document_templates_delete" ON clinical_document_templates
  FOR DELETE USING (is_org_admin(organization_id));

COMMENT ON TABLE clinical_document_templates IS
  'Plantillas personalizables de documentos clínicos (receta, nota, orden, consentimiento, plan). Una fila por (org, slug). Renderizado server-side con @react-pdf/renderer.';

-- ─── Seed: receta default por cada org existente ───────────────────
-- Body HTML mínimo. La org puede personalizarlo después; si lo
-- borra todo (body_html = ''), el render usa el default hardcodeado
-- del sistema como fallback.
INSERT INTO clinical_document_templates (organization_id, slug, name, description, body_html)
SELECT
  o.id,
  'prescription',
  'Receta médica',
  'Plantilla del cuerpo de la receta (encabezado adicional, indicaciones generales, footer legal). El listado de medicamentos se renderiza automáticamente.',
  '<p><strong>Indicaciones generales:</strong></p>'
  '<ul>'
    '<li>Tomar los medicamentos en los horarios indicados.</li>'
    '<li>No suspender el tratamiento sin consultar al médico.</li>'
    '<li>Reportar cualquier reacción adversa de inmediato.</li>'
  '</ul>'
  '<p><em>Esta receta es válida por 30 días desde su emisión.</em></p>'
FROM organizations o
ON CONFLICT (organization_id, slug) DO NOTHING;
