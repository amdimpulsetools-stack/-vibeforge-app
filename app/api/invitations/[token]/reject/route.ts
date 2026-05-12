import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/invitations/[token]/reject
 *
 * Lets the invitee explicitly reject an invitation instead of silently
 * ignoring the magic link. Requires an authenticated session whose email
 * matches the invitation — otherwise anyone with a leaked token could
 * burn pending invitations.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || !/^[a-f0-9-]{36}$/.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: invitation, error } = await admin
    .from("organization_invitations")
    .select("id, email, status")
    .eq("token", token)
    .single();

  if (error || !invitation) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: "invitation_already_used" },
      { status: 410 },
    );
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ error: "email_mismatch" }, { status: 403 });
  }

  const { error: updateError } = await admin
    .from("organization_invitations")
    .update({ status: "rejected" })
    .eq("id", invitation.id);

  if (updateError) {
    console.error("Failed to reject invitation:", updateError);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ message: "invitation_rejected" });
}
