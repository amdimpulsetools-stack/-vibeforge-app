-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 168: organizations.icon_url — compact icon for topbar/favicon
--
-- The org's `logo_url` is designed for documents (PDF presupuestos,
-- emails, the public booking page) and is typically a wide-format
-- horizontal lockup. It does not always crop or scale well into the
-- ~32 px square slot in the sidebar/topbar, nor into a 16-32 px
-- favicon. This adds a separate slot for a compact square icon.
--
-- Both fields stay independently editable in Settings → Organización.
-- The frontend uses icon_url for topbar + favicon if present, and
-- falls back to logo_url so existing orgs (which only have logo_url
-- set) keep working without any data migration.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS icon_url TEXT;

COMMENT ON COLUMN organizations.icon_url IS
  'URL de un ícono cuadrado compacto (ideal 256×256, PNG/SVG/WEBP) usado en topbar/sidebar y favicon. Diferente de logo_url, que sigue siendo el lockup horizontal para documentos. Si NULL, el frontend cae a logo_url.';
