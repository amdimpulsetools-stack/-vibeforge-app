import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import { FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY } from "@/types/fertility";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Gate del addon Pack Fertilidad para rutas API del módulo Tratamientos.
 *
 * Devuelve `null` si la org tiene `fertility_basic` o `fertility_premium`
 * habilitado, o el NextResponse 403 que el caller debe retornar tal cual.
 * Mismo criterio (y mismo mensaje) que `/api/treatments` y
 * `/api/budgets/[id]/start`: sin addon, ninguna ruta del módulo escribe ni
 * lee — las páginas ya lo esconden con `<FertilityAddonGate>`, esto cierra
 * el camino directo por fetch.
 */
export async function assertFertilityAddon(
  supabase: SupaClient,
  organizationId: string,
): Promise<NextResponse | null> {
  const { data } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }
  return null;
}
