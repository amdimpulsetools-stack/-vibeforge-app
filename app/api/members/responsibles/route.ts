import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/members/responsibles — list active members of the org that can be
// assigned as the "responsible" of an appointment. Historically this only
// returned receptionists; it now returns every active member (recepción,
// doctores/asesoras, admin y owner) so any of them can be picked. Reception's
// UX is preserved because receptionists are still ordered first.
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
    .select("id, user_id, role, is_fertility_advisor")
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true);

  if (!members || members.length === 0) return NextResponse.json([]);

  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, full_name")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // Server-side ordering so reception's options stay on top: receptionist
  // first, then doctors/asesoras, then admin/owner. Within each bucket sort
  // alphabetically by label for a stable, predictable dropdown.
  const roleRank = (role: string | null): number => {
    switch (role) {
      case "receptionist":
        return 0;
      case "doctor":
        return 1;
      default:
        // admin, owner, and anything else fall to the bottom
        return 2;
    }
  };

  const result = members
    .map((m) => ({
      id: m.id,
      user_id: m.user_id,
      label: profileMap.get(m.user_id) || "Miembro",
      role: m.role,
      is_fertility_advisor: m.is_fertility_advisor ?? false,
    }))
    .sort((a, b) => {
      const rank = roleRank(a.role) - roleRank(b.role);
      if (rank !== 0) return rank;
      return a.label.localeCompare(b.label, "es");
    });

  return NextResponse.json(result);
}
