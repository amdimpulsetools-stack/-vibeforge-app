import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("user_profiles").select("is_founder").eq("id", user.id).single();
  if (!profile?.is_founder) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const [profilesRes, membersRes] = await Promise.all([
    admin.from("user_profiles").select("id, full_name, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("organization_members").select("user_id, role"),
  ]);

  const profiles = profilesRes.data ?? [];
  const members = membersRes.data ?? [];

  const roleMap = new Map<string, string>();
  for (const m of members) roleMap.set(m.user_id, m.role);

  return NextResponse.json({
    totalUsers: profiles.length,
    owners: members.filter((m) => m.role === "owner").length,
    admins: members.filter((m) => m.role === "admin").length,
    doctors: members.filter((m) => m.role === "doctor").length,
    receptionists: members.filter((m) => m.role === "receptionist").length,
    recentUsers: profiles.map((p) => ({
      id: p.id,
      full_name: p.full_name ?? "Sin nombre",
      created_at: p.created_at,
      role: roleMap.get(p.id) ?? "—",
    })),
  });
}
