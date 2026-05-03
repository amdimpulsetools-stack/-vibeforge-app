import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({
  days: z.number().int().min(1).max(90),
});

/**
 * PATCH /api/clinical-followups/[id]/snooze
 *
 * Posponer N días. Setea snooze_until y status='pospuesto'.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership)
    return NextResponse.json({ error: "No perteneces a una organización" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const snoozeUntil = new Date(
    Date.now() + parsed.data.days * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("clinical_followups")
    .update({
      snooze_until: snoozeUntil,
      status: "pospuesto",
    })
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}
