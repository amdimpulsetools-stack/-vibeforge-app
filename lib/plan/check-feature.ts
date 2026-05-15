import { createClient } from "@/lib/supabase/server";

export type PlanFeature =
  | "feature_reports"
  | "feature_export"
  | "feature_custom_roles"
  | "feature_api_access"
  | "feature_priority_support"
  | "feature_ai_assistant"
  | "feature_custom_fields";

export async function hasFeature(
  organizationId: string,
  feature: PlanFeature,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_org_plan", { org_id: organizationId });
  if (!data || typeof data !== "object") return false;
  return Boolean((data as Record<string, unknown>)[feature]);
}
