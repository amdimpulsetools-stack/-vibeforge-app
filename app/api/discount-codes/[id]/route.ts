import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(50).optional(),
  type: z.enum(["percent", "fixed"]).optional(),
  value: z.number().positive().max(1000000).optional(),
  max_uses: z.number().int().positive().max(1000000).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  applies_to_service_ids: z.array(z.string().uuid()).nullable().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
});

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const rl = generalLimiter(user.id);
  if (!rl.success) return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  return { supabase, user };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { supabase } = c;
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const payload = { ...parsed.data } as Record<string, unknown>;
  if (typeof payload.code === "string") {
    payload.code = (payload.code as string).toUpperCase();
  }
  if (payload.type === "percent" && typeof payload.value === "number" && payload.value > 100) {
    return NextResponse.json({ error: "El porcentaje no puede exceder 100" }, { status: 400 });
  }
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("discount_codes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ya existe un código con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const c = await ctx();
  if ("error" in c) return c.error;
  const { supabase } = c;
  const { id } = await params;

  const { error } = await supabase.from("discount_codes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
