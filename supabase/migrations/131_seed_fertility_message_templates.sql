-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 131: Seed de plantillas de mensaje del addon fertility.
--
-- Plantillas email globales (organization_id NULL) en message_templates,
-- en español peruano, con tonos amable y directo según corresponda.
--
-- Decisión de arquitectura:
--   whatsapp_templates.organization_id es NOT NULL (mig 048) — es una
--   tabla per-org porque cada plantilla debe submitirse a Meta para
--   aprobación bajo la WABA de la clínica. NO se pueden sembrar
--   plantillas WhatsApp globales con NULL aquí.
--   Por lo tanto las plantillas WhatsApp Meta-ready quedan como
--   recurso estático en lib/fertility/whatsapp-templates.ts y se
--   insertan per-org cuando el admin activa el addon (lógica del
--   endpoint de activación, no de esta migración).
--
-- Después de sembrar emails, vinculamos email_template_key en las
-- reglas globales de followup_rules.
--
-- Tono: peruano natural — "te saludamos", "para no perder el avance",
-- "estamos para ayudarte". Cierre cálido, NO formal trámite.
--
-- Variables disponibles: {{paciente_nombre}}, {{doctor_nombre}},
-- {{clinica_nombre}}, {{clinica_telefono}}, {{primera_cita_fecha}},
-- {{dias_transcurridos}}.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Plantillas email globales ──────────────────────────────────
-- 6 emails en total: 2 reglas con (amable + directo) + 1 regla solo amable.
-- Idempotencia: UNIQUE(organization_id, template_key, channel, tone).
-- En Postgres NULL no es igual a NULL para UNIQUE, así que usamos
-- guards manuales con NOT EXISTS.

DO $$
BEGIN
  -- ── fertility.first_consultation_lapse — amable ────────────────
  IF NOT EXISTS (
    SELECT 1 FROM message_templates
    WHERE organization_id IS NULL
      AND template_key = 'fertility.first_consultation_lapse'
      AND channel = 'email' AND tone = 'amable'
  ) THEN
    INSERT INTO message_templates (
      organization_id, addon_key, template_key, channel, tone,
      subject, body, is_system
    ) VALUES (
      NULL, 'fertility', 'fertility.first_consultation_lapse', 'email', 'amable',
      'Hola {{paciente_nombre}}, ¿coordinamos tu segunda consulta?',
      'Hola {{paciente_nombre}},' || E'\n\n' ||
      'Te saluda el equipo de {{clinica_nombre}}. Hace {{dias_transcurridos}} días tuviste tu primera consulta con {{doctor_nombre}} y queríamos saber cómo te has sentido y si tienes alguna duda sobre los siguientes pasos.' || E'\n\n' ||
      'Para continuar con tu evaluación, lo ideal es agendar la segunda consulta esta o la próxima semana. Así {{doctor_nombre}} puede revisar contigo los resultados y conversar sobre opciones.' || E'\n\n' ||
      'Si te queda más cómodo, podemos coordinar por aquí o llamarte. Solo respóndenos a este correo o escríbenos al {{clinica_telefono}}.' || E'\n\n' ||
      'Estamos para ayudarte.' || E'\n' ||
      '{{clinica_nombre}}',
      true
    );
  END IF;

  -- ── fertility.first_consultation_lapse — directo ───────────────
  IF NOT EXISTS (
    SELECT 1 FROM message_templates
    WHERE organization_id IS NULL
      AND template_key = 'fertility.first_consultation_lapse'
      AND channel = 'email' AND tone = 'directo'
  ) THEN
    INSERT INTO message_templates (
      organization_id, addon_key, template_key, channel, tone,
      subject, body, is_system
    ) VALUES (
      NULL, 'fertility', 'fertility.first_consultation_lapse', 'email', 'directo',
      'Recordatorio: aún tienes pendiente tu segunda consulta',
      'Hola {{paciente_nombre}},' || E'\n\n' ||
      'Te escribimos desde {{clinica_nombre}}. Notamos que aún no has agendado tu segunda consulta con {{doctor_nombre}}, y ya pasaron {{dias_transcurridos}} días desde tu primera cita.' || E'\n\n' ||
      'Para no perder el avance de tu evaluación, te recomendamos coordinar tu próxima cita esta semana. La continuidad es clave en este proceso.' || E'\n\n' ||
      'Responde este correo para coordinar día y hora, o llámanos al {{clinica_telefono}}.' || E'\n\n' ||
      'Quedamos atentos.' || E'\n' ||
      '{{clinica_nombre}}',
      true
    );
  END IF;

  -- ── fertility.second_consultation_lapse — amable ───────────────
  IF NOT EXISTS (
    SELECT 1 FROM message_templates
    WHERE organization_id IS NULL
      AND template_key = 'fertility.second_consultation_lapse'
      AND channel = 'email' AND tone = 'amable'
  ) THEN
    INSERT INTO message_templates (
      organization_id, addon_key, template_key, channel, tone,
      subject, body, is_system
    ) VALUES (
      NULL, 'fertility', 'fertility.second_consultation_lapse', 'email', 'amable',
      'Hola {{paciente_nombre}}, conversemos sobre los siguientes pasos',
      'Hola {{paciente_nombre}},' || E'\n\n' ||
      'Te saluda el equipo de {{clinica_nombre}}. Después de tu segunda consulta con {{doctor_nombre}} queríamos saber cómo te sientes y si ya pudiste pensar en los siguientes pasos.' || E'\n\n' ||
      'Cuando estés lista, podemos coordinar una cita para conversar sobre el plan de tratamiento que mejor se ajusta a ti. Sin presión — solo cuéntanos cuándo te queda bien.' || E'\n\n' ||
      'Puedes responder a este correo o llamarnos al {{clinica_telefono}}.' || E'\n\n' ||
      'Estamos para ayudarte en lo que necesites.' || E'\n' ||
      '{{clinica_nombre}}',
      true
    );
  END IF;

  -- ── fertility.second_consultation_lapse — directo ──────────────
  IF NOT EXISTS (
    SELECT 1 FROM message_templates
    WHERE organization_id IS NULL
      AND template_key = 'fertility.second_consultation_lapse'
      AND channel = 'email' AND tone = 'directo'
  ) THEN
    INSERT INTO message_templates (
      organization_id, addon_key, template_key, channel, tone,
      subject, body, is_system
    ) VALUES (
      NULL, 'fertility', 'fertility.second_consultation_lapse', 'email', 'directo',
      'Tu plan de tratamiento está pendiente — coordinemos esta semana',
      'Hola {{paciente_nombre}},' || E'\n\n' ||
      'Te escribimos desde {{clinica_nombre}}. Han pasado {{dias_transcurridos}} días desde tu última consulta con {{doctor_nombre}} y aún no hemos coordinado la cita para definir tu plan de tratamiento.' || E'\n\n' ||
      'Para que el avance no se enfríe, te recomendamos agendar esta semana. Cada día cuenta cuando se trata de tomar decisiones de tratamiento.' || E'\n\n' ||
      'Respóndenos a este correo o escríbenos al {{clinica_telefono}} y coordinamos día y hora.' || E'\n\n' ||
      'Quedamos atentos.' || E'\n' ||
      '{{clinica_nombre}}',
      true
    );
  END IF;

  -- ── fertility.budget_pending_acceptance — amable ───────────────
  -- (Esta regla solo tiene tono amable según el spec.)
  IF NOT EXISTS (
    SELECT 1 FROM message_templates
    WHERE organization_id IS NULL
      AND template_key = 'fertility.budget_pending_acceptance'
      AND channel = 'email' AND tone = 'amable'
  ) THEN
    INSERT INTO message_templates (
      organization_id, addon_key, template_key, channel, tone,
      subject, body, is_system
    ) VALUES (
      NULL, 'fertility', 'fertility.budget_pending_acceptance', 'email', 'amable',
      'Hola {{paciente_nombre}}, ¿pudiste revisar tu presupuesto?',
      'Hola {{paciente_nombre}},' || E'\n\n' ||
      'Te saluda el equipo de {{clinica_nombre}}. Hace unos días te enviamos el presupuesto del plan de tratamiento que te recomendó {{doctor_nombre}}.' || E'\n\n' ||
      '¿Has tenido oportunidad de revisarlo? Si tienes preguntas sobre alguna parte —pasos, tiempos, opciones de pago— con gusto las conversamos. No hay apuro: solo queremos asegurarnos de que tengas toda la información clara para decidir.' || E'\n\n' ||
      'Puedes responder a este correo o llamarnos al {{clinica_telefono}}.' || E'\n\n' ||
      'Estamos para ayudarte.' || E'\n' ||
      '{{clinica_nombre}}',
      true
    );
  END IF;
END $$;

-- ── 2. Vincular email_template_key en reglas globales ─────────────
-- whatsapp_template_id se queda NULL en las reglas globales: las
-- plantillas WhatsApp se siembran per-org al activar el addon
-- (ver lib/fertility/whatsapp-templates.ts).
UPDATE followup_rules
SET email_template_key = 'fertility.first_consultation_lapse'
WHERE organization_id IS NULL
  AND rule_key = 'fertility.first_consultation_lapse'
  AND email_template_key IS DISTINCT FROM 'fertility.first_consultation_lapse';

UPDATE followup_rules
SET email_template_key = 'fertility.second_consultation_lapse'
WHERE organization_id IS NULL
  AND rule_key = 'fertility.second_consultation_lapse'
  AND email_template_key IS DISTINCT FROM 'fertility.second_consultation_lapse';

UPDATE followup_rules
SET email_template_key = 'fertility.budget_pending_acceptance'
WHERE organization_id IS NULL
  AND rule_key = 'fertility.budget_pending_acceptance'
  AND email_template_key IS DISTINCT FROM 'fertility.budget_pending_acceptance';
