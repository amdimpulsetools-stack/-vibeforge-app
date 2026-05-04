import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/auth/accept-invite
 * Called after a user clicks an invitation email and sets their session.
 * Finds pending invitation for the user's email and adds them to the org.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find pending invitation for this email (case-insensitive: legacy rows
  // may have mixed-case emails; new rows are forced lowercase by mig 134).
  const normalizedEmail = user.email.trim().toLowerCase();
  const { data: invitation } = await admin
    .from("organization_invitations")
    .select("id, organization_id, role, professional_title")
    .ilike("email", normalizedEmail)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!invitation) {
    return NextResponse.json({ message: "no_pending_invitation" });
  }

  // Check if already a member of this org
  const { data: existing } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organization_id", invitation.organization_id)
    .single();

  if (!existing) {
    // Remove auto-created org membership (the one from handle_new_user trigger)
    const { data: autoOrgs } = await admin
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", user.id)
      .neq("organization_id", invitation.organization_id);

    for (const mem of autoOrgs ?? []) {
      const { count } = await admin
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", mem.organization_id);

      // Only remove if sole member (auto-created org)
      if (count === 1) {
        await admin.from("organization_members").delete().eq("id", mem.id);
      }
    }

    // Add to invited org
    await admin.from("organization_members").insert({
      user_id: user.id,
      organization_id: invitation.organization_id,
      role: invitation.role,
      is_active: true,
    });

    // If doctor role, create doctor record (idempotente — chequea si ya
    // existe para ese user en la misma org antes de insertar; previene
    // duplicados si el flow corre dos veces, ej. retry o fix manual paralelo).
    if (invitation.role === "doctor") {
      const { data: existingDoctor } = await admin
        .from("doctors")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", invitation.organization_id)
        .maybeSingle();

      if (!existingDoctor) {
        const { data: profile } = await admin
          .from("user_profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        const name = profile?.full_name || user.email.split("@")[0];

        await admin.from("doctors").insert({
          organization_id: invitation.organization_id,
          user_id: user.id,
          full_name: name,
          specialty: "Medicina General",
          is_active: true,
          cmp: `PEND-${crypto.randomUUID().slice(0, 8)}`,
        });
      }

      if (invitation.professional_title) {
        await admin
          .from("user_profiles")
          .update({ professional_title: invitation.professional_title })
          .eq("id", user.id);
      }
    }
  }

  // Mark invitation as accepted
  await admin
    .from("organization_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  return NextResponse.json({
    message: "invitation_accepted",
    organization_id: invitation.organization_id,
    role: invitation.role,
  });
}
