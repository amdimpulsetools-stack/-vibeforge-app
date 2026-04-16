export interface PatientAllergy {
  id: string;
  patient_id: string;
  organization_id: string;
  substance: string;
  severity: "leve" | "moderada" | "severa";
  reaction: string | null;
  notes: string | null;
  is_active: boolean;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientCondition {
  id: string;
  patient_id: string;
  organization_id: string;
  condition_name: string;
  icd_code: string | null;
  condition_type: "chronic" | "personal" | "family";
  status: "active" | "resolved" | "managed";
  diagnosed_date: string | null;
  family_member: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatientMedication {
  id: string;
  patient_id: string;
  organization_id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  route: string | null;
  start_date: string | null;
  end_date: string | null;
  prescribing_doctor_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientAntecedents {
  allergies: PatientAllergy[];
  conditions: PatientCondition[];
  medications: PatientMedication[];
  recentDiagnoses: {
    code: string;
    label: string;
    date: string;
    doctor_name: string | null;
  }[];
}
