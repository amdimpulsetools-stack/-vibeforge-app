-- Fix RLS policies: roles are owner/admin/doctor/receptionist, NOT 'member'

-- exam_orders: drop and recreate insert/update policies
DROP POLICY IF EXISTS "exam_orders_insert" ON exam_orders;
DROP POLICY IF EXISTS "exam_orders_update" ON exam_orders;

CREATE POLICY "exam_orders_insert" ON exam_orders
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
    )
  );

CREATE POLICY "exam_orders_update" ON exam_orders
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
    )
  );

-- exam_order_items: drop and recreate insert/update policies
DROP POLICY IF EXISTS "exam_order_items_insert" ON exam_order_items;
DROP POLICY IF EXISTS "exam_order_items_update" ON exam_order_items;

CREATE POLICY "exam_order_items_insert" ON exam_order_items
  FOR INSERT WITH CHECK (
    order_id IN (
      SELECT id FROM exam_orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
      )
    )
  );

CREATE POLICY "exam_order_items_update" ON exam_order_items
  FOR UPDATE USING (
    order_id IN (
      SELECT id FROM exam_orders WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
      )
    )
  );

-- Also fix specialty_clinical_data policies
DROP POLICY IF EXISTS "scd_write" ON specialty_clinical_data;
DROP POLICY IF EXISTS "scd_update" ON specialty_clinical_data;

CREATE POLICY "scd_write" ON specialty_clinical_data
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
    )
  );

CREATE POLICY "scd_update" ON specialty_clinical_data
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'doctor')
    )
  );
