-- =============================================
-- TABLA: service_categories
-- Categorías de servicios (ej. "Fertilidad")
-- =============================================
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view service_categories"
  ON service_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert service_categories"
  ON service_categories FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update service_categories"
  ON service_categories FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete service_categories"
  ON service_categories FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_service_categories
  BEFORE UPDATE ON service_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TABLA: services (El Menú)
-- Procedimientos individuales
-- =============================================
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  base_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 30
    CHECK (duration_minutes > 0 AND duration_minutes % 15 = 0),
  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view services"
  ON services FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert services"
  ON services FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update services"
  ON services FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can delete services"
  ON services FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TRIGGER set_updated_at_services
  BEFORE UPDATE ON services
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
