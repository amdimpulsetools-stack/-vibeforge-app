import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Server-side plan-limit check.
//
// Mirrors the logic of hooks/use-plan.ts (which runs client-side
// for cosmetic UI) but enforced authoritatively before any
// limited resource gets inserted. The client check is a UX
// hint; this is the actual gate.
//
// Effective limit = base + addons (extra_offices, extra_members)
// — same formula as the hook so the client and server agree.
// ============================================================

export type PlanLimitResource =
  | "members"
  | "doctors"
  | "doctor_members"
  | "admins"
  | "receptionists"
  | "offices";

export interface PlanLimitOk {
  ok: true;
  unlimited: boolean;
  current: number;
  // null when unlimited.
  max: number | null;
}

export interface PlanLimitExceeded {
  ok: false;
  resource: PlanLimitResource;
  current: number;
  max: number;
  plan_name: string;
  // Whether this org's plan supports a per-unit addon for this
  // resource (eg. "extra member" addon costs S/X per slot).
  // Drives whether the upgrade modal shows the "Comprar cupo
  // extra" CTA in addition to "Subir de plan".
  addon_available: boolean;
}

export type PlanLimitResult = PlanLimitOk | PlanLimitExceeded;

// Maps each guarded resource to:
//   - the column on the plans table that defines the cap
//   - the field on get_org_usage() that holds the current count
//   - whether an addon exists to buy more slots à la carte
const RESOURCE_CONFIG: Record<
  PlanLimitResource,
  {
    plan_col: string;
    usage_field: string;
    addon_field: string | null;
    // When true, a plan value of 0 means "none allowed" instead of the
    // historical "0 = unlimited" convention (which offices/members rely on).
    zero_means_none?: boolean;
  }
> = {
  members: {
    plan_col: "max_members",
    usage_field: "members",
    addon_field: "extra_members",
  },
  doctors: {
    plan_col: "max_doctors",
    usage_field: "doctors",
    addon_field: "extra_members",
  },
  doctor_members: {
    plan_col: "max_doctor_members",
    usage_field: "doctor_members",
    addon_field: "extra_members",
  },
  admins: {
    plan_col: "max_admins",
    usage_field: "admins",
    addon_field: null,
    // Plan Independiente sets max_admins = 0 meaning "no admin seats" —
    // without this flag the generic 0=unlimited rule would let an admin
    // invite through by direct API call (the UI hides it, but the server
    // is the real gate).
    zero_means_none: true,
  },
  receptionists: {
    plan_col: "max_receptionists",
    usage_field: "receptionists",
    addon_field: null,
  },
  offices: {
    plan_col: "max_offices",
    usage_field: "offices",
    addon_field: "extra_offices",
  },
};

/**
 * Returns whether the org can add one more of the given resource.
 *
 * Behavior:
 *   - No active plan → returns ok=true (gate at signup, not here)
 *   - Plan column is null/0 → unlimited, ok=true
 *   - current < effective_limit → ok=true
 *   - current >= effective_limit → ok=false with details
 *
 * Fail-open on RPC errors (returns ok=true) so a transient DB
 * problem doesn't lock owners out of inviting members. Failures
 * are logged for investigation.
 */
export async function checkPlanLimit(
  organizationId: string,
  resource: PlanLimitResource,
): Promise<PlanLimitResult> {
  const cfg = RESOURCE_CONFIG[resource];
  const admin = createAdminClient();

  const [planRes, usageRes] = await Promise.all([
    admin.rpc("get_org_plan", { org_id: organizationId }),
    admin.rpc("get_org_usage", { org_id: organizationId }),
  ]);

  if (planRes.error || !planRes.data) {
    console.warn(
      "[plan-limit] get_org_plan failed; allowing the action",
      planRes.error,
    );
    return { ok: true, unlimited: true, current: 0, max: null };
  }
  if (usageRes.error || !usageRes.data) {
    console.warn(
      "[plan-limit] get_org_usage failed; allowing the action",
      usageRes.error,
    );
    return { ok: true, unlimited: true, current: 0, max: null };
  }

  const plan = planRes.data as Record<string, unknown>;
  const usage = usageRes.data as Record<string, unknown>;

  const baseLimit = plan[cfg.plan_col] as number | null;

  // null or 0 → unlimited (except resources flagged zero_means_none,
  // where 0 is a hard "none allowed" and falls through to the cap check).
  if (baseLimit == null || (baseLimit === 0 && !cfg.zero_means_none)) {
    return {
      ok: true,
      unlimited: true,
      current: (usage[cfg.usage_field] as number) ?? 0,
      max: null,
    };
  }

  // Resolve addons. Prefer flat extra_offices/extra_members fields
  // (mig 063+); fall back to parsing the addons array (mig 031
  // shape). This mirrors hooks/use-plan.ts.
  let addonExtra = 0;
  if (cfg.addon_field) {
    addonExtra = (usage[cfg.addon_field] as number) ?? 0;
    if (!addonExtra && Array.isArray(usage.addons)) {
      const addons = usage.addons as { addon_type: string; quantity: number }[];
      const addonType =
        cfg.addon_field === "extra_offices" ? "extra_office" : "extra_member";
      addonExtra = addons
        .filter((a) => a.addon_type === addonType)
        .reduce((sum, a) => sum + (a.quantity ?? 0), 0);
    }
  }

  const effectiveLimit = baseLimit + addonExtra;
  const current = (usage[cfg.usage_field] as number) ?? 0;

  if (current < effectiveLimit) {
    return { ok: true, unlimited: false, current, max: effectiveLimit };
  }

  // Over-limit.
  // Surface whether an addon path exists so the modal can decide
  // which CTAs to show. Owner can also have purchased a plan that
  // doesn't include addons (Plan Esencial without extra-member
  // addon enabled, etc.) — addon_field=null means "no addon path,
  // only plan upgrade".
  const addonPriceField =
    cfg.addon_field === "extra_offices"
      ? "addon_price_per_office"
      : cfg.addon_field === "extra_members"
        ? "addon_price_per_member"
        : null;
  const addonPrice = addonPriceField
    ? ((plan[addonPriceField] as number) ?? null)
    : null;

  return {
    ok: false,
    resource,
    current,
    max: effectiveLimit,
    plan_name: (plan.plan_name as string) ?? "tu plan",
    addon_available: addonPrice !== null && addonPrice > 0,
  };
}

/**
 * Helper for the 402 response shape used across endpoints.
 * Frontend code looks for `error: "plan_limit_reached"` to
 * trigger the upgrade modal.
 */
export function planLimitErrorBody(result: PlanLimitExceeded) {
  return {
    error: "plan_limit_reached",
    resource: result.resource,
    current: result.current,
    max: result.max,
    plan_name: result.plan_name,
    addon_available: result.addon_available,
    upgrade_url: "/plans",
    addon_url: "/account",
  };
}
