import type { ClinicalFollowupWithRelations } from "@/types/clinical-history";
import type { FollowupSource, FollowupStatus } from "@/types/fertility";

/**
 * Local extension of the existing followup type with the columns added in
 * migration 128. Once `npm run types` is regenerated we can drop this and
 * use the auto-generated row directly.
 */
export interface FollowupWithDetails extends ClinicalFollowupWithRelations {
  source: FollowupSource;
  rule_key: string | null;
  target_category_canonical: string | null;
  expected_by: string | null;
  first_contact_at: string | null;
  snooze_until: string | null;
  attempt_count: number;
  max_attempts: number;
  closure_reason: string | null;
  closed_at: string | null;
  status: FollowupStatus;
  days_diff?: number;
}

export type FollowupVariant = "pending" | "recovered" | "no_response";

export interface FollowupCounts {
  pending: number;
  recovered: number;
  no_response: number;
}

export interface RecoveredKpis {
  recovered_attributable: number;
  organic_initiative: number;
  recovery_rate_pct: number;
  revenue_attributed: number;
}

export interface FollowupRuleLite {
  rule_key: string;
  display_name: string;
}

export interface FollowupFilters {
  doctor_id: string | "all";
  origin: ("manual" | "rule" | "system")[];
  rule_key: string | "all";
  date_from: string | null;
  date_to: string | null;
}
