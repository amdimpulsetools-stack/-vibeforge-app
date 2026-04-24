import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();

  const [profilesRes, membersRes, orgsRes] = await Promise.all([
    admin.from("user_profiles").select("id, full_name, created_at").order("created_at", { ascending: false }),
    admin.from("organization_members").select("user_id, role, organization_id, is_active"),
    admin.from("organizations").select("id, name"),
  ]);

  const profiles = profilesRes.data ?? [];
  const members = membersRes.data ?? [];
  const orgs = orgsRes.data ?? [];

  const orgMap = new Map<string, string>();
  for (const o of orgs) orgMap.set(o.id, o.name);

  // Build user list with org info
  const usersWithOrg = profiles.map((p) => {
    const membership = members.find((m) => m.user_id === p.id);
    return {
      id: p.id,
      full_name: p.full_name ?? "Sin nombre",
      created_at: p.created_at,
      role: membership?.role ?? "—",
      org_name: membership ? (orgMap.get(membership.organization_id) ?? "—") : "—",
      is_active: membership?.is_active ?? false,
    };
  });

  // Separate owners/admins from team members
  const ownersAndAdmins = usersWithOrg.filter((u) => u.role === "owner" || u.role === "admin");
  const teamMembers = usersWithOrg.filter((u) => u.role === "doctor" || u.role === "receptionist");

  return NextResponse.json({
    totalUsers: profiles.length,
    owners: members.filter((m) => m.role === "owner").length,
    admins: members.filter((m) => m.role === "admin").length,
    doctors: members.filter((m) => m.role === "doctor").length,
    receptionists: members.filter((m) => m.role === "receptionist").length,
    ownersAndAdmins,
    teamMembers,
  });
}
