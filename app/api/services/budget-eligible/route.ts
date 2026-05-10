import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// GET /api/services/budget-eligible
//
// Returns the list of services in the caller's org marked as
// `is_budget_eligible = true` AND `is_active = true`, joined with
// their active tiers (A/B/C). Powers the "Asignar presupuesto" modal
// service dropdown introduced in Phase 3.
//
// Addon-gated: returns 403 if the caller's org does not have
// fertility_basic|fertility_premium enabled. Visible to ANY role
// inside an addon-active org (doctor, admin, owner, receptionist,
// fertility advisor) — read-only listing.
// ──────────────────────────────────────────────────────────────────

interface TierRow {
  tier: "A" | "B" | "C";
  amount: number;
  currency: "PEN" | "USD";
  includes_text: string | null;
  is_active: boolean;
}

interface ServiceOut {
  id: string;
  name: string;
  duration_minutes: number;
  tiers: TierRow[];
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  // Addon gate.
  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);

  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const { data: services, error } = await supabase
    .from("services")
    .select(
      "id, name, duration_minutes, display_order, is_active, is_budget_eligible",
    )
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .eq("is_budget_eligible", true)
    .order("display_order", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (services ?? []).map((s) => s.id as string);
  if (ids.length === 0) {
    return NextResponse.json([] as ServiceOut[]);
  }

  const { data: tierRows } = await supabase
    .from("service_budget_tiers")
    .select("service_id, tier, amount, currency, includes_text, is_active")
    .in("service_id", ids)
    .eq("is_active", true);

  const tiersByService = new Map<string, TierRow[]>();
  for (const row of tierRows ?? []) {
    const sid = row.service_id as string;
    const arr = tiersByService.get(sid) ?? [];
    arr.push({
      tier: row.tier as "A" | "B" | "C",
      amount: Number(row.amount),
      currency: row.currency as "PEN" | "USD",
      includes_text: (row.includes_text as string | null) ?? null,
      is_active: Boolean(row.is_active),
    });
    tiersByService.set(sid, arr);
  }

  const tierOrder: Record<"A" | "B" | "C", number> = { A: 0, B: 1, C: 2 };
  const result: ServiceOut[] = (services ?? []).map((s) => {
    const tiers = (tiersByService.get(s.id as string) ?? []).slice();
    tiers.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
    return {
      id: s.id as string,
      name: s.name as string,
      duration_minutes: Number(s.duration_minutes ?? 0),
      tiers,
    };
  });

  return NextResponse.json(result);
}
