import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/invite/[token] — validate an invitation token and return details
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || !/^[a-f0-9-]{36}$/.test(token)) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Use RPC to securely look up invitation by token (avoids USING(true) policy)
  const { data: invitation, error } = await supabase.rpc(
    "get_invitation_by_token",
    { invite_token: token }
  );

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

  // Fetch org name separately (the invitation RPC doesn't join)
  const { data: org } = await supabase
    .from("organizations")
    .select("name, logo_url")
    .eq("id", invitation.organization_id)
    .single();

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    professional_title: invitation.professional_title,
    organization_name: org?.name || null,
    organization_logo: org?.logo_url || null,
  });
}
