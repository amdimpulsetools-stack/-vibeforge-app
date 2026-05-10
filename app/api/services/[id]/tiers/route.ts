import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// /api/services/[id]/tiers
//
// Manages the 3 budget tiers (A/B/C) for a single service. Used by
// the admin services UI when the fertility addon is active.
//
// GET  → returns the current tier rows (active OR inactive). RLS
//        already filters by org via the service FK.
// PUT  → upserts the 3 tier rows. Body: { tiers: [{ tier, amount,
//        currency, includes_text?, notes?, is_active }, ...] }.
//        Caller must be owner|admin and the org must have a
//        fertility addon active.
//
// The DB has a partial UNIQUE on (service_id, tier) WHERE is_active.
// We honor it by:
//   - finding the existing row id by (service_id, tier) regardless
//     of is_active and updating in-place when it exists, OR
//   - inserting a new row otherwise.
// This keeps "soft-delete + recreate" possible without violating the
// constraint.
// ──────────────────────────────────────────────────────────────────

const TIER_LETTERS = ["A", "B", "C"] as const;
type TierLetter = (typeof TIER_LETTERS)[number];

const tierRowSchema = z.object({
  tier: z.enum(TIER_LETTERS),
  amount: z.coerce.number().min(0, "Monto inválido"),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  includes_text: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  is_active: z.boolean().default(true),
});

const putBodySchema = z.object({
  tiers: z
    .array(tierRowSchema)
    .min(1, "Debes enviar al menos un tier")
    .max(3, "Máximo 3 tiers (A/B/C)"),
});

interface ServiceLookup {
  id: string;
  organization_id: string;
}

async function loadServiceForCaller(
  supabase: Awaited<ReturnType<typeof createClient>>,
  serviceId: string,
): Promise<
  | { ok: true; service: ServiceLookup; orgId: string; role: string }
  | { ok: false; status: number; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "No autenticado" };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return { ok: false, status: 403, error: "Sin organización activa" };
  }

  const { data: service, error: serviceErr } = await supabase
    .from("services")
    .select("id, organization_id")
    .eq("id", serviceId)
    .single();

  if (serviceErr || !service) {
    return { ok: false, status: 404, error: "Servicio no encontrado" };
  }

  if (service.organization_id !== membership.organization_id) {
    return { ok: false, status: 403, error: "Servicio fuera de tu organización" };
  }

  return {
    ok: true,
    service: service as ServiceLookup,
    orgId: membership.organization_id,
    role: membership.role,
  };
}

async function assertFertilityAddon(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<boolean> {
  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", orgId)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  return Boolean(addonRows && addonRows.length > 0);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: serviceId } = await params;
  const supabase = await createClient();

  const lookup = await loadServiceForCaller(supabase, serviceId);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const hasAddon = await assertFertilityAddon(supabase, lookup.orgId);
  if (!hasAddon) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("service_budget_tiers")
    .select(
      "id, service_id, tier, amount, currency, includes_text, notes, is_active, created_at, updated_at",
    )
    .eq("service_id", serviceId)
    .order("tier", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tiers: data ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: serviceId } = await params;
  const supabase = await createClient();

  const lookup = await loadServiceForCaller(supabase, serviceId);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  if (!["owner", "admin"].includes(lookup.role)) {
    return NextResponse.json(
      { error: "Solo el dueño o administrador pueden editar tiers" },
      { status: 403 },
    );
  }

  const hasAddon = await assertFertilityAddon(supabase, lookup.orgId);
  if (!hasAddon) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  let parsed: z.infer<typeof putBodySchema>;
  try {
    const body = await req.json();
    parsed = putBodySchema.parse(body);
  } catch (err) {
    const msg = err instanceof z.ZodError
      ? err.issues.map((i) => i.message).join("; ")
      : "Body inválido";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Reject duplicate tier letters in the same payload.
  const seen = new Set<TierLetter>();
  for (const t of parsed.tiers) {
    if (seen.has(t.tier)) {
      return NextResponse.json(
        { error: `Tier ${t.tier} duplicado en la petición` },
        { status: 400 },
      );
    }
    seen.add(t.tier);
  }

  // Fetch existing rows so we can update in-place by id (preserving
  // the partial UNIQUE: a soft-deleted row keeps its identity, and a
  // new active row can be inserted later if the admin re-activates).
  const { data: existingRows, error: fetchErr } = await supabase
    .from("service_budget_tiers")
    .select("id, tier, is_active")
    .eq("service_id", serviceId);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Multiple rows can exist per tier (one active + N inactive history).
  // Prefer the active row; otherwise the most recent inactive one.
  const activeByTier = new Map<TierLetter, string>();
  const anyByTier = new Map<TierLetter, string>();
  for (const row of existingRows ?? []) {
    const t = row.tier as TierLetter;
    if (row.is_active) activeByTier.set(t, row.id as string);
    if (!anyByTier.has(t)) anyByTier.set(t, row.id as string);
  }

  const results: Array<{ tier: TierLetter; id: string }> = [];

  for (const tier of parsed.tiers) {
    const existingId = activeByTier.get(tier.tier) ?? anyByTier.get(tier.tier);

    const payload = {
      service_id: serviceId,
      tier: tier.tier,
      amount: tier.amount,
      currency: tier.currency,
      includes_text: tier.includes_text ?? null,
      notes: tier.notes ?? null,
      is_active: tier.is_active,
    };

    if (existingId) {
      const { error: upErr } = await supabase
        .from("service_budget_tiers")
        .update(payload)
        .eq("id", existingId);
      if (upErr) {
        return NextResponse.json(
          { error: `Tier ${tier.tier}: ${upErr.message}` },
          { status: 500 },
        );
      }
      results.push({ tier: tier.tier, id: existingId });
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("service_budget_tiers")
        .insert(payload)
        .select("id")
        .single();
      if (insErr || !inserted) {
        return NextResponse.json(
          { error: `Tier ${tier.tier}: ${insErr?.message ?? "insert error"}` },
          { status: 500 },
        );
      }
      results.push({ tier: tier.tier, id: inserted.id as string });
    }
  }

  return NextResponse.json({ ok: true, tiers: results });
}
