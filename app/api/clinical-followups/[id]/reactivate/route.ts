import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import type { ContactEvent } from "@/types/fertility";
import { assertActiveMembership } from "@/lib/followups/org-scope";

/**
 * PATCH /api/clinical-followups/[id]/reactivate
 *
 * Mueve un seguimiento desde el tab "Sin respuesta" de vuelta a
 * "Pendientes". Resetea attempt_count, closure_reason, closed_at y
 * is_resolved.
 *
 * Atribución: reactivar abre un CICLO NUEVO, así que también resetea
 * `first_contact_at`. Si se preservara, el trigger de atribución
 * (mig 129) vería el contacto del ciclo viejo y clasificaría como
 * Categoría A ("recuperado gracias al contacto") una vuelta que en
 * realidad fue orgánica, inflando los soles atribuidos al módulo.
 * El timestamp viejo no se pierde: queda archivado en `contact_events`
 * como evento `reactivation_reset`. Si la asesora vuelve a contactar,
 * `/[id]/contact` (y el cron) setean un `first_contact_at` fresco —
 * solo cuando es NULL — y una recuperación posterior sí cuenta como
 * Categoría A legítima.
 */
export async function PATCH(
  _request: NextRequest,
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

  // Scoping multi-org: la org sale del propio seguimiento. Aquí leemos
  // además las columnas que el reset de atribución necesita.
  const { data: current, error: curErr } = await supabase
    .from("clinical_followups")
    .select("id, organization_id, first_contact_at, contact_events")
    .eq("id", id)
    .maybeSingle();
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

  const now = new Date().toISOString();

  const updateData: Record<string, unknown> = {
    status: "pendiente",
    attempt_count: 0,
    closure_reason: null,
    closed_at: null,
    is_resolved: false,
    resolved_at: null,
    resolved_by: null,
    snooze_until: null,
  };

  // Solo tocamos la atribución si había contacto previo que archivar.
  if (current.first_contact_at) {
    const events: ContactEvent[] = Array.isArray(current.contact_events)
      ? (current.contact_events as unknown as ContactEvent[])
      : [];

    const newEvent: ContactEvent = {
      type: "reactivation_reset",
      at: now,
      by_user_id: user.id,
      delivery_status: "unknown",
      archived_first_contact_at: current.first_contact_at as string,
      reason:
        "Reactivación: se archiva el first_contact_at del ciclo anterior y se reinicia la atribución",
    };

    updateData.contact_events = [...events, newEvent];
    updateData.first_contact_at = null;
  }

  const { data, error } = await supabase
    .from("clinical_followups")
    .update(updateData)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json({ error: "Seguimiento no encontrado" }, { status: 404 });
  return NextResponse.json({ data });
}
