-- Fix: Replace recursive policy with SECURITY DEFINER function
-- The original policy caused infinite recursion because:
-- user_profiles SELECT → get_user_org_ids() → organization_members SELECT
-- → get_user_org_ids() → organization_members SELECT → ...

DROP POLICY IF EXISTS "Members can view org peer profiles" ON user_profiles;

-- SECURITY DEFINER function bypasses RLS, breaking the recursion chain
CREATE OR REPLACE FUNCTION get_org_peer_user_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT om2.user_id
  FROM organization_members om1
  JOIN organization_members om2 ON om2.organization_id = om1.organization_id
  WHERE om1.user_id = auth.uid();
$$;

CREATE POLICY "Members can view org peer profiles"
  ON user_profiles FOR SELECT
  USING (id IN (SELECT get_org_peer_user_ids()));
