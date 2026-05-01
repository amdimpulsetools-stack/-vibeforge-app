-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 126: Seed default body_html para los 4 slugs restantes
--
-- Mig 125 sembró solo 'prescription'. Esta migración completa los 4
-- documentos faltantes con un body default razonable que el doctor
-- puede reemplazar desde Settings → Plantillas HC.
--
-- Idempotente: ON CONFLICT (organization_id, slug) DO NOTHING. Si la
-- org ya tiene una fila para el slug (ej. la creó vía upsert al
-- editar), no se sobrescribe.
-- ═══════════════════════════════════════════════════════════════════

-- ─── clinical_note (Nota clínica SOAP) ────────────────────────────
INSERT INTO clinical_document_templates (organization_id, slug, name, description, body_html)
SELECT
  o.id,
  'clinical_note',
  'Nota clínica SOAP',
  'Plantilla del cuerpo de la nota clínica. El SOAP, diagnósticos, signos vitales y firma se renderizan automáticamente; aquí personalizas el footer legal o instrucciones generales.',
  '<p><em>Documento amparado por la Ley 26842 (Ley General de Salud) y la NTS 139-MINSA/2018. La presente nota es de uso médico y forma parte de la historia clínica del paciente.</em></p>'
FROM organizations o
ON CONFLICT (organization_id, slug) DO NOTHING;

-- ─── exam_order (Orden de exámenes) ───────────────────────────────
INSERT INTO clinical_document_templates (organization_id, slug, name, description, body_html)
SELECT
  o.id,
  'exam_order',
  'Orden de exámenes',
  'Plantilla del cuerpo de la orden de exámenes. La lista de exámenes solicitados se renderiza automáticamente desde el sistema; aquí personalizas indicaciones generales o el footer.',
  '<p><strong>Indicaciones para el paciente:</strong></p>'
  '<ul>'
    '<li>Presentar esta orden en el laboratorio o centro de imágenes de su preferencia.</li>'
    '<li>Seguir las instrucciones específicas indicadas para cada examen (ayuno, suspensión de medicamentos, etc.).</li>'
    '<li>Traer los resultados a su próxima consulta médica.</li>'
  '</ul>'
  '<p><em>Esta orden tiene una validez de 60 días desde su emisión.</em></p>'
FROM organizations o
ON CONFLICT (organization_id, slug) DO NOTHING;

-- ─── consent (Consentimiento informado) ───────────────────────────
INSERT INTO clinical_document_templates (organization_id, slug, name, description, body_html)
SELECT
  o.id,
  'consent',
  'Consentimiento informado',
  'Plantilla del cuerpo del consentimiento. El procedimiento, riesgos y firma se renderizan automáticamente; aquí personalizas el preámbulo legal y declaraciones adicionales.',
  '<p>Yo, <strong>{{paciente_nombre}}</strong>, identificado(a) con DNI <strong>{{paciente_dni}}</strong>, declaro que:</p>'
  '<ul>'
    '<li>He recibido del médico tratante {{doctor_nombre}} la información clínica relevante sobre el procedimiento que se me realizará.</li>'
    '<li>Comprendo los riesgos, beneficios y alternativas explicados.</li>'
    '<li>Otorgo mi consentimiento informado, libre y voluntario, conforme a la Ley 29414 y al D.S. 027-2015-SA.</li>'
    '<li>Reconozco mi derecho a revocar este consentimiento en cualquier momento previo a la ejecución del acto.</li>'
  '</ul>'
FROM organizations o
ON CONFLICT (organization_id, slug) DO NOTHING;

-- ─── treatment_plan (Plan de tratamiento) ─────────────────────────
INSERT INTO clinical_document_templates (organization_id, slug, name, description, body_html)
SELECT
  o.id,
  'treatment_plan',
  'Plan de tratamiento',
  'Plantilla del cuerpo del plan de tratamiento. Diagnóstico, sesiones y precios se renderizan automáticamente; aquí personalizas notas para el paciente y términos.',
  '<p><strong>Notas para el paciente:</strong></p>'
  '<ul>'
    '<li>Asistir puntualmente a cada sesión programada.</li>'
    '<li>Seguir las recomendaciones entre sesiones para optimizar resultados.</li>'
    '<li>Comunicar cualquier cambio en su salud al equipo médico.</li>'
  '</ul>'
  '<p><em>Este plan está sujeto a evolución clínica y puede ajustarse según la respuesta al tratamiento.</em></p>'
FROM organizations o
ON CONFLICT (organization_id, slug) DO NOTHING;
