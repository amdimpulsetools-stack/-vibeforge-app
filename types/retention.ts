// Retention dashboard types

export interface RetentionOverview {
  total_patients: number;
  new_patients: number;
  returning_patients: number;
  retention_rate: number;
}

export interface VisitFrequency {
  avg_days_between_visits: number;
  median_days_between_visits: number;
  patients_with_multiple_visits: number;
}

export interface AtRiskPatient {
  patient_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  last_visit: string;
  total_visits: number;
  days_since_last_visit: number;
}

export interface AtRiskData {
  total_at_risk: number;
  patients: AtRiskPatient[];
}

export interface TopPatient {
  patient_id: string;
  first_name: string;
  last_name: string;
  total_visits: number;
  total_revenue: number;
  first_visit: string;
  last_visit: string;
  avg_per_visit: number;
}

export interface PatientLTV {
  avg_ltv: number;
  total_lifetime_revenue: number;
  top_patients: TopPatient[];
}

export interface RetentionTrendMonth {
  month: string;
  total_patients: number;
  returning_patients: number;
  new_patients: number;
  retention_rate: number;
}
