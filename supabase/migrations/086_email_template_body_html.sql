-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 086: Rich-text (HTML) body for email templates
--
-- Adds an optional `body_html` column to `email_templates`. The existing
-- `body` column (plain text) remains the source of truth for all
-- seeded templates and older templates that haven't been edited in the
-- new rich-text editor.
--
-- Send pipeline behavior (implemented in application code):
--   • If `body_html` IS NOT NULL  → sanitize + inject directly inside
--     the email template shell (no plain-text escaping).
--   • Else                       → escape `body` and convert \n → <br/>
--     as before (unchanged legacy behavior).
--
-- Backward-compatible by design:
--   • No existing template is touched.
--   • `body` is still required (NOT NULL) — nothing can break if the
--     HTML rendering path is skipped.
--   • Drop-column rollback is trivial (see rollback file).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS body_html TEXT;

COMMENT ON COLUMN email_templates.body_html IS
  'Optional sanitized HTML body. When present, takes precedence over `body` '
  'at send time. Populated by the rich-text editor in the Settings tab.';
