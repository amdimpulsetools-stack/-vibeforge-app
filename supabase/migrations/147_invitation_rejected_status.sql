-- Migration 147: allow invitations to be rejected by the invitee.
--
-- Until now the only terminal states were 'accepted' (invitee joined),
-- 'expired' (expires_at passed) and 'cancelled' (admin revoked). When
-- an invitee clicked the magic link, the auth callback auto-called
-- accept_invitation() and there was no way to say "no, this wasn't me"
-- or "I don't want to join this clinic". This release moves acceptance
-- to an explicit click on /register?invite=TOKEN and adds a 'rejected'
-- terminal state for the new Rechazar button.

ALTER TABLE organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_status_check;

ALTER TABLE organization_invitations
  ADD CONSTRAINT organization_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'rejected'));
