import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generalLimiter } from "@/lib/rate-limit";
import {
  loadProductAdminContext,
  rpcErrorResponse,
} from "@/lib/almacen/product-admin-route";

export const runtime = "nodejs";

/**
 * POST /api/almacen/products/[id]/restore
 *
 * Vuelve a activar un producto archivado (`inventory_restore_product`,
 * mig 264). Si mientras estaba archivado se creó otro activo con el mismo
 * nombre (el índice único de la mig 209 es parcial), el RPC devuelve
 * unique_violation → 409 con "Ya existe otro producto activo con ese
 * nombre; renómbralo antes de restaurar".
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const ctx = await loadProductAdminContext(id);
  if (ctx.error) return ctx.error;
  const { supabase, userId } = ctx;

  const rl = generalLimiter(userId);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const { data, error } = await supabase.rpc("inventory_restore_product", {
    p_product_id: id,
  });
  if (error) return rpcErrorResponse(error);

  return NextResponse.json(data ?? { action: "restored" });
}
