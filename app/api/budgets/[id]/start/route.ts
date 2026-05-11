import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetRecord,
  type ContactEvent,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/[id]/start
//
// Phase 5 prep — transitions an accepted budget to `in_progress` and
// stamps `started_at` / `started_by_user_id`. Closes the auto-followup
// `fertility.budget_accepted_pending_start` (created by the daily cron)
// honoring attribution: closure_reason `agendado_via_contacto` if there
// was prior contact (Categoría A) else `agendado_organico_dentro_ventana`
// (Categoría B).
//
// Allowed roles: owner | admin | doctor | fertility advisor.
// (Receptionist blocked — clinical-impact decision.)
// ──────────────────────────────────────────────────────────────────

const bodySchema = z
  .object({
    notes: z.string().max(500).optional(),
  })
  .optional();

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  is_fertility_advisor: boolean | null;
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

  // Body is optional; only `notes` is supported and currently
  // discarded (kept for forward-compat). We still validate so a
  // malformed payload returns a clean 400.
  let parsedNotes: string | undefined;
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      const parsed = bodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
      }
      parsedNotes = parsed.data?.notes;
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  // notes currently isn't persisted — we accept it for forward-compat.
  void parsedNotes;

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_fertility_advisor")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const role = membership.role;
  const isAdvisor = Boolean(membership.is_fertility_advisor);
  const allowed =
    role === "owner" || role === "admin" || role === "doctor" || isAdvisor;
  if (!allowed) {
    return NextResponse.json(
      { error: "Sin permisos para marcar inicio de tratamiento" },
      { status: 403 },
    );
  }

  // Addon gate.
  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const { data: existing, error: existErr } = await supabase
    .from("budget_records")
    .select("*")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .single();
  if (existErr || !existing) {
    return NextResponse.json(
      { error: "Presupuesto no encontrado" },
      { status: 404 },
    );
  }

  const budget = existing as BudgetRecord;
  if (budget.acceptance_status !== "accepted") {
    return NextResponse.json(
      {
        error:
          "Solo presupuestos aceptados pueden marcarse como en curso",
      },
      { status: 409 },
    );
  }
  if (budget.started_at) {
    return NextResponse.json(
      { error: "Este presupuesto ya está marcado como iniciado" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("budget_records")
    .update({
      acceptance_status: "in_progress",
      started_at: now,
      started_by_user_id: user.id,
    })
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "No se pudo actualizar" },
      { status: 500 },
    );
  }

  // Close any open followup with rule_key
  // 'fertility.budget_accepted_pending_start' linked to this budget.
  // The link is in `contact_events[].budget_record_id` (the cron
  // stores it there because there's no dedicated FK column for
  // budget→followup beyond the optional `followup_id` already used
  // for the budget_pending_acceptance phase).
  const { data: openFollowups } = await supabase
    .from("clinical_followups")
    .select("id, contact_events, first_contact_at")
    .eq("organization_id", membership.organization_id)
    .eq("patient_id", budget.patient_id)
    .eq("rule_key", "fertility.budget_accepted_pending_start")
    .is("closed_at", null);

  for (const fu of openFollowups ?? []) {
    const events: ContactEvent[] = Array.isArray(fu.contact_events)
      ? (fu.contact_events as unknown as ContactEvent[])
      : [];
    const linksThisBudget = events.some(
      (e) => e.budget_record_id === budget.id,
    );
    if (!linksThisBudget) continue;

    const hadContact = Boolean(fu.first_contact_at);
    const closureStatus = hadContact
      ? "agendado_via_contacto"
      : "agendado_organico_dentro_ventana";

    const startedEvent: ContactEvent = {
      type: "treatment_started",
      at: now,
      by_user_id: user.id,
      delivery_status: "unknown",
      budget_record_id: budget.id,
      reason: hadContact
        ? "Inicio de tratamiento (con contacto previo)"
        : "Inicio de tratamiento (orgánico, sin contacto previo)",
    };

    await supabase
      .from("clinical_followups")
      .update({
        status: closureStatus,
        closure_reason: closureStatus,
        closed_at: now,
        is_resolved: true,
        resolved_at: now,
        resolved_by: user.id,
        contact_events: [...events, startedEvent],
      })
      .eq("id", fu.id)
      .eq("organization_id", membership.organization_id);
  }

  return NextResponse.json({ data: updated });
}
