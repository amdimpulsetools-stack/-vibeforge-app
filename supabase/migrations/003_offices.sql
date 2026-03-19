-- =============================================
-- TABLA: offices (Consultorios)
-- Espacios físicos para citas
-- =============================================
CREATE TABLE IF NOT EXISTS offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view offices"
  ON offices FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert offices"
  ON offices FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update offices"
  ON offices FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete offices"
  ON offices FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE TRIGGER set_updated_at_offices
  BEFORE UPDATE ON offices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Seed: Consultorios por defecto
INSERT INTO offices (name, description, display_order) VALUES
  ('Consultorio 1', 'Consultorio principal', 1),
  ('Consultorio 2', 'Consultorio secundario', 2);
