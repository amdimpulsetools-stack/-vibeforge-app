import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api-utils";
import { generalLimiter } from "@/lib/rate-limit";
import {
  loadProductAdminContext,
  rpcErrorResponse,
} from "@/lib/almacen/product-admin-route";

export const runtime = "nodejs";

/**
 * POST /api/almacen/products/[id]/archive
 * Body: { reason?: string }
 *
 * Archiva el producto o, si no tiene historial (movimientos, lotes, ventas,
 * comprobantes), lo elimina de verdad con auditoría — lo decide el RPC
 * `inventory_archive_or_delete_product` (mig 264), no el cliente. El motivo
 * es obligatorio (≥ 3 caracteres) solo cuando se archiva; el RPC lo exige.
 *
 * Respuesta: `{ action: 'deleted' | 'archived', name, movements?, lots?,
 * sales?, invoices? }`. 409 con mensaje legible cuando hay stock ≠ 0.
 */

const bodySchema = z.object({
  reason: z.string().max(200).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;
  const reason = parsed.data.reason?.trim() || null;

  const ctx = await loadProductAdminContext(id);
  if (ctx.error) return ctx.error;
  const { supabase, userId } = ctx;

  const rl = generalLimiter(userId);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  // Cliente del USUARIO: el RPC re-verifica is_org_admin con auth.uid().
  const { data, error } = await supabase.rpc("inventory_archive_or_delete_product", {
    p_product_id: id,
    p_reason: reason,
  });
  if (error) return rpcErrorResponse(error);

  return NextResponse.json(data ?? { action: "archived" });
}
