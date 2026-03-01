import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { Resend } from "resend";
import { buildEmailHtml } from "@/lib/email-template";
import { APP_URL } from "@/lib/constants";

const resend = new Resend(process.env.RESEND_API_KEY);

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
    .select("id, user_id, role, created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!members || members.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch profiles separately to avoid PostgREST FK join issues
  const userIds = members.map((m) => m.user_id);
  const { data: profiles } = await supabase
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

  const body = await request.json();
  const { email, role, professional_title } = body as {
    email: string;
    role: string;
    professional_title?: string | null;
  };

  if (!email || !role) {
    return NextResponse.json(
      { error: "Email and role are required" },
      { status: 400 }
    );
  }

  if (!["admin", "receptionist", "doctor"].includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Must be admin, receptionist, or doctor" },
      { status: 400 }
    );
  }

  if (
    professional_title &&
    !["doctor", "especialista", "licenciada"].includes(professional_title)
  ) {
    return NextResponse.json(
      { error: "Invalid professional_title" },
      { status: 400 }
    );
  }

  // Try to find existing user by email
  const { data: targetUserId } = await supabase.rpc(
    "find_user_by_email",
    { lookup_email: email }
  );

  // --- CASE A: User already exists → add directly ---
  if (targetUserId) {
    // Check if already a member
    const { data: existing } = await supabase
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

    // Remove from their current org if they have one
    const { error: deleteError } = await supabase
      .from("organization_members")
      .delete()
      .eq("user_id", targetUserId);

    if (deleteError) {
      return NextResponse.json(
        { error: "Error al remover membresía anterior: " + deleteError.message },
        { status: 500 }
      );
    }

    // Insert member into this org
    const { data: newMember, error } = await supabase
      .from("organization_members")
      .insert({
        user_id: targetUserId,
        organization_id: callerMembership.organization_id,
        role,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Set professional_title on the user's profile for doctor/specialist roles
    if (role === "doctor") {
      await supabase
        .from("user_profiles")
        .update({ professional_title: professional_title || "doctor" })
        .eq("id", targetUserId);

      // Auto-create doctor record if none exists for this user in this org
      const { data: existingDoctorRecord } = await supabase
        .from("doctors")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("organization_id", callerMembership.organization_id)
        .limit(1)
        .single();

      if (!existingDoctorRecord) {
        const { data: targetProfile } = await supabase
          .from("user_profiles")
          .select("full_name")
          .eq("id", targetUserId)
          .single();

        const doctorName = targetProfile?.full_name || email.split("@")[0];
        const tempCmp = `PEND-${crypto.randomUUID().slice(0, 8)}`;

        const { error: doctorInsertError } = await supabase.from("doctors").insert({
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

    return NextResponse.json(newMember, { status: 201 });
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
    })
    .select("token")
    .single();

  if (invError) {
    return NextResponse.json(
      { error: invError.message },
      { status: 500 }
    );
  }

  // Get organization name for the email
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", callerMembership.organization_id)
    .single();

  // Get inviter's name
  const { data: inviterProfile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const orgName = org?.name || "la organización";
  const inviterName = inviterProfile?.full_name || "Un administrador";
  const registerUrl = `${APP_URL}/register?invite=${invitation.token}`;

  // Send invitation email
  const roleLabels: Record<string, string> = {
    doctor: "Doctor/a",
    receptionist: "Recepcionista",
    admin: "Administrador/a",
  };

  const emailBody = `
<p style="font-size:16px;">Hola,</p>
<p><strong>${inviterName}</strong> te ha invitado a unirte a <strong>${orgName}</strong> como <strong>${roleLabels[role] || role}</strong>.</p>
<p>Para aceptar la invitación, crea tu cuenta haciendo clic en el siguiente botón:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#10b981;border-radius:8px;">
      <a href="${registerUrl}" target="_blank" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
        Crear mi cuenta
      </a>
    </td>
  </tr>
</table>
<p style="font-size:13px;color:#6b7280;">Esta invitación expira en 7 días. Si no solicitaste esta invitación, puedes ignorar este correo.</p>
`;

  const html = buildEmailHtml({
    body: emailBody,
    brandColor: "#10b981",
    logoUrl: org?.logo_url || null,
    clinicName: orgName,
  });

  let emailSent = false;
  try {
    await resend.emails.send({
      from: `${orgName} <onboarding@resend.dev>`,
      to: [email],
      subject: `Invitación a ${orgName}`,
      html,
    });
    emailSent = true;
  } catch (emailErr) {
    console.error("Error sending invitation email:", emailErr);
  }

  return NextResponse.json(
    {
      message: "invitation_sent",
      token: invitation.token,
      registerUrl,
      email_sent: emailSent,
    },
    { status: 201 }
  );
}
