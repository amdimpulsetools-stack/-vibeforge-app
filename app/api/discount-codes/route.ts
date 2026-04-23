import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const discountCodeSchema = z.object({
  code: z.string().trim().min(2).max(50),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive().max(1000000),
  max_uses: z.number().int().positive().max(1000000).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  applies_to_service_ids: z.array(z.string().uuid()).nullable().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

async function requireOrgAndPlan() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const rl = generalLimiter(user.id);
  if (!rl.success) return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };

  const { data: memb } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!memb) return { error: NextResponse.json({ error: "No organization" }, { status: 403 }) };

  // Plan gating: codes are a Pro feature (Professional / Enterprise).
  const { data: sub } = await supabase
    .from("organization_subscriptions")
    .select("plan_id, plans(slug)")
    .eq("organization_id", memb.organization_id)
    .in("status", ["active", "trialing"])
    .limit(1)
    .single();
  const planSlug = (sub as { plans?: { slug?: string } | null } | null)?.plans?.slug;
  if (!planSlug || planSlug === "starter") {
    return {
      error: NextResponse.json(
        { error: "Los códigos de descuento requieren plan Professional o superior" },
        { status: 402 }
      ),
    };
  }

  return { supabase, user, orgId: memb.organization_id as string };
}

export async function GET() {
  const ctx = await requireOrgAndPlan();
  if ("error" in ctx) return ctx.error;
  const { supabase, orgId } = ctx;

  const { data, error } = await supabase
    .from("discount_codes")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const ctx = await requireOrgAndPlan();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, orgId } = ctx;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = discountCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const payload = { ...parsed.data, code: parsed.data.code.toUpperCase() };

  // Validate percent value ≤ 100
  if (payload.type === "percent" && payload.value > 100) {
    return NextResponse.json(
      { error: "El porcentaje no puede exceder 100" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("discount_codes")
    .insert({
      ...payload,
      organization_id: orgId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ya existe un código con ese nombre" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
