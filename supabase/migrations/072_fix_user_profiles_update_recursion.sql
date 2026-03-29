-- Fix: user_profiles UPDATE policy caused recursion with peer visibility policy
-- The WITH CHECK used a sub-SELECT on user_profiles which triggered the
-- peer visibility SELECT policy → get_org_peer_user_ids() → recursion

-- Helper to get current user's is_founder without triggering RLS
CREATE OR REPLACE FUNCTION get_own_is_founder()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_founder, false) FROM user_profiles WHERE id = auth.uid();
$$;

-- Recreate update policy using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Users can update own profile (safe columns)" ON user_profiles;
CREATE POLICY "Users can update own profile (safe columns)"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_founder = get_own_is_founder());
