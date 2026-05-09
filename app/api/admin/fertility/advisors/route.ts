import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

interface AdvisorOut {
  id: string;
  user_id: string;
  full_name: string;
}

// GET /api/admin/fertility/advisors
//
// Lists active members of the caller's org flagged as
// `is_fertility_advisor = true` (mig 137). Used by the upcoming
// "Asignar presupuesto" modal advisor dropdown (Phase 3).
//
// Addon-gated: returns 403 if the caller's org does not have
// fertility_basic or fertility_premium enabled. Visible to all roles
// (owner/admin/doctor/receptionist) within an addon-active org.
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

  const admin = createAdminClient();
  const { data: advisors } = await admin
    .from("organization_members")
    .select("id, user_id, is_fertility_advisor")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .eq("is_fertility_advisor", true);

  const rows = (advisors ?? []) as Array<{ id: string; user_id: string }>;
  if (rows.length === 0) {
    return NextResponse.json([] as AdvisorOut[]);
  }

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]),
  );

  const result: AdvisorOut[] = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    full_name: profileMap.get(r.user_id) ?? "Asesora",
  }));

  return NextResponse.json(result);
}
