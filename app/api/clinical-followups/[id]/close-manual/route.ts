import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type { ContactEvent } from "@/types/fertility";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import {
  NO_RESCHEDULE_REASONS,
  RESCHEDULE_PENDING_RULE_KEY,
} from "@/lib/followups/reschedule";

const REASON_CODES = NO_RESCHEDULE_REASONS.map((r) => r.code) as [
  (typeof NO_RESCHEDULE_REASONS)[number]["code"],
  ...(typeof NO_RESCHEDULE_REASONS)[number]["code"][],
];

// `reason` sigue siendo obligatorio (≥3) para todas las reglas, salvo en
// "Por reprogramar" con un motivo fijo (`reason_code` ≠ 'otro'): ahí el
// texto es opcional. Se valida más abajo, cuando ya se conoce la regla.
const schema = z.object({
  reason: z.string().trim().max(500).optional(),
  reason_code: z.enum(REASON_CODES).optional(),
});

/**
 * PATCH /api/clinical-followups/[id]/close-manual
 *
 * Cierra el seguimiento con motivo libre. Append a contact_events
 * un evento `manual_close` con la razón y timestamp.
 *
 * "Por reprogramar" (mig 273): acepta `reason_code` (NO_RESCHEDULE_REASONS)
 * y guarda closure_reason = 'no_reprograma_<code>' para que el desenlace
 * quede consultable; el texto libre va a notes como siempre.
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { data: current, error: curErr } = await supabase
    .from("clinical_followups")
    .select("organization_id, contact_events, rule_key")
    .eq("id", id)
    .single();
  if (curErr || !current) {
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  }

  const denied = await assertActiveMembership(
    supabase,
    user.id,
    current.organization_id
  );
  if (denied) return denied;
  const organizationId = current.organization_id;

  const isReschedule =
    (current as { rule_key?: string | null }).rule_key ===
    RESCHEDULE_PENDING_RULE_KEY;
  const reasonCode = isReschedule ? parsed.data.reason_code : undefined;
  const reasonText = parsed.data.reason ?? "";
  const textRequired = !reasonCode || reasonCode === "otro";
  if (textRequired && reasonText.length < 3)
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const reasonLabel = reasonCode
    ? NO_RESCHEDULE_REASONS.find((r) => r.code === reasonCode)?.label ?? reasonCode
    : null;
  // Texto que se guarda (auditoría + notes): el motivo fijo y, si hay, el
  // detalle libre.
  const fullReason = reasonLabel
    ? reasonText && reasonCode !== "otro"
      ? `No reprograma: ${reasonLabel} — ${reasonText}`
      : `No reprograma: ${reasonCode === "otro" ? reasonText : reasonLabel}`
    : reasonText;

  const events: ContactEvent[] = Array.isArray(current.contact_events)
    ? (current.contact_events as unknown as ContactEvent[])
    : [];
  const now = new Date().toISOString();
  const newEvent: ContactEvent = {
    type: "manual_close",
    at: now,
    by_user_id: user.id,
    delivery_status: "unknown",
    reason: fullReason,
  };

  const { data, error } = await supabase
    .from("clinical_followups")
    .update({
      status: "cerrado_manual",
      closure_reason: reasonCode ? `no_reprograma_${reasonCode}` : "cerrado_manual",
      closed_at: now,
      is_resolved: true,
      resolved_at: now,
      resolved_by: user.id,
      contact_events: [...events, newEvent],
      notes: fullReason,
    })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}
