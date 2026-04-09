-- ============================================
-- Exam catalog + exam orders system
-- ============================================

-- Exam categories (Laboratorio, Imagenología, Otros)
CREATE TABLE IF NOT EXISTS exam_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

ALTER TABLE exam_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_categories_read" ON exam_categories
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "exam_categories_manage" ON exam_categories
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Exam catalog (individual exam types)
CREATE TABLE IF NOT EXISTS exam_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES exam_categories(id) ON DELETE CASCADE,
  code TEXT,                    -- optional lab code (e.g. "HEM-001")
  default_instructions TEXT,    -- e.g. "En ayunas 8 horas"
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

ALTER TABLE exam_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_catalog_read" ON exam_catalog
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "exam_catalog_manage" ON exam_catalog
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Exam orders (one order per appointment/visit)
CREATE TABLE IF NOT EXISTS exam_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id),
  appointment_id UUID REFERENCES appointments(id),
  clinical_note_id UUID,
  diagnosis TEXT,               -- presumptive diagnosis
  diagnosis_code TEXT,          -- CIE-10 code
  notes TEXT,                   -- general notes for the order
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'completed')),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_orders_patient ON exam_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_exam_orders_org ON exam_orders(organization_id);

ALTER TABLE exam_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_orders_read" ON exam_orders
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "exam_orders_insert" ON exam_orders
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "exam_orders_update" ON exam_orders
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

-- Exam order items (individual exams within an order)
CREATE TABLE IF NOT EXISTS exam_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES exam_orders(id) ON DELETE CASCADE,
  exam_catalog_id UUID REFERENCES exam_catalog(id),
  exam_name TEXT NOT NULL,      -- denormalized for history (catalog item may change)
  instructions TEXT,            -- specific instructions for this exam
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  result_notes TEXT,            -- brief result annotation
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_order_items_order ON exam_order_items(order_id);

ALTER TABLE exam_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_order_items_read" ON exam_order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM exam_orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "exam_order_items_insert" ON exam_order_items
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT id FROM exam_orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
      )
    )
  );

CREATE POLICY "exam_order_items_update" ON exam_order_items
  FOR UPDATE USING (
    order_id IN (
      SELECT id FROM exam_orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
      )
    )
  );
