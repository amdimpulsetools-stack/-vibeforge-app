-- =============================================
-- Migration 028: Sync doctor name + cleanup duplicates
--
-- 1. Add trigger to sync user_profiles.full_name → doctors.full_name
--    so when a doctor updates their name from /account, it reflects
--    everywhere (scheduler dropdown, admin panel, etc.)
--
-- 2. Smart cleanup of duplicate doctor records: when there's an
--    auto-created doctor (PEND-* CMP, with user_id) alongside an
--    admin-created doctor (real CMP, without user_id), merge them
--    by transferring user_id to the admin-created record.
-- =============================================

-- ─── 1. Trigger: sync user_profiles.full_name → doctors.full_name ──────

CREATE OR REPLACE FUNCTION sync_profile_name_to_doctor()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    UPDATE doctors
    SET full_name = NEW.full_name
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS on_profile_name_change ON user_profiles;

CREATE TRIGGER on_profile_name_change
  AFTER UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_name_to_doctor();


-- ─── 2. Cleanup: merge PEND-* duplicates into admin-created doctors ────
--
-- Scenario: Admin created "Dr. Duran Lopez" (no user_id, real CMP).
-- Later, user "Jose Lopez" was invited → auto-created a second doctor
-- with PEND-* CMP and user_id set. Names don't match so migration 027
-- couldn't merge them.
--
-- Strategy: For each auto-created doctor (PEND-* CMP, has user_id),
-- if it has NO appointments of its own, and there exists exactly ONE
-- unlinked admin-created doctor in the same org, transfer the user_id
-- and delete the auto-created record.

DO $$
DECLARE
  pend RECORD;
  unlinked_doctor RECORD;
  unlinked_count INT;
  pend_appointment_count INT;
BEGIN
  -- Find all auto-created doctors (PEND-* CMP with user_id)
  FOR pend IN
    SELECT d.id, d.user_id, d.organization_id, d.full_name
    FROM doctors d
    WHERE d.user_id IS NOT NULL
      AND d.cmp LIKE 'PEND-%'
      AND d.is_active = true
  LOOP
    -- Check how many appointments this PEND doctor has
    SELECT count(*) INTO pend_appointment_count
    FROM appointments
    WHERE doctor_id = pend.id;

    -- Only proceed if the PEND doctor has no appointments
    IF pend_appointment_count = 0 THEN
      -- Count unlinked doctors in the same org
      SELECT count(*) INTO unlinked_count
      FROM doctors
      WHERE user_id IS NULL
        AND organization_id = pend.organization_id
        AND is_active = true
        AND id != pend.id;

      -- If exactly ONE unlinked doctor, it's safe to merge
      IF unlinked_count = 1 THEN
        SELECT id, full_name INTO unlinked_doctor
        FROM doctors
        WHERE user_id IS NULL
          AND organization_id = pend.organization_id
          AND is_active = true
          AND id != pend.id
        LIMIT 1;

        -- Transfer user_id to the admin-created doctor
        UPDATE doctors
        SET user_id = pend.user_id
        WHERE id = unlinked_doctor.id;

        -- Move any doctor_services from PEND to unlinked
        INSERT INTO doctor_services (doctor_id, service_id)
        SELECT unlinked_doctor.id, ds.service_id
        FROM doctor_services ds
        WHERE ds.doctor_id = pend.id
        ON CONFLICT (doctor_id, service_id) DO NOTHING;

        -- Move any doctor_schedules from PEND to unlinked
        INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, office_id, is_active)
        SELECT unlinked_doctor.id, ds.day_of_week, ds.start_time, ds.end_time, ds.office_id, ds.is_active
        FROM doctor_schedules ds
        WHERE ds.doctor_id = pend.id
        ON CONFLICT (doctor_id, day_of_week, start_time) DO NOTHING;

        -- Delete the PEND doctor record (cascades doctor_services/schedules)
        DELETE FROM doctors WHERE id = pend.id;

        RAISE NOTICE 'Merged PEND doctor "%" (%) into admin doctor "%" (%), user_id: %',
          pend.full_name, pend.id, unlinked_doctor.full_name, unlinked_doctor.id, pend.user_id;
      END IF;
    END IF;
  END LOOP;
END $$;
