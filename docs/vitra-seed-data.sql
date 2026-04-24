-- ==============================================================
-- VITRA — Seed data template
-- ==============================================================
-- Plantilla para poblar los catálogos iniciales de Vitra.
-- INSTRUCCIONES:
--   1. Reemplaza los valores entre <<<BRACKETS>>> con los datos reales
--      que te pase Vitra.
--   2. Corre bloque por bloque (no todo de una) para verificar entre cada
--      uno que no hay errores.
--   3. Los precios son estimados típicos en Lima — ajusta a los de Vitra.
--   4. `requires_consent = TRUE` en procedimientos invasivos por Ley 29414.
--
-- Prerequisitos:
--   - Organization "Vitra" ya creada
--   - Owner ya invitado y con membership activa
-- ==============================================================


-- === PASO 0: Encontrar el organization_id de Vitra ==============
-- Pega el resultado en <<<VITRA_ORG_ID>>> de los bloques siguientes.

SELECT id, name, slug
FROM organizations
WHERE name ILIKE '%vitra%' OR slug ILIKE '%vitra%';


-- === PASO 1: Organization info ==================================

UPDATE organizations
SET
  name = 'Vitra — Centro de Fertilidad',      -- Nombre de display
  slug = 'vitra',                              -- URL: /book/vitra, /portal/vitra
  address = '<<<DIRECCION>>>',                 -- Ej: "Av. Javier Prado 123, San Isidro, Lima"
  organization_type = 'centro_medico',
  logo_url = NULL                              -- Set luego con upload a Storage
WHERE id = '<<<VITRA_ORG_ID>>>';


-- === PASO 2: global_variables — datos de contacto ===============

-- clinic_phone (y WhatsApp)
UPDATE global_variables
SET value = '<<<TELEFONO>>>'                   -- Ej: '+51 999 888 777' (el mismo usable para WhatsApp)
WHERE key = 'clinic_phone'
  AND organization_id = '<<<VITRA_ORG_ID>>>';

-- clinic_email
UPDATE global_variables
SET value = '<<<EMAIL>>>'                      -- Ej: 'citas@vitra.pe'
WHERE key = 'clinic_email'
  AND organization_id = '<<<VITRA_ORG_ID>>>';

-- Si la clínica usa prefijo específico en recordatorios, etc:
-- UPDATE global_variables SET value = 'Vitra' WHERE key = 'clinic_name' AND organization_id = '<<<VITRA_ORG_ID>>>';


-- === PASO 3: booking_settings — configuración de agenda =========

UPDATE booking_settings
SET
  is_enabled = TRUE,                            -- Activa /book público
  allow_online_booking = TRUE,                  -- Paciente puede reservar desde portal. Si Vitra prefiere "solo recepción", set FALSE.
  portal_enabled = TRUE,                        -- Activa /portal
  portal_allow_cancel = TRUE,                   -- Paciente puede cancelar su cita
  portal_allow_reschedule = FALSE,              -- Reprogramar desde portal no está listo aún
  portal_min_cancel_hours = 24,                 -- Mínimo 24h de antelación para cancelar
  portal_welcome_message = 'Bienvenida a Vitra. Aquí puedes ver tus próximas citas, tu plan de tratamiento y descargar tus consentimientos.',
  max_advance_days = 60,                        -- Horizonte del /book (60 días)
  min_lead_hours = 4,                           -- Mínimo 4h de antelación para reservar
  welcome_message = 'Agenda tu cita con nuestro equipo de fertilidad.',
  require_email = TRUE,                         -- Email necesario para portal
  require_phone = TRUE,                         -- Tel para WhatsApp recordatorios
  require_dni = TRUE,                           -- DNI para ficha clínica
  accent_color = '<<<HEX_MARCA>>>',             -- Ej: '#7c3aed' (morado). Pedir a Vitra su color exacto.
  discounts_enabled = TRUE                      -- Permite descuentos manuales en citas
WHERE organization_id = '<<<VITRA_ORG_ID>>>';


-- === PASO 4: offices — consultorios =============================
-- Ajusta los nombres a los reales de Vitra.

INSERT INTO offices (organization_id, name, is_active, display_order) VALUES
  ('<<<VITRA_ORG_ID>>>', 'Consultorio 202',         TRUE, 1),
  ('<<<VITRA_ORG_ID>>>', 'Consultorio 203',         TRUE, 2),
  ('<<<VITRA_ORG_ID>>>', 'Sala de Procedimientos',  TRUE, 3),
  ('<<<VITRA_ORG_ID>>>', 'Laboratorio Embriología', TRUE, 4)
ON CONFLICT DO NOTHING;

-- Copia los IDs resultantes para el siguiente paso (default_office_id de doctores)
SELECT id, name FROM offices WHERE organization_id = '<<<VITRA_ORG_ID>>>' ORDER BY display_order;


-- === PASO 5: Service categories =================================
-- Si no existen las categorías de Vitra, crearlas primero.

INSERT INTO service_categories (organization_id, name, display_order) VALUES
  ('<<<VITRA_ORG_ID>>>', 'Consultas',            1),
  ('<<<VITRA_ORG_ID>>>', 'Estudios diagnósticos', 2),
  ('<<<VITRA_ORG_ID>>>', 'Procedimientos',       3),
  ('<<<VITRA_ORG_ID>>>', 'Tratamientos',         4)
ON CONFLICT DO NOTHING;

SELECT id, name FROM service_categories WHERE organization_id = '<<<VITRA_ORG_ID>>>' ORDER BY display_order;


-- === PASO 6: Services — catálogo de fertilidad ==================
-- Reemplaza <<<CAT_CONSULTAS>>>, <<<CAT_ESTUDIOS>>>, etc. con los UUIDs
-- que te devolvió el paso 5.
-- Precios en soles. Ajusta a los reales de Vitra.

INSERT INTO services (organization_id, category_id, name, duration_minutes, base_price, modality, is_active, requires_consent) VALUES
  -- Consultas
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_CONSULTAS>>>',     '1era Consulta de Fertilidad',       45, 200.00, 'in_person', TRUE, FALSE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_CONSULTAS>>>',     'Consulta de control',                30, 120.00, 'in_person', TRUE, FALSE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_CONSULTAS>>>',     'Teleconsulta de fertilidad',         30, 100.00, 'virtual',   TRUE, FALSE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_CONSULTAS>>>',     'Consulta ginecológica (SOP, etc.)',  45, 180.00, 'in_person', TRUE, FALSE),

  -- Estudios diagnósticos (generalmente sin consentimiento especial;
  -- sí para invasivos)
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_ESTUDIOS>>>',      'Ecografía transvaginal',             20,  90.00, 'in_person', TRUE, FALSE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_ESTUDIOS>>>',      'Foliculometría (ecografía seriada)', 15,  80.00, 'in_person', TRUE, FALSE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_ESTUDIOS>>>',      'Histerosalpingografía (HSG)',        30, 350.00, 'in_person', TRUE, TRUE),   -- invasivo con contraste
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_ESTUDIOS>>>',      'Espermograma',                       20, 120.00, 'in_person', TRUE, FALSE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_ESTUDIOS>>>',      'Mapeo de endometriosis',             60, 350.00, 'in_person', TRUE, TRUE),

  -- Procedimientos — REQUIEREN consentimiento por ley
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_PROCEDIMIENTOS>>>', 'Inseminación intrauterina (IIU)',    45,  800.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_PROCEDIMIENTOS>>>', 'Punción folicular (aspiración ovocitaria)', 60, 2500.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_PROCEDIMIENTOS>>>', 'Transferencia embrionaria',          45, 1200.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_PROCEDIMIENTOS>>>', 'Biopsia endometrial',                30,  450.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_PROCEDIMIENTOS>>>', 'Histeroscopía diagnóstica',          45,  900.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_PROCEDIMIENTOS>>>', 'Tratamiento Láser (endometriosis)',  60, 1200.00, 'in_person', TRUE, TRUE),

  -- Tratamientos (paquetes completos)
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_TRATAMIENTOS>>>',  'Ciclo de FIV completo',              60, 9500.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_TRATAMIENTOS>>>',  'Ciclo de ICSI',                      60,11500.00, 'in_person', TRUE, TRUE),
  ('<<<VITRA_ORG_ID>>>', '<<<CAT_TRATAMIENTOS>>>',  'Preservación de óvulos',             60, 6500.00, 'in_person', TRUE, TRUE)
ON CONFLICT DO NOTHING;

-- Verifica
SELECT name, base_price, requires_consent FROM services
WHERE organization_id = '<<<VITRA_ORG_ID>>>' ORDER BY base_price;


-- === PASO 7: Doctores ===========================================
-- Ajusta con los nombres reales de los doctores de Vitra.

INSERT INTO doctors (
  organization_id, full_name, cmp, specialty,
  color, default_meeting_url, default_office_id, is_active
) VALUES
  ('<<<VITRA_ORG_ID>>>', 'Dra. Angela Quispe',      '<<<CMP_ANGELA>>>', 'Ginecología y Medicina Reproductiva',
    '#f59e0b', NULL, '<<<OFFICE_CONSULTORIO_202>>>', TRUE),
  ('<<<VITRA_ORG_ID>>>', 'Dr. <<<NOMBRE_2>>>',      '<<<CMP_2>>>',      'Ginecología y Medicina Reproductiva',
    '#3b82f6', NULL, '<<<OFFICE_CONSULTORIO_203>>>', TRUE)
  -- Agregar más doctores según corresponda
ON CONFLICT DO NOTHING;

SELECT id, full_name FROM doctors WHERE organization_id = '<<<VITRA_ORG_ID>>>';


-- === PASO 8: Horarios de cada doctor (doctor_schedules) =========
-- Ajusta a los horarios reales. day_of_week: 0=Dom, 1=Lun, ..., 6=Sab.
-- Ejemplo típico: Dra. Angela Lun-Vie 8:00-17:00, Sab 9:00-13:00.

INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time) VALUES
  -- Dra. Angela Quispe
  ('<<<DOCTOR_ANGELA_ID>>>', 1, '08:00', '17:00'),  -- Lun
  ('<<<DOCTOR_ANGELA_ID>>>', 2, '08:00', '17:00'),  -- Mar
  ('<<<DOCTOR_ANGELA_ID>>>', 3, '08:00', '17:00'),  -- Mié
  ('<<<DOCTOR_ANGELA_ID>>>', 4, '08:00', '17:00'),  -- Jue
  ('<<<DOCTOR_ANGELA_ID>>>', 5, '08:00', '14:00'),  -- Vie (mediodía)
  ('<<<DOCTOR_ANGELA_ID>>>', 6, '09:00', '13:00')   -- Sab (mañana)
ON CONFLICT DO NOTHING;


-- === PASO 9: doctor_services — matriz de qué doctor atiende qué =

-- Opción fácil: cada doctor atiende TODOS los servicios.
-- Si Vitra quiere segmentar (ej: el embriólogo solo hace punción folicular
-- y transferencia), ajusta manualmente.

INSERT INTO doctor_services (doctor_id, service_id)
SELECT d.id, s.id
FROM doctors d
CROSS JOIN services s
WHERE d.organization_id = '<<<VITRA_ORG_ID>>>'
  AND s.organization_id = '<<<VITRA_ORG_ID>>>'
  AND d.is_active AND s.is_active
ON CONFLICT DO NOTHING;


-- === PASO 10: Verificaciones finales ============================

-- a) Servicios con consentimiento requerido
SELECT name, base_price FROM services
WHERE organization_id = '<<<VITRA_ORG_ID>>>' AND requires_consent = TRUE
ORDER BY name;

-- b) Doctores + especialidad + consultorio default
SELECT d.full_name, d.specialty, o.name AS default_office
FROM doctors d
LEFT JOIN offices o ON d.default_office_id = o.id
WHERE d.organization_id = '<<<VITRA_ORG_ID>>>';

-- c) Booking settings (verificación final)
SELECT is_enabled, allow_online_booking, portal_enabled,
       portal_allow_cancel, discounts_enabled, accent_color
FROM booking_settings
WHERE organization_id = '<<<VITRA_ORG_ID>>>';

-- d) Datos de contacto
SELECT key, value FROM global_variables
WHERE organization_id = '<<<VITRA_ORG_ID>>>' AND key IN ('clinic_phone', 'clinic_email');


-- ==============================================================
-- Listo. Con esto Vitra puede empezar a usar Yenda el Lunes.
-- Cualquier ajuste adicional se hace desde Settings o /admin.
-- ==============================================================
