import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { generateBudgetPdf } from "@/lib/budget-pdf/generate";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

export const runtime = "nodejs"; // generateBudgetPdf needs @react-pdf.

// ──────────────────────────────────────────────────────────────────
// POST /api/budgets/[id]/send
//
// Marks a budget as sent: fills `sent_at = NOW()` and
// `sent_by_user_id = auth.uid()` (the obstetra "of turn" who clicked
// Enviar). The budget transitions from the "Sin procesar" sub-bucket
// to "Esperando respuesta" within the Pendientes column.
//
// Phase 4 — also lazily generates the PDF inline (sharing the
// renderer with /api/budgets/[id]/pdf via lib/budget-pdf/generate)
// and returns the signed URL in the response so the obstetra can
// download it without a second round-trip.
//
// Constraints:
//   - Caller role: owner | admin | doctor | fertility advisor.
//     Receptionists are blocked.
//   - The budget must still be `acceptance_status = pending_acceptance`
//     AND `sent_at IS NULL`.
//   - The budget must belong to the caller's org (RLS enforces this;
//     we double-check explicitly so we can return a clean 404).
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

  const role = membership.role;
  const isAdvisor = Boolean(membership.is_fertility_advisor);
  const allowed =
    role === "owner" || role === "admin" || role === "doctor" || isAdvisor;
  if (!allowed) {
    return NextResponse.json(
      { error: "Sin permisos para enviar presupuestos" },
      { status: 403 },
    );
  }

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

  const { data: existing } = await supabase
    .from("budget_records")
    .select("id, organization_id, acceptance_status, sent_at")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .limit(1)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json(
      { error: "Presupuesto no encontrado" },
      { status: 404 },
    );
  }
  if (existing.acceptance_status !== "pending_acceptance") {
    return NextResponse.json(
      { error: "Este presupuesto ya tiene una decisión registrada" },
      { status: 409 },
    );
  }
  if (existing.sent_at !== null && existing.sent_at !== undefined) {
    return NextResponse.json(
      { error: "Este presupuesto ya fue enviado" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("budget_records")
    .update({
      sent_at: now,
      sent_by_user_id: user.id,
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

  // Phase 4 — generate (or reuse) the PDF and surface the signed URL
  // in the response. Failures here are non-fatal: the budget IS sent
  // (DB row updated above), so we still return success — the client
  // can retry via POST /api/budgets/[id]/pdf.
  let signedUrl: string | null = null;
  let pdfError: string | null = null;
  try {
    const admin = createAdminClient();
    const pdfResult = await generateBudgetPdf(supabase, admin, id);
    if (pdfResult.ok) {
      signedUrl = pdfResult.result.signedUrl;
    } else {
      pdfError = pdfResult.error;
    }
  } catch (e) {
    pdfError = e instanceof Error ? e.message : "PDF render failed";
  }

  return NextResponse.json({
    data: updated,
    pdf_signed_url: signedUrl,
    pdf_error: pdfError,
  });
}
