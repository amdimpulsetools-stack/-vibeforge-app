import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { resolveFollowupOrg } from "@/lib/followups/org-scope";

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

  const org = await resolveFollowupOrg(supabase, user.id, id);
  if (org.error) return org.error;

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
  // Fecha calendario (YYYY-MM-DD) de `follow_up_date`, que es DATE.
  const nextDate = snoozeUntil.slice(0, 10);

  const { data, error } = await supabase
    .from("clinical_followups")
    .update({
      snooze_until: snoozeUntil,
      // Posponer tiene que mover la fecha comprometida, no solo el
      // snooze: el bucket Pendientes ordena y muestra `expected_by`, así
      // que sin esto la card seguía apareciendo vencida y en el mismo
      // sitio después de posponerla.
      expected_by: snoozeUntil,
      follow_up_date: nextDate,
      status: "pospuesto",
    })
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}
