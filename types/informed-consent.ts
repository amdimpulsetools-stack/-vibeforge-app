// Types for the informed-consent flow (migration 120).
//
// These DTOs are intentionally lighter than the row shape — the API
// validates with Zod and only exposes what UI needs.

export type InformedConsentType =
  | "general"
  | "procedimiento"
  | "tratamiento"
  | "fotografias";

export type InformedConsentSignatureMethod = "typed" | "drawn";

export interface InformedConsentRecord {
  id: string;
  organization_id: string;
  patient_id: string;
  appointment_id: string | null;
  service_id: string | null;
  doctor_id: string | null;
  consent_type: InformedConsentType;
  procedure_description: string;
  risks_explained: string | null;
  signed_by_patient_name: string;
  signed_at: string;
  signature_method: InformedConsentSignatureMethod;
  signature_data: string | null;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Payload accepted by `POST /api/informed-consents`. The route
 * generates the signed artifact (HTML for now; PDF when puppeteer
 * lands), uploads to storage and writes the row.
 */
export interface InformedConsentCreatePayload {
  patient_id: string;
  appointment_id?: string | null;
  service_id?: string | null;
  doctor_id?: string | null;
  consent_type: InformedConsentType;
  procedure_description: string;
  risks_explained?: string | null;
  signed_by_patient_name: string;
  signature_method: InformedConsentSignatureMethod;
  /** Base64 PNG when method='drawn'. Empty string for 'typed'. */
  signature_data?: string | null;
}

export const CONSENT_TYPE_LABELS: Record<InformedConsentType, string> = {
  general: "Consentimiento general",
  procedimiento: "Procedimiento",
  tratamiento: "Tratamiento",
  fotografias: "Uso de fotografías clínicas",
};

export const CONSENT_TYPE_OPTIONS: ReadonlyArray<{
  value: InformedConsentType;
  label: string;
  description: string;
}> = [
  {
    value: "general",
    label: "General",
    description: "Atención clínica y manejo de información médica",
  },
  {
    value: "procedimiento",
    label: "Procedimiento",
    description: "Procedimiento invasivo, quirúrgico o anestésico",
  },
  {
    value: "tratamiento",
    label: "Tratamiento",
    description: "Tratamiento prolongado o con riesgo conocido",
  },
  {
    value: "fotografias",
    label: "Fotografías clínicas",
    description: "Captura y uso clínico de imágenes del paciente",
  },
];
