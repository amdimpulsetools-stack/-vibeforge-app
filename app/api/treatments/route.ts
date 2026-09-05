import { NextRequest, NextResponse } from "next/server";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import { normalizeSearchText } from "@/lib/utils";
import { resolveOrgTimezone, zonedNow } from "@/lib/org-time";
import { treatmentMoney } from "@/lib/treatments/money";
import { FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY } from "@/types/fertility";
import type {
  Treatment,
  TreatmentListItem,
  TreatmentsOverview,
} from "@/types/treatments";

/**
 * GET /api/treatments?org_id=&status=in_progress|closed|all&q=&from=&to=
 *
 * Lista de tratamientos (módulo Tratamientos, addon fertilidad) + KPIs del
 * período vía RPC `get_treatments_overview` (mig 245).
 *
 *  · `org_id` es OBLIGATORIO: el cliente manda su org activa y aquí se exige
 *    membresía activa en ella (usuario multi-org, ver lib/followups/org-scope).
 *  · `status` default `in_progress`. `closed` = completed|abandoned|cancelled.
 *  · `q` filtra por nombre de paciente (client-side, sin diacríticos).
 *  · `from`/`to` (yyyy-MM-dd) acotan SOLO los KPIs; default = mes actual en
 *    la zona horaria de la org. La lista no se filtra por fecha.
 *  · Un doctor solo ve SUS tratamientos (doctors.user_id = auth user); sin
 *    ficha de doctor la lista y los KPIs salen vacíos — mismo criterio que
 *    el RPC.
 *
 * Respuesta: `{ items: TreatmentListItem[], kpis: TreatmentsOverview | null,
 * period: { from, to } }`. El dinero de cada ítem sale de la fórmula única
 * `treatmentMoney` (lib/treatments/money.ts): nunca se recalcula aquí.
 */

type StatusFilter = "in_progress" | "closed" | "all";

interface MembershipRow {
  role: string;
  is_fertility_advisor: boolean | null;
}

interface TreatmentRow extends Treatment {
  patients: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  doctors: { full_name: string | null } | null;
  patient_payments: Array<{
    id: string;
    amount: number | string;
    source: string | null;
    revenue_bucket: string | null;
    payment_date: string;
  }> | null;
  treatment_external_payments: Array<{ amount: number | string }> | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY_OVERVIEW = (seesFees: boolean): TreatmentsOverview => ({
  collected_total: 0,
  honorarium_collected: seesFees ? 0 : null,
  third_party_collected: seesFees ? 0 : null,
  pending_in_progress: 0,
  in_progress_count: 0,
  started_in_period: 0,
  closed_in_period: 0,
  sees_fees: seesFees,
  doctor_scope_id: null,
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  const orgId = sp.get("org_id");
  if (!orgId) {
    return NextResponse.json({ error: "Falta org_id" }, { status: 400 });
  }

  const rawStatus = sp.get("status") ?? "in_progress";
  if (!["in_progress", "closed", "all"].includes(rawStatus)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  const status = rawStatus as StatusFilter;

  const denied = await assertActiveMembership(supabase, user.id, orgId);
  if (denied) return denied;

  const [{ data: membershipRow }, { data: addonRows }, { data: orgRow }] =
    await Promise.all([
      supabase
        .from("organization_members")
        .select("role, is_fertility_advisor")
        .eq("user_id", user.id)
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("organization_addons")
        .select("addon_key")
        .eq("organization_id", orgId)
        .eq("enabled", true)
        .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
        .limit(1),
      // Tolerante: si la columna no existe aún, cae a America/Lima.
      supabase.from("organizations").select("timezone").eq("id", orgId).maybeSingle(),
    ]);

  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "No perteneces a esta organización" }, { status: 403 });
  }
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  // Período de los KPIs: mes actual en el reloj de la org (mig 240).
  const tz = resolveOrgTimezone((orgRow as { timezone?: string | null } | null)?.timezone);
  const nowZoned = zonedNow(tz);
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : format(startOfMonth(nowZoned), "yyyy-MM-dd");
  const to = toParam && DATE_RE.test(toParam) ? toParam : format(endOfMonth(nowZoned), "yyyy-MM-dd");

  // Un doctor (que no es owner/admin) solo ve sus tratamientos.
  const role = membership.role;
  const seesFees = role === "owner" || role === "admin" || role === "doctor";
  let doctorScopeId: string | null = null;
  if (role === "doctor") {
    const { data: doctorRow } = await supabase
      .from("doctors")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    doctorScopeId = (doctorRow as { id: string } | null)?.id ?? null;
    if (!doctorScopeId) {
      // Sin ficha de doctor no hay nada que mostrar (el RPC aplica el mismo
      // criterio y devolvería ceros): se ahorra la llamada.
      return NextResponse.json({
        items: [] as TreatmentListItem[],
        kpis: EMPTY_OVERVIEW(seesFees),
        period: { from, to },
      });
    }
  }

  let query = supabase
    .from("treatments")
    .select(
      "*, patients(first_name, last_name, phone), doctors(full_name), " +
        "patient_payments(id, amount, source, revenue_bucket, payment_date), " +
        "treatment_external_payments(amount)",
    )
    .eq("organization_id", orgId)
    .order("started_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (status === "in_progress") query = query.eq("status", "in_progress");
  else if (status === "closed") query = query.neq("status", "in_progress");
  if (doctorScopeId) query = query.eq("doctor_id", doctorScopeId);

  const [{ data: rows, error: listErr }, { data: kpisData, error: kpisErr }] =
    await Promise.all([
      query,
      supabase.rpc("get_treatments_overview", {
        p_org_id: orgId,
        p_from: from,
        p_to: to,
      }),
    ]);

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const q = normalizeSearchText((sp.get("q") ?? "").trim());

  const items: TreatmentListItem[] = ((rows ?? []) as unknown as TreatmentRow[])
    .map((row) => {
      const { patients, doctors, patient_payments, treatment_external_payments, ...treatment } = row;
      const patientName = [patients?.first_name, patients?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const payments = patient_payments ?? [];
      // Última fecha de cobro CLÍNICO (misma regla que la fórmula).
      const lastPaymentAt = payments
        .filter((p) => (p.source ?? "clinical") === "clinical")
        .reduce<string | null>(
          (max, p) => (max === null || p.payment_date > max ? p.payment_date : max),
          null,
        );
      return {
        ...(treatment as Treatment),
        patient_name: patientName,
        patient_phone: patients?.phone ?? null,
        doctor_name: doctors?.full_name ?? null,
        money: treatmentMoney(treatment.expected_total, payments, treatment_external_payments),
        last_payment_at: lastPaymentAt,
      };
    })
    .filter((item) => (q ? normalizeSearchText(item.patient_name).includes(q) : true))
    .sort((a, b) => {
      // En curso primero; dentro de cada grupo, started_at desc (ya viene
      // así de la base, el sort solo agrupa).
      const ao = a.status === "in_progress" ? 0 : 1;
      const bo = b.status === "in_progress" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.started_at.localeCompare(a.started_at);
    });

  // Los KPIs no bloquean la lista: si el RPC falla (p.ej. mig 245 aún no
  // aplicada) devolvemos `kpis: null` y el cliente oculta las cards.
  const kpis: TreatmentsOverview | null = kpisErr
    ? null
    : ((kpisData as unknown as TreatmentsOverview | null) ?? null);

  return NextResponse.json({ items, kpis, period: { from, to } });
}
