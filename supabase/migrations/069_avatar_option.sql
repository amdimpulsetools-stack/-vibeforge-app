-- Add avatar_option column for SVG silhouette selection
-- Users can choose a silhouette (doctor-male, doctor-female, admin, receptionist)
-- instead of uploading a photo

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_option text DEFAULT NULL
  CHECK (avatar_option IN ('doctor-male', 'doctor-female', 'admin', 'receptionist'));
