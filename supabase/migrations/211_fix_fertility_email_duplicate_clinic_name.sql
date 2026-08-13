-- 211: corrige la doble mención del nombre en los correos de fertilidad
--
-- Problema: dos plantillas de fertilidad nombran al doctor y a la clínica en la
-- misma frase. En el plan Independiente ambos valores son el mismo (la
-- organización ES el profesional), así que la paciente recibía frases como
-- "tu primera consulta con Dra. Patricia Quispe en Dra. Patricia Quispe".
--
-- Solución: cada nombre aparece una sola vez. El doctor queda en el cuerpo y la
-- clínica en la firma ("Equipo de {{clinica_nombre}}"), que ya estaba presente.
-- Se lee bien tanto si los nombres coinciden como si son distintos.
--
-- Se usa replace() sobre el fragmento exacto en vez de sobrescribir el cuerpo
-- completo, para no pisar los textos que cada clínica haya personalizado.
-- Idempotente: el WHERE evita reaplicar el cambio.

-- ── 1. Recordatorio de segunda consulta ──────────────────────────────────
UPDATE email_templates
SET body       = replace(body,
                   'con {{doctor_nombre}} en {{clinica_nombre}}',
                   'con {{doctor_nombre}}'),
    updated_at = now()
WHERE slug = 'fertility_first_consultation_lapse'
  AND body LIKE '%con {{doctor_nombre}} en {{clinica_nombre}}%';

UPDATE email_templates
SET body_html  = replace(body_html,
                   'con {{doctor_nombre}} en {{clinica_nombre}}',
                   'con {{doctor_nombre}}'),
    updated_at = now()
WHERE slug = 'fertility_first_consultation_lapse'
  AND body_html LIKE '%con {{doctor_nombre}} en {{clinica_nombre}}%';

-- ── 2. Recordatorio de decisión de tratamiento ───────────────────────────
UPDATE email_templates
SET body       = replace(body,
                   'Te escribimos desde {{clinica_nombre}} para retomar contacto',
                   'Te escribimos para retomar contacto'),
    updated_at = now()
WHERE slug = 'fertility_second_consultation_lapse'
  AND body LIKE '%Te escribimos desde {{clinica_nombre}} para retomar contacto%';

UPDATE email_templates
SET body_html  = replace(body_html,
                   'Te escribimos desde {{clinica_nombre}} para retomar contacto',
                   'Te escribimos para retomar contacto'),
    updated_at = now()
WHERE slug = 'fertility_second_consultation_lapse'
  AND body_html LIKE '%Te escribimos desde {{clinica_nombre}} para retomar contacto%';
