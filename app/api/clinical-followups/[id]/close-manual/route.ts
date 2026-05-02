import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type { ContactEvent } from "@/types/fertility";

const schema = z.object({
  reason: z.string().min(3).max(500),
});

/**
 * PATCH /api/clinical-followups/[id]/close-manual
 *
 * Cierra el seguimiento con motivo libre. Append a contact_events
 * un evento `manual_close` con la razón y timestamp.
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

  const { data: current, error: curErr } = await supabase
    .from("clinical_followups")
    .select("contact_events")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();
  if (curErr || !current) {
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  }

  const events: ContactEvent[] = Array.isArray(current.contact_events)
    ? (current.contact_events as unknown as ContactEvent[])
    : [];
  const now = new Date().toISOString();
  const newEvent: ContactEvent = {
    type: "manual_close",
    at: now,
    by_user_id: user.id,
    delivery_status: "unknown",
    reason: parsed.data.reason,
  };

  const { data, error } = await supabase
    .from("clinical_followups")
    .update({
      status: "cerrado_manual",
      closure_reason: "cerrado_manual",
      closed_at: now,
      is_resolved: true,
      resolved_at: now,
      resolved_by: user.id,
      contact_events: [...events, newEvent],
      notes: parsed.data.reason,
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
