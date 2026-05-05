import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetRecord,
} from "@/types/fertility";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership)
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });

  const { data: addons } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addons || addons.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("budget_records")
    .select(
      "*, patient:patients(id, first_name, last_name, phone), followup:clinical_followups!followup_id(id, expected_by, status)",
    )
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();

  if (error || !data)
    return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });

  const row = data as BudgetRecord;
  let sentBy: { id: string; full_name: string | null } | null = null;
  if (row.sent_by_user_id) {
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from("user_profiles")
      .select("id, full_name")
      .eq("id", row.sent_by_user_id)
      .single();
    sentBy = profile
      ? { id: profile.id, full_name: profile.full_name }
      : { id: row.sent_by_user_id, full_name: null };
  }

  return NextResponse.json({ data: { ...data, sent_by: sentBy } });
}
