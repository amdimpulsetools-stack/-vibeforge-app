import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api-utils";
import { registerInvitedSchema } from "@/lib/validations/api";

const registerLimiter = rateLimit({ max: 5, windowMs: 60 * 1000 });

export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const rl = registerLimiter(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const parsed = await parseBody(request, registerInvitedSchema);
  if (parsed.error) return parsed.error;
  const { email, password, fullName, inviteToken } = parsed.data;

  const supabaseAdmin = createAdminClient();

  // Validate the invitation token
  const { data: invitation, error: invError } = await supabaseAdmin
    .from("organization_invitations")
    .select("id, email, role, professional_title, organization_id, status, expires_at")
    .eq("token", inviteToken)
    .eq("status", "pending")
    .single();

  if (invError || !invitation) {
    return NextResponse.json(
      { error: "Invalid or expired invitation" },
      { status: 404 }
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Invitation has expired" },
      { status: 410 }
    );
  }

  // Ensure the email matches the invitation
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { error: "Email does not match invitation" },
      { status: 400 }
    );
  }

  // Check if user already exists (created by inviteUserByEmail)
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  let userId: string;

  if (existingUser) {
    // User already exists (created by inviteUserByEmail) — update and confirm
    const { data: updated, error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...existingUser.user_metadata,
          full_name: fullName,
          invite_token: inviteToken,
        },
      });

    if (updateError) {
      console.error("Error updating invited user:", updateError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    userId = updated.user.id;
  } else {
    // User doesn't exist — create with auto-confirmed email
    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          invite_token: inviteToken,
        },
      });

    if (createError) {
      console.error("Error creating invited user:", createError);
      return NextResponse.json(
        { error: "Failed to create account" },
        { status: 500 }
      );
    }

    userId = created.user.id;
  }

  // Accept the invitation: add user to org + update invitation status
  // Remove user from any auto-created default org (sole member)
  const { data: existingMemberships } = await supabaseAdmin
    .from("organization_members")
    .select("id, organization_id")
    .eq("user_id", userId)
    .neq("organization_id", invitation.organization_id);

  for (const mem of existingMemberships ?? []) {
    const { count } = await supabaseAdmin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", mem.organization_id);

    if (count === 1) {
      await supabaseAdmin
        .from("organization_members")
        .delete()
        .eq("id", mem.id);
    }
  }

  // Check if already a member (edge case)
  const { data: alreadyMember } = await supabaseAdmin
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", invitation.organization_id)
    .limit(1)
    .single();

  if (!alreadyMember) {
    // Insert into organization
    const { error: memberError } = await supabaseAdmin
      .from("organization_members")
      .insert({
        user_id: userId,
        organization_id: invitation.organization_id,
        role: invitation.role,
      });

    if (memberError) {
      console.error("Error adding member to org:", memberError);
      return NextResponse.json(
        { error: "Failed to add to organization" },
        { status: 500 }
      );
    }
  }

  // Handle doctor-specific setup
  if (invitation.role === "doctor") {
    await supabaseAdmin
      .from("user_profiles")
      .update({
        professional_title: invitation.professional_title || "doctor",
      })
      .eq("id", userId);

    // Auto-link or create doctor record
    const { data: existingDoctor } = await supabaseAdmin
      .from("doctors")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", invitation.organization_id)
      .limit(1)
      .single();

    if (!existingDoctor) {
      // Try to find unlinked doctor by name
      const { data: unlinkedDoctor } = await supabaseAdmin
        .from("doctors")
        .select("id")
        .is("user_id", null)
        .eq("organization_id", invitation.organization_id)
        .eq("is_active", true)
        .ilike("full_name", fullName.trim())
        .limit(1)
        .single();

      if (unlinkedDoctor) {
        await supabaseAdmin
          .from("doctors")
          .update({ user_id: userId })
          .eq("id", unlinkedDoctor.id);
      } else {
        const tempCmp = `PEND-${crypto.randomUUID().slice(0, 8)}`;
        await supabaseAdmin.from("doctors").insert({
          full_name: fullName,
          cmp: tempCmp,
          organization_id: invitation.organization_id,
          user_id: userId,
          is_active: true,
        });
      }
    }
  }

  // Mark invitation as accepted
  await supabaseAdmin
    .from("organization_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  return NextResponse.json({ success: true });
}
