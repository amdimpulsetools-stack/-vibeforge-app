-- =============================================
-- Migration 015: Member management helpers
-- Adds email to user_profiles + RPC to find user by email
-- =============================================

-- 1. Add email column to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Backfill existing users' emails from auth.users
UPDATE user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND up.email IS NULL;

-- 3. Update the sign-up trigger to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: find a user by email (returns user_id or null)
-- Only callable by org admins (enforced at API level)
CREATE OR REPLACE FUNCTION find_user_by_email(lookup_email TEXT)
RETURNS UUID AS $$
  SELECT id FROM user_profiles WHERE email = lookup_email LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5. Allow org members to see profiles in their org (already exists, but ensure)
-- The policy "Members can view profiles in same org" from 013 handles this.
