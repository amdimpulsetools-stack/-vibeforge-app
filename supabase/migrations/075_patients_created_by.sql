-- Add created_by to patients for doctor-created patient visibility
-- Doctors can see patients they created even without appointments

ALTER TABLE patients ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update patients RLS to include created_by condition
DROP POLICY IF EXISTS "org_select_patients" ON patients;

CREATE POLICY "org_select_patients"
  ON patients FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND (
      NOT is_doctor_patients_restricted(organization_id)
      OR get_user_org_role(organization_id) <> 'doctor'
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        WHERE a.patient_id = patients.id
          AND a.organization_id = patients.organization_id
          AND d.user_id = auth.uid()
      )
    )
  );
