import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plans whose onboarding should start with 2 default offices instead of 1.
 *
 * Decisión de pricing (2026-06-02): el signup siembra 1 consultorio para todos
 * (mig 164, porque el plan no se conoce aún). Cuando el plan elegido es Centro
 * Médico o superior — que permiten >= 2 consultorios — sembramos el segundo al
 * activar el plan. Independiente (max_offices = 1) se queda con 1.
 */
const PLANS_WITH_TWO_OFFICES = new Set(["professional", "enterprise"]);

/**
 * Seed the second default office for orgs onboarding into a multi-office plan.
 *
 * Idempotente y seguro de llamar en cada activación: solo inserta si la org
 * tiene EXACTAMENTE 1 consultorio. Una org Centro Médico/Clínica recién creada
 * tiene el único 'Consultorio principal' sembrado en el signup, así que el
 * segundo se agrega una sola vez. En renovaciones (ya con 2+) no hace nada.
 * Como ambos planes permiten >= 2 consultorios, nunca empuja a la org sobre su
 * límite. Los errores se tragan: sembrar un consultorio jamás debe bloquear la
 * activación de un plan.
 */
export async function seedSecondOfficeIfNeeded(
  supabase: SupabaseClient,
  organizationId: string,
  planSlug: string
): Promise<void> {
  if (!PLANS_WITH_TWO_OFFICES.has(planSlug)) return;

  try {
    const { count, error: countError } = await supabase
      .from("offices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    if (countError) {
      console.warn("[seed-offices] count failed:", countError.message);
      return;
    }
    if (count !== 1) return; // 0 = nada que extender; 2+ = ya configurada

    const { error: insertError } = await supabase.from("offices").insert({
      name: "Consultorio 2",
      description: "Consultorio secundario",
      display_order: 2,
      organization_id: organizationId,
    });

    if (insertError) {
      console.warn("[seed-offices] insert failed:", insertError.message);
    }
  } catch (err) {
    console.warn("[seed-offices] unexpected error:", err);
  }
}
