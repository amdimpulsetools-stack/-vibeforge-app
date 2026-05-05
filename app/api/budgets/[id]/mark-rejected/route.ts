import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetRecord,
} from "@/types/fertility";
import type { ContactEvent } from "@/types/fertility";

const schema = z.object({
  rejection_reason: z.string().max(500).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership)
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });

  const { data: addons } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", membership.organization_id)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addons || addons.length === 0) {
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
  if (existErr || !existing)
    return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });

  const budget = existing as BudgetRecord;
  if (budget.acceptance_status !== "pending_acceptance") {
    return NextResponse.json(
      { error: "Este presupuesto ya tiene una decisión registrada" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("budget_records")
    .update({
      acceptance_status: "rejected",
      rejected_at: now,
      rejection_reason: parsed.data.rejection_reason ?? null,
    })
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .select("*")
    .single();

  if (updErr || !updated)
    return NextResponse.json(
      { error: updErr?.message ?? "No se pudo actualizar" },
      { status: 500 },
    );

  if (budget.followup_id) {
    const { data: fu } = await supabase
      .from("clinical_followups")
      .select("contact_events")
      .eq("id", budget.followup_id)
      .single();

    const events: ContactEvent[] = Array.isArray(fu?.contact_events)
      ? (fu?.contact_events as unknown as ContactEvent[])
      : [];
    const closeEvent: ContactEvent = {
      type: "manual_close",
      at: now,
      by_user_id: user.id,
      delivery_status: "unknown",
      reason: parsed.data.rejection_reason
        ? `Presupuesto rechazado: ${parsed.data.rejection_reason}`
        : "Presupuesto rechazado",
    };

    await supabase
      .from("clinical_followups")
      .update({
        status: "cerrado_manual",
        closure_reason: "cerrado_manual",
        closed_at: now,
        is_resolved: true,
        resolved_at: now,
        resolved_by: user.id,
        contact_events: [...events, closeEvent],
        notes: parsed.data.rejection_reason ?? "Presupuesto rechazado",
      })
      .eq("id", budget.followup_id);
  }

  return NextResponse.json({ data: updated });
}
