-- Add responsible_user_id to appointments for accurate name tracking
-- When a member changes their name, the dashboard shows the current name

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS responsible_user_id uuid DEFAULT NULL
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing data by matching responsible text to user_profiles
-- Uses ILIKE for case-insensitive partial matching (first name match)
UPDATE appointments
SET responsible_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (a.id) a.id as appt_id, up.id as user_id
  FROM appointments a
  JOIN organization_members om ON om.organization_id = a.organization_id
  JOIN user_profiles up ON up.id = om.user_id
  WHERE a.responsible IS NOT NULL AND a.responsible != '' AND a.responsible_user_id IS NULL
    AND up.full_name ILIKE a.responsible || '%'
  ORDER BY a.id
) sub
WHERE appointments.id = sub.appt_id;
