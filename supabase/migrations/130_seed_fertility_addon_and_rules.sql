-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 130: Seed inicial del addon fertility (basic + premium),
-- categorías canónicas y reglas globales (templates) del módulo de
-- Seguimientos Automatizados.
--
-- - fertility_basic y fertility_premium comparten tier_group='fertility'
--   (mutuamente exclusivos). fertility_basic incluye el módulo de
--   seguimientos. fertility_premium queda visible pero no activable
--   hasta la iteración 2 (representa el "Próximamente" del UI).
-- - 14 categorías canónicas (spec sec. 3).
-- - 3 reglas globales con organization_id NULL e is_system=true. Las
--   plantillas (whatsapp_template_id, email_template_key) se vinculan
--   en la mig 131 después de sembrar templates.
--
-- Idempotente: ON CONFLICT DO NOTHING / UPDATE según corresponda.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Addons fertility_basic + fertility_premium ─────────────────
INSERT INTO addons (key, name, description, category, specialties, icon, is_premium, min_plan, sort_order, tier_group)
VALUES
  (
    'fertility_basic',
    'Pack Fertilidad — Básico',
    'Seguimientos automatizados para clínicas de fertilidad. Reduce la pérdida silenciosa de pacientes entre la 1ra y la 2da consulta con reglas pre-configuradas, atribución honesta de recuperaciones y plantillas de WhatsApp/email aprobadas para el tono peruano.',
    'specialty',
    '{ginecologia-obstetricia,medicina-reproductiva}',
    'HeartHandshake',
    false,
    'starter',
    11,
    'fertility'
  ),
  (
    'fertility_premium',
    'Pack Fertilidad — Premium',
    'Próximamente. Incluye todo lo del pack básico más: constructor de reglas custom, plantillas editables por la clínica, cascadas de canales (WhatsApp + email + SMS), reportes de conversión por médico y dashboards avanzados de embudo de tratamiento.',
    'specialty',
    '{ginecologia-obstetricia,medicina-reproductiva}',
    'HeartHandshake',
    true,
    'professional',
    12,
    'fertility'
  )
ON CONFLICT (key) DO UPDATE
  SET tier_group = EXCLUDED.tier_group,
      description = EXCLUDED.description,
      specialties = EXCLUDED.specialties,
      sort_order = EXCLUDED.sort_order;

-- ── 2. Categorías canónicas del addon fertility ───────────────────
INSERT INTO addon_canonical_categories (addon_key, category_key, display_name, description, sort_order) VALUES
  ('fertility', 'fertility.first_consultation',       'Primera consulta de fertilidad',  'Primera consulta presencial o virtual con la paciente.', 10),
  ('fertility', 'fertility.second_consultation',      'Segunda consulta de fertilidad',  'Segunda consulta de evaluación, generalmente con resultados.', 20),
  ('fertility', 'fertility.continuing_consultation',  'Consulta continuadora',           'Consulta de seguimiento general dentro del journey.', 30),
  ('fertility', 'fertility.treatment_decision',       'Decisión de tratamiento',         'Cita en la que se decide el plan de tratamiento.', 40),
  ('fertility', 'fertility.treatment_initiated',      'Inicio de tratamiento',           'Inicio efectivo del tratamiento (FIV / IIU / Inducción).', 50),
  ('fertility', 'fertility.follicular_aspiration',    'Aspiración folicular',            'Procedimiento de aspiración folicular.', 60),
  ('fertility', 'fertility.embryo_transfer',          'Transferencia embrionaria',       'Transferencia embrionaria.', 70),
  ('fertility', 'fertility.beta_hcg_check',           'Control beta-HCG',                'Control de beta-HCG post-transferencia.', 80),
  ('fertility', 'fertility.cryo_first_control',       'Primer control crioterapia',      'Primer control de crioterapia.', 90),
  ('fertility', 'fertility.cryo_second_control',      'Segundo control crioterapia',     'Segundo control de crioterapia.', 100),
  ('fertility', 'fertility.cryo_third_control',       'Tercer control crioterapia',      'Tercer control de crioterapia.', 110),
  ('fertility', 'fertility.endometrial_control',      'Control endometrial',             'Control endometrial previo a transferencia.', 120),
  ('fertility', 'fertility.post_transfer_control',    'Control post-transferencia',      'Control post-transferencia embrionaria.', 130),
  ('fertility', 'fertility.results_reading',          'Lectura de resultados',           'Lectura de resultados (FIV / NGS / etc).', 140)
ON CONFLICT (category_key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      addon_key = EXCLUDED.addon_key;

-- ── 3. Reglas globales (templates) ────────────────────────────────
-- organization_id NULL = template global. Los whatsapp_template_id y
-- email_template_key se vinculan en mig 131 una vez sembradas las
-- plantillas. UNIQUE(organization_id, rule_key) trata NULLs como
-- distintos en PG; usamos un guard manual para idempotencia.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM followup_rules
    WHERE organization_id IS NULL AND rule_key = 'fertility.first_consultation_lapse'
  ) THEN
    INSERT INTO followup_rules (
      organization_id, addon_key, rule_key, trigger_event,
      trigger_category_key, target_category_key,
      delay_days, is_active, is_system, max_attempts
    ) VALUES (
      NULL, 'fertility', 'fertility.first_consultation_lapse', 'appointment_completed',
      'fertility.first_consultation', 'fertility.second_consultation',
      21, true, true, 3
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM followup_rules
    WHERE organization_id IS NULL AND rule_key = 'fertility.second_consultation_lapse'
  ) THEN
    INSERT INTO followup_rules (
      organization_id, addon_key, rule_key, trigger_event,
      trigger_category_key, target_category_key,
      delay_days, is_active, is_system, max_attempts
    ) VALUES (
      NULL, 'fertility', 'fertility.second_consultation_lapse', 'appointment_completed',
      'fertility.second_consultation', 'fertility.treatment_decision',
      14, true, true, 3
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM followup_rules
    WHERE organization_id IS NULL AND rule_key = 'fertility.budget_pending_acceptance'
  ) THEN
    INSERT INTO followup_rules (
      organization_id, addon_key, rule_key, trigger_event,
      trigger_category_key, target_category_key,
      delay_days, is_active, is_system, max_attempts
    ) VALUES (
      NULL, 'fertility', 'fertility.budget_pending_acceptance', 'treatment_plan_created',
      NULL, 'fertility.treatment_initiated',
      7, true, true, 3
    );
  END IF;
END $$;
