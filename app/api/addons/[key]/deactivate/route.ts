import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";

/**
 * POST /api/addons/[key]/deactivate
 *
 * Marks the addon as disabled for the org. Per spec, this:
 *   - Sets organization_addons.enabled = false (gates UI via useOrgAddons).
 *   - Does NOT delete per-org followup_rules, canonical mappings nor
 *     whatsapp_templates. The data stays so re-activation is seamless and
 *     the org keeps history.
 *
 * Re-activation goes through POST /api/addons/[key]/activate.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: addonKey } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador pueden desactivar addons" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("organization_addons")
    .update({ enabled: false })
    .eq("organization_id", membership.organization_id)
    .eq("addon_key", addonKey);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deactivated: true, addon_key: addonKey });
}
