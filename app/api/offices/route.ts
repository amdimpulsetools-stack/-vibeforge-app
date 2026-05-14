import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { checkPlanLimit, planLimitErrorBody } from "@/lib/plan/check-limit";

/**
 * POST /api/offices
 *
 * Create a new office for the caller's org. Owner/admin only.
 *
 * Plan-limit enforced server-side here — the previous flow
 * inserted directly from the client with `supabase.from("offices")`,
 * which means a curl request could create unlimited offices
 * regardless of plan. This route closes that gap.
 *
 * Returns:
 *   201 { data }                  on success
 *   402 { error: "plan_limit_reached", ... }  when over limit
 *   401/403 on auth/role failures
 */

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "too_many_requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) },
      },
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Plan-limit gate.
  const limitCheck = await checkPlanLimit(membership.organization_id, "offices");
  if (!limitCheck.ok) {
    return NextResponse.json(planLimitErrorBody(limitCheck), { status: 402 });
  }

  const { data, error } = await supabase
    .from("offices")
    .insert({
      organization_id: membership.organization_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      is_active: parsed.data.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
