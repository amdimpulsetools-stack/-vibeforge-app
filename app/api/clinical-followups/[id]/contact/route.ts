import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import type { ContactEvent } from "@/types/fertility";

const schema = z.object({
  type: z.enum(["manual_contacted", "manual_whatsapp"]),
});

/**
 * PATCH /api/clinical-followups/[id]/contact
 *
 * Recepcionista presiona el botón "Contactado" o "Enviar WhatsApp manual".
 * Hace tres cosas:
 *  - append a contact_events
 *  - set first_contact_at = NOW() si era NULL (clave para atribución)
 *  - status pendiente → contactado, attempt_count + 1
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

  // Defense-in-depth scoping.
  const { data: current, error: curErr } = await supabase
    .from("clinical_followups")
    .select(
      "id, organization_id, status, first_contact_at, attempt_count, contact_events"
    )
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();
  if (curErr || !current) {
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  }

  const events: ContactEvent[] = Array.isArray(current.contact_events)
    ? (current.contact_events as unknown as ContactEvent[])
    : [];

  const newEvent: ContactEvent = {
    type: parsed.data.type,
    at: new Date().toISOString(),
    by_user_id: user.id,
    delivery_status: "sent",
    channel: parsed.data.type === "manual_whatsapp" ? "whatsapp" : undefined,
  };

  const updateData: Record<string, unknown> = {
    contact_events: [...events, newEvent],
    attempt_count: (current.attempt_count ?? 0) + 1,
    last_contacted_at: new Date().toISOString(),
    contacted_by: user.id,
  };

  if (!current.first_contact_at) {
    updateData.first_contact_at = new Date().toISOString();
  }
  if (current.status === "pendiente") {
    updateData.status = "contactado";
  }

  const { data, error } = await supabase
    .from("clinical_followups")
    .update(updateData)
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
