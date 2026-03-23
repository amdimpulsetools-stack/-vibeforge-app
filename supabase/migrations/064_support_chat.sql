-- Support tickets & messages for in-app support chat
-- Each ticket belongs to an organization and tracks a conversation thread

-- ============================================================
-- support_tickets
-- ============================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject       text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'waiting', 'resolved', 'closed')),
  priority      text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for listing tickets per org
CREATE INDEX idx_support_tickets_org ON support_tickets(organization_id, status, created_at DESC);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Members can see their org's tickets
CREATE POLICY "Members can view org tickets"
  ON support_tickets FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Any authenticated member can create a ticket for their org
CREATE POLICY "Members can create tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Only the creator or admin can update (e.g. close) their ticket
CREATE POLICY "Creator or admin can update tickets"
  ON support_tickets FOR UPDATE
  USING (
    created_by = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- support_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS support_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_type   text NOT NULL DEFAULT 'user'
                CHECK (sender_type IN ('user', 'support', 'system')),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fetching messages in a ticket
CREATE INDEX idx_support_messages_ticket ON support_messages(ticket_id, created_at);

-- RLS
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Members can read messages on tickets they can see
CREATE POLICY "Members can view ticket messages"
  ON support_messages FOR SELECT
  USING (
    ticket_id IN (
      SELECT t.id FROM support_tickets t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE om.user_id = auth.uid() AND om.is_active = true
    )
  );

-- Members can send messages on their org's tickets
CREATE POLICY "Members can send messages"
  ON support_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND ticket_id IN (
      SELECT t.id FROM support_tickets t
      JOIN organization_members om ON om.organization_id = t.organization_id
      WHERE om.user_id = auth.uid() AND om.is_active = true
    )
  );

-- Auto-update ticket updated_at on new message
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_support_message_update_ticket
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
