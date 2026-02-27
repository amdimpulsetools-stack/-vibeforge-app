import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/invite/[token] — validate an invitation token and return details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: invitation, error } = await supabase
    .from("organization_invitations")
    .select(
      `
      id,
      email,
      role,
      professional_title,
      status,
      expires_at,
      organization_id,
      organizations:organization_id (
        name,
        logo_url
      )
    `
    )
    .eq("token", token)
    .single();

  if (error || !invitation) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 404 }
    );
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: "invitation_already_used" },
      { status: 410 }
    );
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "invitation_expired" },
      { status: 410 }
    );
  }

  const org = invitation.organizations as unknown as {
    name: string;
    logo_url: string | null;
  } | null;

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    professional_title: invitation.professional_title,
    organization_name: org?.name || null,
    organization_logo: org?.logo_url || null,
  });
}
