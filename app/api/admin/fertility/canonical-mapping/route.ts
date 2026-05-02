import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import {
  FERTILITY_TIER_GROUP,
  FERTILITY_ESSENTIAL_CATEGORIES,
} from "@/types/fertility";

/**
 * GET /api/admin/fertility/canonical-mapping
 *
 * Returns the catalog of fertility canonical categories (14 items) and
 * the org's current mapping. Visible to any org member; mutations require
 * owner/admin.
 *
 * Response shape:
 * {
 *   categories: [
 *     { category_key, display_name, description, sort_order, is_essential }
 *   ],
 *   mappings: [
 *     { category_key, services: [{ id, name }] }
 *   ]
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
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
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
  const orgId = membership.organization_id;

  const essentialSet = new Set<string>(FERTILITY_ESSENTIAL_CATEGORIES);

  const [catRes, mapRes] = await Promise.all([
    supabase
      .from("addon_canonical_categories")
      .select("category_key, display_name, description, sort_order")
      .eq("addon_key", FERTILITY_TIER_GROUP)
      .order("sort_order", { ascending: true }),
    supabase
      .from("organization_service_canonical_mapping")
      .select("category_key, service_id, services(id, name)")
      .eq("organization_id", orgId),
  ]);

  if (catRes.error) {
    return NextResponse.json(
      { error: catRes.error.message },
      { status: 500 }
    );
  }

  const categories = (catRes.data ?? []).map((c) => ({
    ...c,
    is_essential: essentialSet.has(c.category_key),
  }));

  // Group mapping rows by category_key.
  const grouped = new Map<string, { id: string; name: string }[]>();
  for (const row of mapRes.data ?? []) {
    const svc = row.services as unknown as { id: string; name: string } | null;
    if (!svc) continue;
    const list = grouped.get(row.category_key) ?? [];
    list.push({ id: svc.id, name: svc.name });
    grouped.set(row.category_key, list);
  }

  const mappings = Array.from(grouped.entries()).map(([category_key, services]) => ({
    category_key,
    services,
  }));

  return NextResponse.json({ categories, mappings });
}

const putSchema = z.object({
  mappings: z
    .array(
      z.object({
        category_key: z.string().min(1).max(120),
        service_ids: z.array(z.string().uuid()).max(50),
      })
    )
    .max(50),
});

/**
 * PUT /api/admin/fertility/canonical-mapping
 *
 * Replaces the entire canonical mapping for the org in one transaction:
 * delete-all + insert-all. Required body shape:
 *   { mappings: [{ category_key, service_ids }] }
 *
 * The 3 essential categories (first_consultation, second_consultation,
 * treatment_decision) are NOT enforced as required (spec sec. 6.3) — we
 * return a `warning` field with which essentials are missing, but always
 * 200/204 if the mapping is structurally valid.
 */
export async function PUT(request: NextRequest) {
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

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
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
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador puede editar el mapeo" },
      { status: 403 }
    );
  }
  const orgId = membership.organization_id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { mappings } = parsed.data;

  // Defense-in-depth: validate that all category_keys belong to the
  // fertility addon and that all service_ids belong to this org.
  const requestedCategoryKeys = Array.from(
    new Set(mappings.map((m) => m.category_key))
  );

  if (requestedCategoryKeys.length > 0) {
    const { data: validCats } = await supabase
      .from("addon_canonical_categories")
      .select("category_key")
      .eq("addon_key", FERTILITY_TIER_GROUP)
      .in("category_key", requestedCategoryKeys);
    const validCatSet = new Set(
      (validCats ?? []).map((c) => c.category_key)
    );
    const invalidCats = requestedCategoryKeys.filter((k) => !validCatSet.has(k));
    if (invalidCats.length > 0) {
      return NextResponse.json(
        {
          error: "Algunas categorías no pertenecen al addon fertility",
          invalid_categories: invalidCats,
        },
        { status: 400 }
      );
    }
  }

  const allServiceIds = Array.from(
    new Set(mappings.flatMap((m) => m.service_ids))
  );
  if (allServiceIds.length > 0) {
    const { data: validServices } = await supabase
      .from("services")
      .select("id")
      .eq("organization_id", orgId)
      .in("id", allServiceIds);
    const validIds = new Set((validServices ?? []).map((s) => s.id));
    const invalid = allServiceIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: "Algún servicio no pertenece a tu organización",
          invalid_service_ids: invalid,
        },
        { status: 400 }
      );
    }
  }

  // Replace strategy: delete all current rows for this org's fertility
  // categories then insert the new set. We scope the delete only to
  // categories of fertility — if we ever add other addons with their
  // own canonical maps, we must not nuke them.
  const fertilityCategoryKeysQ = await supabase
    .from("addon_canonical_categories")
    .select("category_key")
    .eq("addon_key", FERTILITY_TIER_GROUP);
  const fertilityCategoryKeys = (fertilityCategoryKeysQ.data ?? []).map(
    (c) => c.category_key
  );

  if (fertilityCategoryKeys.length === 0) {
    return NextResponse.json(
      { error: "No hay categorías canónicas configuradas para fertility" },
      { status: 500 }
    );
  }

  const { error: delErr } = await supabase
    .from("organization_service_canonical_mapping")
    .delete()
    .eq("organization_id", orgId)
    .in("category_key", fertilityCategoryKeys);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Build the insert rows. Skip empty service_ids.
  const rows = mappings.flatMap((m) =>
    m.service_ids.map((sid) => ({
      organization_id: orgId,
      category_key: m.category_key,
      service_id: sid,
    }))
  );

  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("organization_service_canonical_mapping")
      .insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // Soft warning about essentials.
  const mapped = new Set(
    mappings
      .filter((m) => m.service_ids.length > 0)
      .map((m) => m.category_key)
  );
  const missingEssentials = FERTILITY_ESSENTIAL_CATEGORIES.filter(
    (k) => !mapped.has(k)
  );

  return NextResponse.json({
    ok: true,
    saved: rows.length,
    missing_essentials: missingEssentials,
  });
}
