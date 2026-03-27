import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/members/responsibles — list active receptionists for the org
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) return NextResponse.json([]);

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("organization_members")
    .select("id, user_id, role")
    .eq("organization_id", membership.organization_id)
    .eq("role", "receptionist")
    .eq("is_active", true);

  if (!members || members.length === 0) return NextResponse.json([]);

  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  const result = members.map((m) => ({
    id: m.id,
    label: profileMap.get(m.user_id) || "Recepcionista",
  }));

  return NextResponse.json(result);
}
