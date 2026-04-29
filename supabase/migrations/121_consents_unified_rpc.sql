-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 121: Unified consents RPC
--
-- Two real-world flows coexist for "consentimiento informado":
--   1. Digital signature (table `informed_consents`, mig 120).
--   2. Paper consent scanned/photographed (table `clinical_attachments`
--      with category='consent', mig 053). Used by clinics like
--      Dermosalud that prefer physical signatures in front of the
--      patient and only need a photographic record.
--
-- This RPC produces a unified, chronologically-sorted view of both
-- sources so the UI can render a single audit trail without forcing
-- either side to migrate.
--
-- SECURITY INVOKER: each underlying table already has RLS keyed on
-- get_user_org_ids(); we deliberately let those policies do the
-- multi-tenant filtering instead of a SECURITY DEFINER + manual
-- org check, which would be redundant and easier to get wrong.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_patient_consents_unified(p_patient_id UUID)
RETURNS TABLE (
  source           TEXT,
  id               UUID,
  registered_at    TIMESTAMPTZ,
  doctor_id        UUID,
  doctor_name      TEXT,
  consent_type     TEXT,
  description      TEXT,
  asset_url        TEXT,
  signature_method TEXT,
  appointment_id   UUID
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    'digital'::TEXT                    AS source,
    ic.id,
    ic.signed_at                       AS registered_at,
    ic.doctor_id,
    d.full_name                        AS doctor_name,
    ic.consent_type,
    ic.procedure_description           AS description,
    ic.pdf_url                         AS asset_url,
    ic.signature_method,
    ic.appointment_id
  FROM informed_consents ic
  LEFT JOIN doctors d ON d.id = ic.doctor_id
  WHERE ic.patient_id = p_patient_id

  UNION ALL

  SELECT
    'scanned'::TEXT                    AS source,
    ca.id,
    ca.created_at                      AS registered_at,
    NULL::UUID                         AS doctor_id,
    NULL::TEXT                         AS doctor_name,
    'photo'::TEXT                      AS consent_type,
    ca.file_name                       AS description,
    ca.storage_path                    AS asset_url,
    'physical'::TEXT                   AS signature_method,
    ca.appointment_id
  FROM clinical_attachments ca
  WHERE ca.patient_id = p_patient_id
    AND ca.category = 'consent'

  ORDER BY registered_at DESC;
$$;

COMMENT ON FUNCTION get_patient_consents_unified(UUID) IS
  'Unified, chronologically-sorted view of digital + scanned consents for a patient. SECURITY INVOKER: relies on RLS of informed_consents and clinical_attachments to filter by org.';

REVOKE ALL ON FUNCTION get_patient_consents_unified(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_patient_consents_unified(UUID) TO authenticated;
