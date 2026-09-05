import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertFertilityAddon } from "@/lib/fertility/assert-fertility-addon";
import type { Treatment } from "@/types/treatments";

/**
 * POST /api/treatments/[id]/reopen — sin body.
 *
 * Delega en el RPC `treatment_reopen` (mig 245): solo owner/admin
 * (is_org_admin). Limpia cierre/desenlace y devuelve el presupuesto a
 * `in_progress` en la misma transacción. Idempotente: reabrir uno en curso
 * no hace nada. Cliente del USUARIO: el RPC decide con auth.uid().
 *
 * Respuesta: `{ data: Treatment }`.
 */

function mapRpcError(err: { code?: string; message?: string }): NextResponse {
  const msg = err.message ?? "";
  if (msg.includes("forbidden") || err.code === "42501") {
    return NextResponse.json({ error: "Solo dirección puede reabrir un tratamiento" }, { status: 403 });
  }
  if (err.code === "23514") {
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json({ error: msg || "No se pudo reabrir el tratamiento" }, { status: 500 });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: existing } = await supabase
    .from("treatments")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Tratamiento no encontrado" }, { status: 404 });
  }
  // Gate del addon (el RPC valida rol y estado, no el addon).
  const noAddon = await assertFertilityAddon(supabase, existing.organization_id);
  if (noAddon) return noAddon;

  const { error: rpcErr } = await supabase.rpc("treatment_reopen", { p_treatment_id: id });
  if (rpcErr) return mapRpcError(rpcErr);

  const { data: updated, error: readErr } = await supabase
    .from("treatments")
    .select("*")
    .eq("id", id)
    .single();
  if (readErr || !updated) {
    return NextResponse.json({ error: "Reabierto, pero no se pudo releer" }, { status: 500 });
  }
  return NextResponse.json({ data: updated as Treatment });
}
