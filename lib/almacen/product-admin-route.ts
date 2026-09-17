import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Contexto común de `/api/almacen/products/[id]/{archive,restore}` (mig 264).
 *
 * La org sale del PROPIO producto (la RLS de la mig 209 ya oculta los de
 * otras orgs, así que "no existe" y "no es tuyo" colapsan en 404) y luego
 * se exige membresía ACTIVA owner/admin en esa org. El RPC vuelve a
 * comprobarlo con `is_org_admin` (segundo candado): aquí solo se traduce a
 * un 403 legible antes de llamar.
 */

type SupaClient = Awaited<ReturnType<typeof createClient>>;

type Ctx =
  | { error: NextResponse; supabase?: never; userId?: never }
  | { error?: never; supabase: SupaClient; userId: string };

export async function loadProductAdminContext(productId: string): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }

  const { data: product } = await supabase
    .from("inventory_products")
    .select("organization_id")
    .eq("id", productId)
    .maybeSingle();
  const orgId = (product as { organization_id?: string } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "Producto no encontrado" }, { status: 404 }) };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "owner" && role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Solo el dueño o un administrador puede archivar o eliminar productos" },
        { status: 403 },
      ),
    };
  }

  return { supabase, userId: user.id };
}

interface PgError {
  code?: string;
  message: string;
}

/**
 * Traduce el error del RPC a HTTP. Los mensajes legibles los escribe el
 * propio RPC (stock ≠ 0, nombre duplicado, motivo faltante); aquí solo se
 * elige el código.
 *   42501 (insufficient_privilege) → 403
 *   23514 (check_violation)        → 409  "Tiene N unidades en stock…"
 *   23505 (unique_violation)       → 409  "Ya existe otro producto activo…"
 *   P0002 (no_data_found)          → 404
 *   42883 / PGRST202                → 503  (mig 264 sin aplicar)
 */
export function rpcErrorResponse(error: PgError): NextResponse {
  switch (error.code) {
    case "42501":
      return NextResponse.json({ error: error.message }, { status: 403 });
    case "23514":
    case "23505":
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    case "P0002":
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    case "42883":
    case "PGRST202":
      return NextResponse.json(
        { error: "Función no disponible todavía (migración 264 pendiente)" },
        { status: 503 },
      );
    default:
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
