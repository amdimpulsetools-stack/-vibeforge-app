-- Rollback for migration 120
DROP POLICY IF EXISTS "informed_consents_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "informed_consents_storage_insert" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'informed-consents';
DROP TABLE IF EXISTS informed_consents CASCADE;
