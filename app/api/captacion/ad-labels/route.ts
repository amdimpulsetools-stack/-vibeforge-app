import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api-utils";

export const runtime = "nodejs";

/**
 * PUT /api/captacion/ad-labels
 * Body: { org_id, ad_id, label }   (label vacío ⇒ se borra la etiqueta)
 *
 * Nombre propio que la clínica le pone a un anuncio de Meta (mig 263):
 * Meta solo envía el ID y el titular del anuncio, nunca el nombre de la
 * campaña. Solo owner/admin. Se usa el cliente del USUARIO: la policy de
 * `captacion_ad_labels` (is_org_admin) es el segundo candado.
 */

const bodySchema = z.object({
  org_id: z.string().uuid(),
  ad_id: z.string().min(1).max(64),
  label: z.string().max(80),
});

export async function PUT(req: NextRequest) {
  const parsed = await parseBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  const { org_id, ad_id } = parsed.data;
  const label = parsed.data.label.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", org_id)
    .eq("is_active", true)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador puede nombrar anuncios" },
      { status: 403 },
    );
  }

  if (!label) {
    const { error } = await supabase
      .from("captacion_ad_labels")
      .delete()
      .eq("organization_id", org_id)
      .eq("ad_id", ad_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, label: null });
  }

  const { error } = await supabase
    .from("captacion_ad_labels")
    .upsert(
      { organization_id: org_id, ad_id, label, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: "organization_id,ad_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, label });
}
