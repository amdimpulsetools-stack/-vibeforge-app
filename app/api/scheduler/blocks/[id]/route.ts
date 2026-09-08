import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import { resolveDisplayName } from "@/lib/scheduler/display-name";

export const runtime = "nodejs";

/**
 * DELETE /api/scheduler/blocks/[id] — desbloquea (mig 254).
 *
 * No borra: marca removed_at / removed_by / removed_by_name y deja la fila
 * "Bloqueo de agenda · Eliminar" en el registro de auditoría. Cualquier
 * miembro activo de la org puede hacerlo (policy de UPDATE); la fila
 * original conserva quién y cuándo bloqueó.
 *
 * `.select()` obliga a comprobar que la marca de verdad tocó una fila: si
 * RLS filtra, PostgREST devuelve 204 sin error y la app anterior mentía con
 * "Horario desbloqueado".
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: block } = await supabase
    .from("schedule_blocks")
    .select("id, organization_id, block_date, start_time, end_time, office_id, all_day, reason, created_by_name, removed_at")
    .eq("id", id)
    .maybeSingle();
  const b = block as
    | {
        id: string;
        organization_id: string;
        block_date: string;
        start_time: string | null;
        end_time: string | null;
        office_id: string | null;
        all_day: boolean;
        reason: string | null;
        created_by_name: string | null;
        removed_at: string | null;
      }
    | null;

  if (!b) {
    // RLS (otra org) o no existe: mismo mensaje, no se filtra información.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (b.removed_at) {
    return NextResponse.json({ error: "already_removed", removed_at: b.removed_at }, { status: 409 });
  }

  const removedByName = await resolveDisplayName(supabase, user);
  const nowIso = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("schedule_blocks")
    .update({
      removed_at: nowIso,
      removed_by: user.id,
      removed_by_name: removedByName,
    } as Record<string, unknown>)
    .eq("id", id)
    .is("removed_at", null)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  logClinicalAccess({
    organizationId: b.organization_id,
    userId: user.id,
    resourceType: "schedule_block",
    action: "delete",
    resourceId: b.id,
    metadata: {
      block_date: b.block_date,
      all_day: b.all_day,
      start_time: b.start_time?.slice(0, 5) ?? null,
      end_time: b.end_time?.slice(0, 5) ?? null,
      office_id: b.office_id,
      reason: b.reason,
      created_by_name: b.created_by_name,
      removed_by_name: removedByName,
    },
  });

  return NextResponse.json({ ok: true, removed_at: nowIso, removed_by_name: removedByName });
}
