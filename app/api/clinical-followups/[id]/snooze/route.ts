import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import { RESCHEDULE_PENDING_RULE_KEY } from "@/lib/followups/reschedule";
import { loadOrgTimezone, orgDaysFromTodayNoonIso } from "../../_lib/org-dates";

const schema = z.object({
  days: z.number().int().min(1).max(90),
});

/**
 * PATCH /api/clinical-followups/[id]/snooze
 *
 * Posponer N días. Setea snooze_until y status='pospuesto'.
 *
 * "Por reprogramar" (mig 273): la fecha sale del hoy CIVIL de la org
 * (organizations.timezone, mediodía), nunca se escribe follow_up_date (la
 * tarjeta vive con follow_up_date NULL) y queda rastro en contact_events
 * ({type:'snoozed'}) con autor y fecha.
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

  // La org sale del propio seguimiento (ver lib/followups/org-scope.ts);
  // se leen además la regla y el historial para "Por reprogramar".
  const { data: current } = await supabase
    .from("clinical_followups")
    .select("organization_id, rule_key, contact_events")
    .eq("id", id)
    .maybeSingle();
  if (!current)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  const denied = await assertActiveMembership(supabase, user.id, current.organization_id);
  if (denied) return denied;
  const org = { organizationId: current.organization_id as string };
  const isReschedule =
    (current as { rule_key?: string | null }).rule_key === RESCHEDULE_PENDING_RULE_KEY;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  let update: Record<string, unknown>;
  if (isReschedule) {
    const tz = await loadOrgTimezone(supabase, org.organizationId);
    const snoozeUntil = orgDaysFromTodayNoonIso(tz, parsed.data.days);
    const events = Array.isArray(current.contact_events)
      ? (current.contact_events as unknown[])
      : [];
    update = {
      snooze_until: snoozeUntil,
      expected_by: snoozeUntil,
      status: "pospuesto",
      contact_events: [
        ...events,
        {
          type: "snoozed",
          at: new Date().toISOString(),
          by_user_id: user.id,
          delivery_status: "unknown",
          reason: `Llamar de nuevo en ${parsed.data.days} día${parsed.data.days === 1 ? "" : "s"}`,
        },
      ],
    };
  } else {
    const snoozeUntil = new Date(
      Date.now() + parsed.data.days * 24 * 60 * 60 * 1000
    ).toISOString();
    // Fecha calendario (YYYY-MM-DD) de `follow_up_date`, que es DATE.
    const nextDate = snoozeUntil.slice(0, 10);
    update = {
      snooze_until: snoozeUntil,
      // Posponer tiene que mover la fecha comprometida, no solo el
      // snooze: el bucket Pendientes ordena y muestra `expected_by`, así
      // que sin esto la card seguía apareciendo vencida y en el mismo
      // sitio después de posponerla.
      expected_by: snoozeUntil,
      follow_up_date: nextDate,
      status: "pospuesto",
    };
  }

  const { data, error } = await supabase
    .from("clinical_followups")
    .update(update)
    .eq("id", id)
    .eq("organization_id", org.organizationId)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}
