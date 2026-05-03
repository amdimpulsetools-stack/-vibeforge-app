import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";

interface RuleRow {
  id: string;
  rule_key: string;
  addon_key: string;
  is_active: boolean;
  is_system: boolean;
  target_category_key: string | null;
}

interface CategoryRow {
  category_key: string;
  display_name: string;
}

/**
 * GET /api/admin/fertility/rules
 *
 * Devuelve las reglas activas de la organización para poblar el dropdown
 * "Regla específica" del Sheet de filtros del panel de seguimientos.
 *
 * Auth: cualquier miembro activo de la organización.
 *
 * Shape:
 * {
 *   rules: [{
 *     id, rule_key, addon_key, is_active, is_system,
 *     label,         // human-readable derivado
 *     display_name,  // alias del label para compatibilidad con UI lite
 *   }]
 * }
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 }
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }

  const { data: rulesData, error } = await supabase
    .from("followup_rules")
    .select(
      "id, rule_key, addon_key, is_active, is_system, target_category_key"
    )
    .eq("organization_id", membership.organization_id)
    .eq("is_active", true)
    .order("rule_key", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rules = (rulesData ?? []) as RuleRow[];

  const targetKeys = Array.from(
    new Set(
      rules
        .map((r) => r.target_category_key)
        .filter((k): k is string => typeof k === "string" && k.length > 0)
    )
  );

  const categoryByKey = new Map<string, string>();
  if (targetKeys.length > 0) {
    const { data: cats } = await supabase
      .from("addon_canonical_categories")
      .select("category_key, display_name")
      .in("category_key", targetKeys);
    for (const c of (cats ?? []) as CategoryRow[]) {
      categoryByKey.set(c.category_key, c.display_name);
    }
  }

  const result = rules.map((r) => {
    const label = deriveLabel(r.rule_key, r.target_category_key, categoryByKey);
    return {
      id: r.id,
      rule_key: r.rule_key,
      addon_key: r.addon_key,
      is_active: r.is_active,
      is_system: r.is_system,
      label,
      display_name: label,
    };
  });

  return NextResponse.json({ rules: result });
}

function deriveLabel(
  ruleKey: string,
  targetCategoryKey: string | null,
  categoryByKey: Map<string, string>
): string {
  if (targetCategoryKey) {
    const display = categoryByKey.get(targetCategoryKey);
    if (display) return display;
  }
  // Fallback: derive a readable label from the rule_key.
  const tail = ruleKey.includes(".") ? ruleKey.split(".").slice(1).join(".") : ruleKey;
  const spaced = tail.replace(/_/g, " ").trim();
  if (!spaced) return ruleKey;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
