import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/email-templates/seed
 *
 * Restores the default set of email templates for the caller's organization.
 * Uses the seed_email_templates RPC, which is ON CONFLICT DO NOTHING — so
 * existing templates are left untouched and only the missing ones are inserted.
 *
 * Admin/owner only. RPC call uses the admin client because the function is
 * revoked from `authenticated` role (see migration 031).
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("seed_email_templates", {
    org_id: membership.organization_id,
  });

  if (error) {
    console.error("[email-templates/seed] RPC error:", error);
    return NextResponse.json(
      { error: `No se pudieron restaurar las plantillas: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
