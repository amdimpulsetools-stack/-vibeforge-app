import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";

// ──────────────────────────────────────────────────────────────────
// POST /api/appointments/[id]/live-status
//
// Single endpoint for the live-status transitions (Part C of the
// visual card status feature, mig 170). Body: { action } where
// action ∈ arrive | unarrive | start | end | reopen.
//
//   arrive    → sets arrived_at (recepción/admin/doctor)
//   unarrive  → clears arrived_at (undo; only while not started)
//   start     → RPC start_consultation (atomic auto-close of the
//               doctor's other open consultation when the org's
//               sub-toggle is on)
//   end       → sets consultation_ended_at + reason 'manual'
//   reopen    → clears consultation_ended_at + reason (undo for a
//               wrong manual/auto close)
//
// Permissions: any active member, with two receptionist rules:
//   • `end` is allowed when the org's toggle
//     scheduler_settings.live_status_reception_can_end (mig 227) is
//     on — which is the default. Off = only owner/admin/doctor end.
//   • `reopen` is ALWAYS forbidden for receptionists, toggle or not —
//     resurrecting a doctor's closed session is not delegated.
// They can always arrive/unarrive/start (the doctor calls reception
// to send the patient in). Owner/admin/doctor can do everything. All
// actions are org-scoped.
// ──────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  action: z.enum(["arrive", "unarrive", "start", "end", "reopen"]),
});

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  }
  const { action } = parsed.data;

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  // Load the appointment org-scoped (RLS also enforces, this is the
  // explicit check so we 404 instead of silently no-op).
  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, organization_id, arrived_at, consultation_started_at, consultation_ended_at",
    )
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!appt) {
    return NextResponse.json(
      { error: "Cita no encontrada" },
      { status: 404 },
    );
  }

  // Receptionist gates: `reopen` is always off-limits; `end` depends
  // on the org's toggle (mig 227, default ON).
  if (membership.role === "receptionist") {
    if (action === "reopen") {
      return NextResponse.json(
        { error: "Solo el doctor o un administrador puede reabrir la consulta" },
        { status: 403 },
      );
    }
    if (action === "end") {
      const receptionCanEnd = await readReceptionCanEndSetting(
        supabase,
        membership.organization_id,
      );
      if (!receptionCanEnd) {
        return NextResponse.json(
          { error: "Solo el doctor o un administrador puede finalizar la consulta" },
          { status: 403 },
        );
      }
    }
  }

  const nowIso = new Date().toISOString();

  switch (action) {
    case "arrive": {
      if (appt.arrived_at) {
        return NextResponse.json({ error: "Ya estaba marcada como llegada" }, { status: 409 });
      }
      const { error } = await supabase
        .from("appointments")
        .update({ arrived_at: nowIso })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, arrived_at: nowIso });
    }

    case "unarrive": {
      if (appt.consultation_started_at) {
        return NextResponse.json(
          { error: "No se puede deshacer: la consulta ya inició" },
          { status: 409 },
        );
      }
      const { error } = await supabase
        .from("appointments")
        .update({ arrived_at: null })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "start": {
      // The org's auto-close sub-toggle (mig 171, Settings → Agenda).
      // Absent row → default ON, the agreed behavior.
      const autoClose = await readAutoCloseSetting(
        supabase,
        membership.organization_id,
      );
      const { data: rpcData, error } = await supabase.rpc(
        "start_consultation",
        { p_appointment_id: id, p_auto_close: autoClose },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const result = rpcData as { ok: boolean; error?: string; auto_closed?: number };
      if (!result.ok) {
        const status =
          result.error === "appointment_not_found"
            ? 404
            : result.error === "forbidden"
              ? 403
              : 409;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ ok: true, auto_closed: result.auto_closed ?? 0 });
    }

    case "end": {
      if (!appt.consultation_started_at) {
        return NextResponse.json(
          { error: "La consulta no ha iniciado" },
          { status: 409 },
        );
      }
      if (appt.consultation_ended_at) {
        return NextResponse.json({ error: "Ya estaba finalizada" }, { status: 409 });
      }
      const { error } = await supabase
        .from("appointments")
        .update({
          consultation_ended_at: nowIso,
          consultation_closed_reason: "manual",
        })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, consultation_ended_at: nowIso });
    }

    case "reopen": {
      if (!appt.consultation_ended_at) {
        return NextResponse.json({ error: "La consulta no está cerrada" }, { status: 409 });
      }
      const { error } = await supabase
        .from("appointments")
        .update({
          consultation_ended_at: null,
          consultation_closed_reason: null,
        })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
  }
}

/**
 * Reads the org's "auto-close on next start" sub-toggle from
 * scheduler_settings (mig 171). Absent row → default ON, matching
 * the agreed default. Settings → Agenda writes this column.
 */
async function readAutoCloseSetting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("scheduler_settings")
    .select("live_status_auto_close")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const value = (data as { live_status_auto_close: boolean | null } | null)
    ?.live_status_auto_close;
  return value !== false;
}

/**
 * Reads the org's "reception can end consultations" toggle from
 * scheduler_settings (mig 227). Absent row/column → default ON,
 * matching the founder's decision. Settings → Agenda writes this
 * column. Same pattern as readAutoCloseSetting above.
 */
async function readReceptionCanEndSetting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("scheduler_settings")
    .select("live_status_reception_can_end")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const value = (
    data as { live_status_reception_can_end: boolean | null } | null
  )?.live_status_reception_can_end;
  return value !== false;
}
