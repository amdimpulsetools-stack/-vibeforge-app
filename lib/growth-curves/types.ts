export type Sex = "male" | "female";

export type GrowthMetric =
  | "weight_for_age"
  | "height_for_age"
  | "bmi_for_age"
  | "head_circumference_for_age";

export interface LMS {
  month: number;
  L: number;
  M: number;
  S: number;
}

export interface PercentilePoint {
  ageMonths: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
}

export interface MeasurementPoint {
  ageMonths: number;
  value: number;
  zScore: number;
  percentile: number;
  date: string;
}
