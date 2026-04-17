import { getLMSTable, METRIC_AGE_RANGE } from "./who-data";
import type { GrowthMetric, LMS, PercentilePoint, Sex } from "./types";

export type { GrowthMetric, Sex, PercentilePoint, MeasurementPoint } from "./types";
export { METRIC_AGE_RANGE } from "./who-data";

// Standard percentiles plotted on the chart
const PERCENTILES = { p3: -1.881, p15: -1.036, p50: 0, p85: 1.036, p97: 1.881 };

// Convert Z-score to percentile (standard normal CDF via Abramowitz & Stegun)
export function zToPercentile(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989423 * Math.exp(-(absZ * absZ) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.round((1 - sign * p + (sign === 1 ? 0 : 1)) * 1000) / 10;
}

export function valueToZ(value: number, lms: LMS): number {
  const { L, M, S } = lms;
  if (L === 0) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

export function zToValue(z: number, lms: LMS): number {
  const { L, M, S } = lms;
  if (L === 0) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}

function lerpLMS(a: LMS, b: LMS, month: number): LMS {
  const t = (month - a.month) / (b.month - a.month);
  return {
    month,
    L: a.L + (b.L - a.L) * t,
    M: a.M + (b.M - a.M) * t,
    S: a.S + (b.S - a.S) * t,
  };
}

export function interpolateLMS(
  metric: GrowthMetric,
  sex: Sex,
  month: number
): LMS | null {
  const table = getLMSTable(metric, sex);
  if (month <= table[0].month) return table[0];
  if (month >= table[table.length - 1].month) return table[table.length - 1];
  for (let i = 0; i < table.length - 1; i++) {
    if (month >= table[i].month && month <= table[i + 1].month) {
      return lerpLMS(table[i], table[i + 1], month);
    }
  }
  return null;
}

export function calculateMeasurement(
  metric: GrowthMetric,
  sex: Sex,
  ageMonths: number,
  value: number
): { zScore: number; percentile: number } | null {
  const lms = interpolateLMS(metric, sex, ageMonths);
  if (!lms) return null;
  const z = valueToZ(value, lms);
  return { zScore: Math.round(z * 100) / 100, percentile: zToPercentile(z) };
}

export function buildPercentileCurves(
  metric: GrowthMetric,
  sex: Sex,
  maxMonths?: number
): PercentilePoint[] {
  const table = getLMSTable(metric, sex);
  const range = METRIC_AGE_RANGE[metric];
  const upper = Math.min(maxMonths ?? range.maxMonths, range.maxMonths);
  const points: PercentilePoint[] = [];
  for (const row of table) {
    if (row.month > upper) break;
    points.push({
      ageMonths: row.month,
      p3: round(zToValue(PERCENTILES.p3, row)),
      p15: round(zToValue(PERCENTILES.p15, row)),
      p50: round(zToValue(PERCENTILES.p50, row)),
      p85: round(zToValue(PERCENTILES.p85, row)),
      p97: round(zToValue(PERCENTILES.p97, row)),
    });
  }
  return points;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export function ageInMonths(birthDate: string, atDate: string): number {
  const birth = new Date(birthDate);
  const at = new Date(atDate);
  const years = at.getUTCFullYear() - birth.getUTCFullYear();
  const months = at.getUTCMonth() - birth.getUTCMonth();
  const days = at.getUTCDate() - birth.getUTCDate();
  return years * 12 + months + days / 30.4375;
}

export function computeBMI(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}
