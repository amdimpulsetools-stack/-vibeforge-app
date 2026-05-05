import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { APP_URL } from "@/lib/constants";
import { parseBody } from "@/lib/api-utils";
import { inviteMemberSchema } from "@/lib/validations/api";

// GET /api/members — list organization members
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 30 requests per minute per user
  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch all members in this org
  const { data: members, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, is_active, created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at");

  if (error) {
    console.error("Members fetch error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  if (!members || members.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch profiles with admin client to bypass RLS (user_ids already org-filtered)
  const userIds = members.map((m) => m.user_id);
  const adminClient = createAdminClient();
  const { data: profiles } = await adminClient
    .from("user_profiles")
    .select("id, full_name, avatar_url, phone, email, professional_title")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  const enriched = members.map((m) => {
    const profile = profileMap.get(m.user_id);
    return {
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      is_active: m.is_active ?? true,
      created_at: m.created_at,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      phone: profile?.phone ?? null,
      email: profile?.email ?? null,
      professional_title: profile?.professional_title ?? null,
    };
  });

  return NextResponse.json(enriched);
}

// POST /api/members — invite a new member by email
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 30 requests per minute per user
  const rlPost = generalLimiter(user.id);
  if (!rlPost.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rlPost.reset - Date.now()) / 1000)) } }
    );
  }

  // Verify caller is admin/owner
  const { data: callerMembership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!callerMembership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  if (
    callerMembership.role !== "owner" &&
    callerMembership.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseBody(request, inviteMemberSchema);
  if (parsed.error) return parsed.error;
  const { email: rawEmail, role, professional_title, is_fertility_advisor } = parsed.data;
  const email = rawEmail.trim().toLowerCase();
  const fertilityAdvisor = role === "doctor" && is_fertility_advisor === true;

  // Try to find existing user by email
  const { data: targetUserId } = await supabase.rpc(
    "find_user_by_email",
    { lookup_email: email }
  );

  // --- CASE A: User already exists → add directly ---
  const supabaseAdmin = createAdminClient();

  if (targetUserId) {
    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("organization_id", callerMembership.organization_id)
      .limit(1)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "already_member" },
        { status: 409 }
      );
    }

    // Remove from their default/auto-created org only (not from other real orgs)
    // Find their current memberships to remove only the auto-generated one
    const { data: existingMemberships } = await supabaseAdmin
      .from("organization_members")
      .select("id, organization_id")
      .eq("user_id", targetUserId)
      .neq("organization_id", callerMembership.organization_id);

    // Only delete memberships in orgs where they are the sole member (auto-created orgs)
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

    // Insert member into this org
    const { data: newMember, error } = await supabaseAdmin
      .from("organization_members")
      .insert({
        user_id: targetUserId,
        organization_id: callerMembership.organization_id,
        role,
        is_fertility_advisor: fertilityAdvisor,
      })
      .select()
      .single();

    if (error) {
      console.error("Member insert error:", error);
      return NextResponse.json({ error: "member_creation_failed" }, { status: 500 });
    }

    // Set professional_title on the user's profile for doctor/specialist roles
    if (role === "doctor") {
      await supabaseAdmin
        .from("user_profiles")
        .update({ professional_title: professional_title || "doctor" })
        .eq("id", targetUserId);

      // Auto-link or auto-create doctor record for this user in this org
      const { data: existingDoctorRecord } = await supabaseAdmin
        .from("doctors")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("organization_id", callerMembership.organization_id)
        .limit(1)
        .single();

      if (!existingDoctorRecord) {
        const { data: targetProfile } = await supabaseAdmin
          .from("user_profiles")
          .select("full_name")
          .eq("id", targetUserId)
          .single();

        const doctorName = targetProfile?.full_name || email.split("@")[0];

        // Try to find an existing unlinked doctor record by name match
        const { data: unlinkedDoctor } = await supabaseAdmin
          .from("doctors")
          .select("id")
          .is("user_id", null)
          .eq("organization_id", callerMembership.organization_id)
          .eq("is_active", true)
          .ilike("full_name", doctorName.trim())
          .limit(1)
          .single();

        if (unlinkedDoctor) {
          const { error: linkError } = await supabaseAdmin
            .from("doctors")
            .update({ user_id: targetUserId })
            .eq("id", unlinkedDoctor.id);

          if (linkError) {
            console.error("Error linking existing doctor record:", linkError);
          }
        } else {
          const tempCmp = `PEND-${crypto.randomUUID().slice(0, 8)}`;

          const { error: doctorInsertError } = await supabaseAdmin.from("doctors").insert({
            full_name: doctorName,
            cmp: tempCmp,
            organization_id: callerMembership.organization_id,
            user_id: targetUserId,
            is_active: true,
          });

          if (doctorInsertError) {
            console.error("Error auto-creating doctor record:", doctorInsertError);
          }
        }
      }
    }

    // Send password reset email so the user can set credentials and log in
    let emailSent = false;
    try {
      const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${APP_URL}/reset-password` },
      });

      if (!resetError) {
        // Supabase sends the recovery email automatically when SMTP is configured
        emailSent = true;
      } else {
        console.error("Recovery link error:", resetError);
      }
    } catch (emailErr) {
      console.error("Error generating recovery link:", emailErr);
    }

    return NextResponse.json(
      { ...newMember, email_sent: emailSent },
      { status: 201 }
    );
  }

  // --- CASE B: User does NOT exist → create invitation + send email ---

  // Check if there's already a pending invitation for this email in this org
  const { data: existingInvite } = await supabase
    .from("organization_invitations")
    .select("id, status")
    .eq("email", email)
    .eq("organization_id", callerMembership.organization_id)
    .eq("status", "pending")
    .limit(1)
    .single();

  if (existingInvite) {
    return NextResponse.json(
      { error: "already_invited" },
      { status: 409 }
    );
  }

  // Create the invitation
  const { data: invitation, error: invError } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: callerMembership.organization_id,
      email,
      role,
      professional_title: professional_title || null,
      invited_by: user.id,
      invitation_meta: fertilityAdvisor ? { is_fertility_advisor: true } : {},
    })
    .select("token")
    .single();

  if (invError) {
    console.error("Invitation creation error:", invError);
    return NextResponse.json(
      { error: "invitation_creation_failed" },
      { status: 500 }
    );
  }

  const registerUrl = `${APP_URL}/register?invite=${invitation.token}`;

  // Send invitation email using Supabase's native email system
  let emailSent = false;
  try {
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: registerUrl,
      data: {
        invite_token: invitation.token,
        org_role: role,
        org_id: callerMembership.organization_id,
      },
    });

    if (inviteError) {
      console.error("Supabase invite error:", inviteError);
    } else {
      emailSent = true;
    }
  } catch (emailErr) {
    console.error("Error sending invitation email:", emailErr);
  }

  return NextResponse.json(
    {
      message: "invitation_sent",
      email_sent: emailSent,
    },
    { status: 201 }
  );
}
