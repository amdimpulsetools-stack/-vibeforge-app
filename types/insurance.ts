export type AppointmentPaymentMode = "particular" | "insurance";

export interface InsuranceCarrier {
  id: string;
  slug: string;
  name: string;
  default_ruc: string | null;
  logo_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface OrganizationInsuranceSettings {
  organization_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInsuranceCarrier {
  id: string;
  organization_id: string;
  carrier_id: string | null;
  custom_name: string | null;
  custom_ruc: string | null;
  coverage_percent: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Carrier row joined with the catalog name fallback used in UI display. */
export interface OrganizationInsuranceCarrierWithName
  extends OrganizationInsuranceCarrier {
  display_name: string;
  display_ruc: string | null;
}

export interface PatientInsurance {
  id: string;
  patient_id: string;
  organization_insurance_carrier_id: string;
  affiliate_number: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsuranceCoverageQuote {
  carrier: OrganizationInsuranceCarrierWithName;
  /** `true` when the carrier covers the requested service. */
  covered: boolean;
  /** Coverage percent applied (0 when not covered). */
  coverage_percent: number;
  /** Amount paid by the insurance for the service. */
  insurance_amount: number;
  /** Amount the patient owes (copay). Equals base price when not covered. */
  patient_copay: number;
}
