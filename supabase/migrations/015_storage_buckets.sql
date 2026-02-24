-- =============================================
-- MIGRATION 015: Storage Buckets for Avatars & Org Assets
-- Creates public buckets for user avatars and organization logos
-- =============================================

-- =============================================
-- SECTION 1: Create buckets
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('org-assets', 'org-assets', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SECTION 2: RLS for avatars bucket
-- Users can upload/update/delete only their own folder
-- Everyone can view (public bucket)
-- =============================================

CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =============================================
-- SECTION 3: RLS for org-assets bucket
-- Org admins can upload/update/delete their org's folder
-- Everyone can view (public bucket)
-- =============================================

CREATE POLICY "Org assets are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-assets');

CREATE POLICY "Org admins can upload org assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-assets'
    AND is_org_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Org admins can update org assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-assets'
    AND is_org_admin((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Org admins can delete org assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-assets'
    AND is_org_admin((storage.foldername(name))[1]::uuid)
  );
