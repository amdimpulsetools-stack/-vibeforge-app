import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertFertilityAddon } from "@/lib/fertility/assert-fertility-addon";
import type { Treatment } from "@/types/treatments";

/**
 * POST /api/treatments/[id]/close — body TreatmentCloseInput
 *   `{ status: completed|abandoned|cancelled, outcome?, reason?, closed_at? }`
 *
 * Delega en el RPC `treatment_close` (mig 245): valida rol (owner/admin/
 * doctor), que esté en curso, estampa cierre y deja el presupuesto en
 * `completed` en la misma transacción. Se usa el cliente del USUARIO porque
 * el RPC lee auth.uid() para el rol y `closed_by`. También dispara el
 * cierre automático de seguimientos (trigger mig 242).
 *
 * Respuesta: `{ data: Treatment }` (fila ya cerrada).
 */

const bodySchema = z.object({
  status: z.enum(["completed", "abandoned", "cancelled"]),
  outcome: z.enum(["pregnancy", "no_pregnancy", "abandoned", "transferred", "other"]).optional(),
  reason: z.string().max(1000).optional(),
  closed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").optional(),
});

function mapRpcError(err: { code?: string; message?: string }): NextResponse {
  const msg = err.message ?? "";
  if (msg.includes("forbidden") || err.code === "42501") {
    return NextResponse.json({ error: "Sin permisos para cerrar el tratamiento" }, { status: 403 });
  }
  if (err.code === "23514") {
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json({ error: msg || "No se pudo cerrar el tratamiento" }, { status: 500 });
}

export async function POST(
  request: NextRequest,
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

  let input: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // RLS oculta los tratamientos de orgs ajenas: "no existe" y "no es tuyo"
  // colapsan en el mismo 404 antes de tocar el RPC.
  const { data: existing } = await supabase
    .from("treatments")
    .select("id, status, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Tratamiento no encontrado" }, { status: 404 });
  }
  // Gate del addon (el RPC valida rol y estado, no el addon).
  const noAddon = await assertFertilityAddon(supabase, existing.organization_id);
  if (noAddon) return noAddon;

  const { error: rpcErr } = await supabase.rpc("treatment_close", {
    p_treatment_id: id,
    p_status: input.status,
    p_outcome: input.outcome ?? null,
    p_reason: input.reason ?? null,
    p_closed_at: input.closed_at ?? null,
  });
  if (rpcErr) return mapRpcError(rpcErr);

  const { data: updated, error: readErr } = await supabase
    .from("treatments")
    .select("*")
    .eq("id", id)
    .single();
  if (readErr || !updated) {
    return NextResponse.json({ error: "Cerrado, pero no se pudo releer" }, { status: 500 });
  }
  return NextResponse.json({ data: updated as Treatment });
}
