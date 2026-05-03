/**
 * WhatsApp Meta-ready templates for the fertility_basic addon.
 *
 * These cannot be seeded as global rows in `whatsapp_templates` because
 * `whatsapp_templates.organization_id` is NOT NULL — every template must
 * be submitted to Meta under the organization's WABA for approval.
 *
 * The addon activation endpoint (built by Agent 2) inserts one row per
 * org per template at activation time, with `status = 'PENDING'` so the
 * org admin can submit them to Meta from the WhatsApp settings panel.
 *
 * Variable mapping (Meta only allows positional {{1}}, {{2}}, ...):
 *   {{1}} = paciente_nombre
 *   {{2}} = doctor_nombre
 *   {{3}} = clinica_nombre
 *   {{4}} = clinica_telefono
 *
 * All language codes are 'es' (Meta does not accept 'es-PE'). The tone
 * is Peruvian — "te saluda", "para no perder el avance", "estamos para
 * ayudarte". Avoid neutro LATAM phrasing.
 */

export type FertilityWhatsAppTemplateSeed = {
  /** rule_key in followup_rules this template is linked to */
  rule_key: string;
  /** unique key inside our system (used for variable_mapping cross-ref) */
  template_key: string;
  /** value for whatsapp_templates.meta_template_name (lowercase + underscores) */
  meta_template_name: string;
  category: 'UTILITY';
  language: 'es';
  tone: 'amable' | 'directo' | 'ultimo_recordatorio';
  /** body_text with {{1}}, {{2}}, ... placeholders */
  body_text: string;
  /** maps positional index → semantic variable name (for runtime substitution) */
  variable_mapping: Record<string, string>;
  /** sample values for Meta review */
  sample_values: Record<string, string>;
};

export const FERTILITY_WHATSAPP_TEMPLATE_SEEDS: FertilityWhatsAppTemplateSeed[] = [
  // ── Regla 1: first consultation lapse ─────────────────────────────
  {
    rule_key: 'fertility.first_consultation_lapse',
    template_key: 'fertility.first_consultation_lapse.whatsapp_amable',
    meta_template_name: 'fertility_first_consultation_lapse_amable',
    category: 'UTILITY',
    language: 'es',
    tone: 'amable',
    body_text:
      'Hola {{1}}, te saluda {{3}}. Hace unas semanas tuviste tu primera consulta con {{2}} y queríamos saber cómo te has sentido y si tienes alguna duda sobre los siguientes pasos. ' +
      '¿Te gustaría agendar tu segunda consulta para revisar resultados y conversar sobre opciones de tratamiento? Estamos para ayudarte. ' +
      'Puedes responder a este mensaje o llamarnos al {{4}}.',
    variable_mapping: {
      '1': 'paciente_nombre',
      '2': 'doctor_nombre',
      '3': 'clinica_nombre',
      '4': 'clinica_telefono',
    },
    sample_values: {
      '1': 'María',
      '2': 'Dra. Angela Quispe',
      '3': 'Vitra Fertilidad',
      '4': '+51 999 123 456',
    },
  },
  {
    rule_key: 'fertility.first_consultation_lapse',
    template_key: 'fertility.first_consultation_lapse.whatsapp_directo',
    meta_template_name: 'fertility_first_consultation_lapse_directo',
    category: 'UTILITY',
    language: 'es',
    tone: 'directo',
    body_text:
      'Hola {{1}}, te escribe {{3}}. Notamos que aún no has agendado tu segunda consulta con {{2}}. ' +
      'Para no perder el avance de tu evaluación, te recomendamos coordinar tu próxima cita esta semana. ' +
      'Responde este mensaje para agendar o llámanos al {{4}}.',
    variable_mapping: {
      '1': 'paciente_nombre',
      '2': 'doctor_nombre',
      '3': 'clinica_nombre',
      '4': 'clinica_telefono',
    },
    sample_values: {
      '1': 'María',
      '2': 'Dra. Angela Quispe',
      '3': 'Vitra Fertilidad',
      '4': '+51 999 123 456',
    },
  },

  // ── Regla 2: second consultation lapse ────────────────────────────
  {
    rule_key: 'fertility.second_consultation_lapse',
    template_key: 'fertility.second_consultation_lapse.whatsapp_amable',
    meta_template_name: 'fertility_second_consultation_lapse_amable',
    category: 'UTILITY',
    language: 'es',
    tone: 'amable',
    body_text:
      'Hola {{1}}, te saluda {{3}}. Después de tu última consulta con {{2}} queríamos saber cómo te sientes y si ya pudiste pensar en los siguientes pasos. ' +
      'Cuando estés lista podemos coordinar una cita para conversar sobre el plan de tratamiento. Sin presión — solo cuéntanos cuándo te queda bien. ' +
      'Puedes responder a este mensaje o llamarnos al {{4}}.',
    variable_mapping: {
      '1': 'paciente_nombre',
      '2': 'doctor_nombre',
      '3': 'clinica_nombre',
      '4': 'clinica_telefono',
    },
    sample_values: {
      '1': 'María',
      '2': 'Dra. Angela Quispe',
      '3': 'Vitra Fertilidad',
      '4': '+51 999 123 456',
    },
  },
  {
    rule_key: 'fertility.second_consultation_lapse',
    template_key: 'fertility.second_consultation_lapse.whatsapp_directo',
    meta_template_name: 'fertility_second_consultation_lapse_directo',
    category: 'UTILITY',
    language: 'es',
    tone: 'directo',
    body_text:
      'Hola {{1}}, te escribe {{3}}. Han pasado varios días desde tu consulta con {{2}} y aún no coordinamos la cita para definir tu plan de tratamiento. ' +
      'Para que el avance no se enfríe, te recomendamos agendar esta semana. ' +
      'Responde este mensaje o escríbenos al {{4}} y coordinamos día y hora.',
    variable_mapping: {
      '1': 'paciente_nombre',
      '2': 'doctor_nombre',
      '3': 'clinica_nombre',
      '4': 'clinica_telefono',
    },
    sample_values: {
      '1': 'María',
      '2': 'Dra. Angela Quispe',
      '3': 'Vitra Fertilidad',
      '4': '+51 999 123 456',
    },
  },

  // ── Regla 3: budget pending acceptance ────────────────────────────
  // Spec dice: solo amable + ultimo_recordatorio para esta regla.
  {
    rule_key: 'fertility.budget_pending_acceptance',
    template_key: 'fertility.budget_pending_acceptance.whatsapp_amable',
    meta_template_name: 'fertility_budget_pending_amable',
    category: 'UTILITY',
    language: 'es',
    tone: 'amable',
    body_text:
      'Hola {{1}}, te saluda {{3}}. Te enviamos hace unos días el presupuesto de tu plan de tratamiento. ' +
      '¿Has tenido oportunidad de revisarlo? Si tienes preguntas sobre alguna parte, con gusto las conversamos. ' +
      'Estamos disponibles para resolver cualquier duda al {{4}}.',
    variable_mapping: {
      '1': 'paciente_nombre',
      '2': 'doctor_nombre',
      '3': 'clinica_nombre',
      '4': 'clinica_telefono',
    },
    sample_values: {
      '1': 'María',
      '2': 'Dra. Angela Quispe',
      '3': 'Vitra Fertilidad',
      '4': '+51 999 123 456',
    },
  },
  {
    rule_key: 'fertility.budget_pending_acceptance',
    template_key: 'fertility.budget_pending_acceptance.whatsapp_ultimo_recordatorio',
    meta_template_name: 'fertility_budget_pending_ultimo_recordatorio',
    category: 'UTILITY',
    language: 'es',
    tone: 'ultimo_recordatorio',
    body_text:
      'Hola {{1}}, te escribe {{3}}. Este es nuestro último recordatorio sobre el presupuesto del plan de tratamiento que te enviamos. ' +
      'Si quieres conversarlo o ajustar algo, este es el momento — coordinemos esta semana. ' +
      'Respóndenos por aquí o llámanos al {{4}}. Si decides postergarlo, también está bien, solo cuéntanos para mantener tu caso al día.',
    variable_mapping: {
      '1': 'paciente_nombre',
      '2': 'doctor_nombre',
      '3': 'clinica_nombre',
      '4': 'clinica_telefono',
    },
    sample_values: {
      '1': 'María',
      '2': 'Dra. Angela Quispe',
      '3': 'Vitra Fertilidad',
      '4': '+51 999 123 456',
    },
  },
];
