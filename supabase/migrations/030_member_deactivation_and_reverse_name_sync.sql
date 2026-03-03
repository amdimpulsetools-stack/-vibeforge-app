-- =============================================
-- Migration 030: Member deactivation + Reverse name sync
--
-- 1. Add is_active column to organization_members for soft-deactivation
-- 2. Trigger: when doctors.full_name changes → sync to user_profiles.full_name
--    (reverse of migration 028's user_profiles → doctors sync)
-- 3. Trigger: when organization_members.is_active changes to false
--    → deactivate the linked doctor record
-- =============================================

-- ─── 1. Add is_active to organization_members ──────────────────────────
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ─── 2. Reverse name sync: doctors.full_name → user_profiles.full_name ─
CREATE OR REPLACE FUNCTION sync_doctor_name_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     AND NEW.user_id IS NOT NULL THEN
    UPDATE user_profiles
    SET full_name = NEW.full_name
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_doctor_name_change ON doctors;

CREATE TRIGGER on_doctor_name_change
  AFTER UPDATE ON doctors
  FOR EACH ROW
  EXECUTE FUNCTION sync_doctor_name_to_profile();

-- ─── 3. Auto-deactivate doctor when member is deactivated ──────────────
CREATE OR REPLACE FUNCTION sync_member_active_to_doctor()
RETURNS TRIGGER AS $$
BEGIN
  -- When member is deactivated, deactivate linked doctor
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NEW.is_active = false
     AND NEW.role = 'doctor' THEN
    UPDATE doctors
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND organization_id = NEW.organization_id;
  END IF;

  -- When member is reactivated, reactivate linked doctor
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NEW.is_active = true
     AND NEW.role = 'doctor' THEN
    UPDATE doctors
    SET is_active = true
    WHERE user_id = NEW.user_id
      AND organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_member_active_change ON organization_members;

CREATE TRIGGER on_member_active_change
  AFTER UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION sync_member_active_to_doctor();

-- ─── 4. Auto-deactivate doctor when member is deleted ──────────────────
CREATE OR REPLACE FUNCTION deactivate_doctor_on_member_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role = 'doctor' THEN
    UPDATE doctors
    SET is_active = false
    WHERE user_id = OLD.user_id
      AND organization_id = OLD.organization_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_member_delete_deactivate_doctor ON organization_members;

CREATE TRIGGER on_member_delete_deactivate_doctor
  BEFORE DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION deactivate_doctor_on_member_delete();
