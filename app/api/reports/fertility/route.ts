import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

// ──────────────────────────────────────────────────────────────────
// GET /api/reports/fertility?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Aggregator for the "Fertilidad" tab in /reports. One round-trip
// returns every block the tab renders — queries run in parallel and
// aggregate in SQL/JS server-side; the client never receives raw rows.
//
// Consultation identity comes from the SAME source the followup
// engine uses: `organization_service_canonical_mapping` rows whose
// category_key is fertility.first_consultation / second_consultation
// (mig 127/130). No service-name matching, no new seeding logic —
// orgs map their own services once in Admin → Addon Fertilidad →
// Mapeo canónico, and both followups and this report stay in sync.
// When the org hasn't mapped anything we return
// `consultations.mapped = false` so the tab renders a setup banner
// instead of zeros that would read as "the clinic had no activity".
//
// Two consultation views on purpose (they answer different questions):
//   • events:   1as y 2as COMPLETADAS dentro del rango (la 2ª de
//     junio cuenta en junio aunque la 1ª fuera de marzo).
//   • cohort:   de las 1as con ≥60 días de maduración (últimos 12
//     meses, independiente del rango), % que ya tuvo su 2ª. Dividir
//     "2as del mes / 1as del mes" mezclaría cohortes y mentiría.
// ──────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const FIRST_KEY = "fertility.first_consultation";
const SECOND_KEY = "fertility.second_consultation";
/** A first consultation younger than this hasn't had a fair chance
 * to convert yet — excluding it keeps the cohort rate honest. */
const COHORT_MATURITY_DAYS = 60;
const COHORT_WINDOW_MONTHS = 12;

interface MembershipRow {
  organization_id: string;
}

interface ApptLite {
  patient_id: string | null;
  appointment_date: string;
  service_id: string;
}

interface BudgetLite {
  id: string;
  amount: number | null;
  tier: "A" | "B" | "C" | null;
  acceptance_status: string;
  sent_at: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  assigned_asesora_member_id: string | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }

  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }
  const orgId = membership.organization_id;

  // Addon gate — same contract as the budgets endpoints.
  const { data: addonRows } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", orgId)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  if (!addonRows || addonRows.length === 0) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  // ── Canonical mapping: which services ARE 1ª / 2ª consulta ──────
  const { data: mappingRows } = await supabase
    .from("organization_service_canonical_mapping")
    .select("category_key, service_id")
    .eq("organization_id", orgId)
    .in("category_key", [FIRST_KEY, SECOND_KEY]);

  const firstServiceIds = (mappingRows ?? [])
    .filter((m) => m.category_key === FIRST_KEY)
    .map((m) => m.service_id as string);
  const secondServiceIds = (mappingRows ?? [])
    .filter((m) => m.category_key === SECOND_KEY)
    .map((m) => m.service_id as string);
  const mapped = firstServiceIds.length > 0 && secondServiceIds.length > 0;

  // ── Consultations block ──────────────────────────────────────────
  // One query over the cohort window covers both views (events filter
  // in JS over an already-org-scoped, service-filtered, completed-only
  // result — hundreds of rows, not thousands).
  const cohortStart = new Date();
  cohortStart.setMonth(cohortStart.getMonth() - COHORT_WINDOW_MONTHS);
  const cohortStartStr = cohortStart.toISOString().slice(0, 10);
  const windowStart = from < cohortStartStr ? from : cohortStartStr;

  let consultations: Record<string, unknown> = { mapped: false };
  if (mapped) {
    const allIds = [...firstServiceIds, ...secondServiceIds];
    const { data: appts } = await supabase
      .from("appointments")
      .select("patient_id, appointment_date, service_id")
      .eq("organization_id", orgId)
      .eq("status", "completed")
      .in("service_id", allIds)
      .gte("appointment_date", windowStart)
      .lte("appointment_date", to)
      .order("appointment_date");

    const rows = (appts as ApptLite[] | null) ?? [];
    const firstSet = new Set(firstServiceIds);

    // Earliest completed 1ª per patient (for cohort + pairing).
    const firstByPatient = new Map<string, string>();
    // Earliest completed 2ª per patient AFTER their first.
    const secondsByPatient = new Map<string, string[]>();
    for (const a of rows) {
      if (!a.patient_id) continue;
      if (firstSet.has(a.service_id)) {
        const prev = firstByPatient.get(a.patient_id);
        if (!prev || a.appointment_date < prev) {
          firstByPatient.set(a.patient_id, a.appointment_date);
        }
      } else {
        const list = secondsByPatient.get(a.patient_id) ?? [];
        list.push(a.appointment_date);
        secondsByPatient.set(a.patient_id, list);
      }
    }

    // Events view: counts within [from, to].
    const firstsInRange = rows.filter(
      (a) => firstSet.has(a.service_id) && a.appointment_date >= from && a.appointment_date <= to,
    ).length;
    const secondsInRangeRows = rows.filter(
      (a) => !firstSet.has(a.service_id) && a.appointment_date >= from && a.appointment_date <= to,
    );

    // Median days 1ª→2ª for the 2as that happened in range (the
    // user's retrospección: pairs attributed to the month of the 2ª).
    const dayDiffs: number[] = [];
    for (const s of secondsInRangeRows) {
      const first = s.patient_id ? firstByPatient.get(s.patient_id) : undefined;
      if (first && first <= s.appointment_date) {
        const diff = Math.round(
          (new Date(s.appointment_date).getTime() - new Date(first).getTime()) /
            (24 * 3600 * 1000),
        );
        dayDiffs.push(diff);
      }
    }

    // Cohort view: firsts in the 12-month window with ≥60d maturity →
    // % that have ANY later second.
    const maturityCutoff = new Date(Date.now() - COHORT_MATURITY_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    let cohortTotal = 0;
    let cohortConverted = 0;
    for (const [patientId, firstDate] of firstByPatient) {
      if (firstDate < cohortStartStr || firstDate > maturityCutoff) continue;
      cohortTotal++;
      const seconds = secondsByPatient.get(patientId) ?? [];
      if (seconds.some((d) => d >= firstDate)) cohortConverted++;
    }

    consultations = {
      mapped: true,
      firsts_in_range: firstsInRange,
      seconds_in_range: secondsInRangeRows.length,
      median_days_first_to_second: median(dayDiffs),
      pairs_measured: dayDiffs.length,
      cohort: {
        window_months: COHORT_WINDOW_MONTHS,
        maturity_days: COHORT_MATURITY_DAYS,
        total: cohortTotal,
        converted: cohortConverted,
        rate_pct: cohortTotal > 0 ? Math.round((cohortConverted / cohortTotal) * 100) : null,
      },
    };
  }

  // ── Budgets block ────────────────────────────────────────────────
  const { data: budgetRows } = await supabase
    .from("budget_records")
    .select(
      "id, amount, tier, acceptance_status, sent_at, assigned_at, accepted_at, rejected_at, assigned_asesora_member_id",
    )
    .eq("organization_id", orgId)
    .or(
      // Any budget whose lifecycle touched the range, plus the standing
      // unsent backlog (assigned but never sent — point-in-time metric).
      `and(sent_at.gte.${from},sent_at.lte.${to}T23:59:59),` +
        `and(accepted_at.gte.${from},accepted_at.lte.${to}T23:59:59),` +
        `and(rejected_at.gte.${from},rejected_at.lte.${to}T23:59:59),` +
        `sent_at.is.null`,
    );

  const budgets = (budgetRows as BudgetLite[] | null) ?? [];
  const inRange = (iso: string | null) =>
    !!iso && iso >= from && iso.slice(0, 10) <= to;

  const sent = budgets.filter((b) => inRange(b.sent_at));
  const accepted = budgets.filter((b) => inRange(b.accepted_at));
  const rejected = budgets.filter((b) => inRange(b.rejected_at));
  const unsentBacklog = budgets.filter(
    (b) => !b.sent_at && b.acceptance_status === "pending_acceptance",
  );

  // Per-asesora breakdown of sent budgets. Two-hop name resolution
  // (member → user → profile) via admin client; same pattern as the
  // budgets listing.
  const sentByAsesora = new Map<string, number>();
  for (const b of sent) {
    const key = b.assigned_asesora_member_id ?? "__none__";
    sentByAsesora.set(key, (sentByAsesora.get(key) ?? 0) + 1);
  }
  const memberIds = [...sentByAsesora.keys()].filter((k) => k !== "__none__");
  const nameByMember = new Map<string, string>();
  if (memberIds.length > 0) {
    const admin = createAdminClient();
    const { data: members } = await admin
      .from("organization_members")
      .select("id, user_id")
      .in("id", memberIds);
    const userIds = (members ?? []).map((m) => m.user_id as string).filter(Boolean);
    const { data: profiles } = userIds.length
      ? await admin.from("user_profiles").select("id, full_name").in("id", userIds)
      : { data: [] };
    const nameByUser = new Map(
      (profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "—"]),
    );
    for (const m of members ?? []) {
      nameByMember.set(m.id as string, nameByUser.get(m.user_id as string) ?? "—");
    }
  }
  const byAsesora = [...sentByAsesora.entries()]
    .map(([memberId, count]) => ({
      asesora: memberId === "__none__" ? "Sin asesora" : nameByMember.get(memberId) ?? "—",
      sent: count,
    }))
    .sort((a, b) => b.sent - a.sent);

  // Time-to-acceptance (days) for budgets accepted in range.
  const acceptDays = accepted
    .filter((b) => b.sent_at && b.accepted_at)
    .map((b) =>
      Math.max(
        0,
        Math.round(
          (new Date(b.accepted_at as string).getTime() -
            new Date(b.sent_at as string).getTime()) /
            (24 * 3600 * 1000),
        ),
      ),
    );

  const decided = accepted.length + rejected.length;
  const sum = (rows: BudgetLite[]) =>
    rows.reduce((acc, b) => acc + Number(b.amount ?? 0), 0);

  const tierCounts = { A: 0, B: 0, C: 0 } as Record<string, number>;
  const tierAccepted = { A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const b of sent) if (b.tier) tierCounts[b.tier]++;
  for (const b of accepted) if (b.tier) tierAccepted[b.tier]++;

  return NextResponse.json({
    range: { from, to },
    consultations,
    budgets: {
      sent: sent.length,
      by_asesora: byAsesora,
      unsent_backlog: unsentBacklog.length,
      accepted: accepted.length,
      rejected: rejected.length,
      acceptance_rate_pct: decided > 0 ? Math.round((accepted.length / decided) * 100) : null,
      median_days_to_accept: median(acceptDays),
      pipeline_amount: sum(
        budgets.filter((b) => b.acceptance_status === "pending_acceptance" && b.sent_at),
      ),
      accepted_amount: sum(accepted),
      by_tier: (["A", "B", "C"] as const).map((t) => ({
        tier: t,
        sent: tierCounts[t],
        accepted: tierAccepted[t],
      })),
    },
  });
}
