import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";

/**
 * PATCH /api/clinical-followups/[id]/close-no-response
 *
 * Marca el seguimiento como `desistido_silencioso` (paciente no respondió).
 * No requiere body.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership)
    return NextResponse.json({ error: "No perteneces a una organización" }, { status: 403 });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("clinical_followups")
    .update({
      status: "desistido_silencioso",
      closure_reason: "desistido_silencioso",
      closed_at: now,
      is_resolved: true,
      resolved_at: now,
      resolved_by: user.id,
    })
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}
