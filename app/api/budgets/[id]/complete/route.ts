import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetRecord,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/[id]/complete
//
// Phase 5 prep — transitions an in_progress budget to `completed` and
// stamps `completed_at`. More restrictive than /start: only owner and
// admin can complete a budget because completion is a financial-
// impact decision (it's the signal accountants use to recognize the
// revenue against the package amount).
// ──────────────────────────────────────────────────────────────────

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  is_fertility_advisor: boolean | null;
}

export async function POST(
  _request: NextRequest,
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

  // admin/owner only — completion is a financial-impact decision.
  // Doctors and advisors are explicitly excluded here even though
  // they can /start a budget.
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "Solo administradores u owners pueden marcar un tratamiento como completado",
      },
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
  if (budget.acceptance_status !== "in_progress") {
    return NextResponse.json(
      {
        error:
          "Solo presupuestos en curso pueden marcarse como completados",
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("budget_records")
    .update({
      acceptance_status: "completed",
      completed_at: now,
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

  return NextResponse.json({ data: updated });
}
