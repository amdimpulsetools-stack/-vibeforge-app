import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertFertilityAddon } from "@/lib/fertility/assert-fertility-addon";
import type { TreatmentSupplyInput } from "@/types/treatments";

/**
 * /api/treatments/[id]/supplies — insumos de la propia farmacia (mig 268).
 *
 *  POST   → body TreatmentSupplyInput. Delega en el RPC
 *           `treatment_apply_product`: salida del kardex con COGS = CPP
 *           vigente calculado en el servidor, sin precio, con patient_id y
 *           treatment_id. NUNCA toca patient_payments: es un costo del
 *           tratamiento, no un cobro. Devuelve `{ data: { movement_id,
 *           unit_cost, cost_total, warnings } }`; `warnings` trae el aviso
 *           de stock insuficiente (no bloquea, criterio del POS).
 *  DELETE → `?movement_id=` → RPC `treatment_undo_supply`: contra-asiento,
 *           jamás DELETE en el kardex.
 *
 * Cliente del USUARIO: los RPC leen auth.uid() para rol y autoría.
 */

const bodySchema = z
  .object({
    product_id: z.string().uuid(),
    quantity: z.number().positive().max(999999),
    lot_id: z.string().uuid().nullable().optional(),
    movement_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
      .optional(),
    notes: z.string().max(500).optional(),
  })
  .strict();

function mapRpcError(err: { code?: string; message?: string }, fallback: string): NextResponse {
  const msg = err.message ?? "";
  if (msg.includes("forbidden") || err.code === "42501") {
    return NextResponse.json({ error: "Sin permisos para esta acción" }, { status: 403 });
  }
  if (err.code === "23514" || err.code === "P0002") {
    return NextResponse.json({ error: msg }, { status: 409 });
  }
  return NextResponse.json({ error: msg || fallback }, { status: 500 });
}

async function gate(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return { error: NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 }) };
  }
  // RLS oculta los tratamientos de orgs ajenas: "no existe" y "no es tuyo"
  // colapsan en el mismo 404 antes de tocar el RPC.
  const { data: existing } = await supabase
    .from("treatments")
    .select("id, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return { error: NextResponse.json({ error: "Tratamiento no encontrado" }, { status: 404 }) };
  }
  const noAddon = await assertFertilityAddon(supabase, existing.organization_id);
  if (noAddon) return { error: noAddon };
  return { supabase };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let input: TreatmentSupplyInput;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const g = await gate(id);
  if ("error" in g) return g.error;

  const { data, error } = await g.supabase.rpc("treatment_apply_product", {
    p_treatment_id: id,
    p_product_id: input.product_id,
    p_quantity: input.quantity,
    p_lot_id: input.lot_id ?? null,
    p_movement_date: input.movement_date ?? null,
    p_notes: input.notes?.trim() || null,
  });
  if (error) return mapRpcError(error, "No se pudo aplicar el producto");
  return NextResponse.json({ data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const movementId = request.nextUrl.searchParams.get("movement_id");
  if (!movementId || !z.string().uuid().safeParse(movementId).success) {
    return NextResponse.json({ error: "Falta movement_id" }, { status: 400 });
  }

  const g = await gate(id);
  if ("error" in g) return g.error;

  const { data, error } = await g.supabase.rpc("treatment_undo_supply", {
    p_movement_id: movementId,
  });
  if (error) return mapRpcError(error, "No se pudo deshacer la aplicación");
  return NextResponse.json({ data: { reversal_id: data } });
}
