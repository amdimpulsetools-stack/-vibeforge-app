-- =============================================
-- TABLA: lookup_categories
-- Tipos de listas desplegables
-- =============================================
CREATE TABLE IF NOT EXISTS lookup_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE lookup_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lookup_categories"
  ON lookup_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert lookup_categories"
  ON lookup_categories FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update lookup_categories"
  ON lookup_categories FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete lookup_categories"
  ON lookup_categories FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_lookup_categories
  BEFORE UPDATE ON lookup_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TABLA: lookup_values
-- Items individuales de cada lista
-- =============================================
CREATE TABLE IF NOT EXISTS lookup_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES lookup_categories(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_default BOOLEAN DEFAULT false NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(category_id, value)
);

ALTER TABLE lookup_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lookup_values"
  ON lookup_values FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert lookup_values"
  ON lookup_values FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update lookup_values"
  ON lookup_values FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete lookup_values"
  ON lookup_values FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_lookup_values
  BEFORE UPDATE ON lookup_values
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Seed: Categorías y valores por defecto
-- =============================================
INSERT INTO lookup_categories (slug, name, description, is_system) VALUES
  ('origin', 'Origen del Paciente', 'De dónde conoció al consultorio (marketing)', true),
  ('payment_method', 'Método de Pago', 'Formas de pago aceptadas', true),
  ('appointment_status', 'Estado de Cita', 'Estados posibles de una cita', true),
  ('responsible', 'Responsable', 'Personas responsables de seguimiento', true);

-- Orígenes (Marketing)
INSERT INTO lookup_values (category_id, label, value, display_order)
SELECT id, 'TikTok', 'tiktok', 1 FROM lookup_categories WHERE slug = 'origin'
UNION ALL
SELECT id, 'Instagram', 'instagram', 2 FROM lookup_categories WHERE slug = 'origin'
UNION ALL
SELECT id, 'Google', 'google', 3 FROM lookup_categories WHERE slug = 'origin'
UNION ALL
SELECT id, 'Recomendado', 'recommended', 4 FROM lookup_categories WHERE slug = 'origin';

-- Métodos de Pago
INSERT INTO lookup_values (category_id, label, value, display_order)
SELECT id, 'Efectivo', 'cash', 1 FROM lookup_categories WHERE slug = 'payment_method'
UNION ALL
SELECT id, 'Yape', 'yape', 2 FROM lookup_categories WHERE slug = 'payment_method'
UNION ALL
SELECT id, 'Visa', 'visa', 3 FROM lookup_categories WHERE slug = 'payment_method';

-- Estados de Cita (con colores de borde)
INSERT INTO lookup_values (category_id, label, value, color, display_order)
SELECT id, 'Programada', 'scheduled', '#9ca3af', 1 FROM lookup_categories WHERE slug = 'appointment_status'
UNION ALL
SELECT id, 'Confirmada', 'confirmed', '#3b82f6', 2 FROM lookup_categories WHERE slug = 'appointment_status'
UNION ALL
SELECT id, 'Completada', 'completed', '#22c55e', 3 FROM lookup_categories WHERE slug = 'appointment_status'
UNION ALL
SELECT id, 'Cancelada', 'cancelled', '#ef4444', 4 FROM lookup_categories WHERE slug = 'appointment_status';

-- Responsables
INSERT INTO lookup_values (category_id, label, value, display_order)
SELECT id, 'Sofia', 'sofia', 1 FROM lookup_categories WHERE slug = 'responsible'
UNION ALL
SELECT id, 'Carla', 'carla', 2 FROM lookup_categories WHERE slug = 'responsible';
