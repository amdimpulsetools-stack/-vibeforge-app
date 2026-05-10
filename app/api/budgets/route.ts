import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import {
  BUDGET_TREATMENT_TYPES,
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetAcceptanceStatus,
  type BudgetRecord,
  type BudgetTreatmentType,
} from "@/types/fertility";
import { maybeCreateBudgetPendingFollowup } from "@/lib/fertility/followup-triggers";

const treatmentTypeEnum = z.enum(BUDGET_TREATMENT_TYPES);

const createSchema = z.object({
  patient_id: z.string().uuid(),
  treatment_type: treatmentTypeEnum,
  amount: z
    .number()
    .nonnegative()
    .max(99_999_999.99)
    .nullable()
    .optional(),
  notes: z.string().max(500).nullable().optional(),
  treatment_plan_id: z.string().uuid().nullable().optional(),
});

interface MembershipRow {
  organization_id: string;
  role: "owner" | "admin" | "receptionist" | "doctor";
  is_fertility_advisor: boolean | null;
}

async function getMembership(
  userId: string,
): Promise<MembershipRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_fertility_advisor")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single();
  return (data as MembershipRow) ?? null;
}

async function isFertilityActive(organizationId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY])
    .limit(1);
  return !!(data && data.length > 0);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const membership = await getMembership(user.id);
  if (!membership)
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });

  // Recepcionistas no pueden crear; sólo owner/admin/doctor.
  if (membership.role === "receptionist") {
    return NextResponse.json(
      { error: "Sin permisos para registrar presupuestos" },
      { status: 403 },
    );
  }

  if (!(await isFertilityActive(membership.organization_id))) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const payload = parsed.data;

  // Defense in depth: confirm patient belongs to caller's org.
  const { data: patient } = await supabase
    .from("patients")
    .select("id, organization_id")
    .eq("id", payload.patient_id)
    .single();
  if (!patient || patient.organization_id !== membership.organization_id) {
    return NextResponse.json(
      { error: "Paciente no encontrado en tu organización" },
      { status: 404 },
    );
  }

  // Resolve doctor_id (if caller is a doctor) for the followup row.
  let doctorId: string | null = null;
  if (membership.role === "doctor") {
    const { data: doc } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    doctorId = doc?.id ?? null;
  }

  const insertPayload = {
    organization_id: membership.organization_id,
    patient_id: payload.patient_id,
    treatment_plan_id: payload.treatment_plan_id ?? null,
    sent_by_user_id: user.id,
    treatment_type: payload.treatment_type,
    amount: payload.amount ?? null,
    notes: payload.notes ?? null,
    acceptance_status: "pending_acceptance" as BudgetAcceptanceStatus,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("budget_records")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "No se pudo registrar el presupuesto" },
      { status: 500 },
    );
  }

  const budget = inserted as BudgetRecord;

  // Best-effort followup creation. Doesn't block the response.
  const followup = await maybeCreateBudgetPendingFollowup(supabase, {
    organization_id: membership.organization_id,
    patient_id: budget.patient_id,
    doctor_id: doctorId,
    budget_record_id: budget.id,
  });

  if (followup.created && followup.followup_id) {
    await supabase
      .from("budget_records")
      .update({ followup_id: followup.followup_id })
      .eq("id", budget.id);
    return NextResponse.json(
      { data: { ...budget, followup_id: followup.followup_id } },
      { status: 201 },
    );
  }

  return NextResponse.json({ data: budget }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });

  // Wave 1: resolve membership and the addon list in parallel. We can fetch
  // the user's addons via the same `user_id` join condition without
  // depending on the membership row, so both round-trips overlap. We
  // re-validate the result (fertility-active scoped to the user's org)
  // after both promises resolve.
  const [membershipRow, addonRows] = await Promise.all([
    supabase
      .from("organization_members")
      .select("organization_id, role, is_fertility_advisor")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("organization_addons")
      .select("organization_id, addon_key, enabled")
      .eq("enabled", true)
      .in("addon_key", [FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY]),
  ]);

  const membership = (membershipRow.data as MembershipRow | null) ?? null;
  if (!membership)
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });

  const fertilityActive = (addonRows.data ?? []).some(
    (r) => r.organization_id === membership.organization_id,
  );
  if (!fertilityActive) {
    return NextResponse.json(
      { error: "Esta función requiere el addon Pack Fertilidad" },
      { status: 403 },
    );
  }

  const sp = request.nextUrl.searchParams;
  const bucket = sp.get("bucket") as
    | "pending"
    | "accepted"
    | "rejected"
    | null;
  const treatmentType = sp.get("treatment_type");
  const doctorId = sp.get("doctor_id");
  const patientFilter = sp.get("patient_id");
  const from = sp.get("from");
  const to = sp.get("to");
  const q = sp.get("q");
  const offset = Math.max(0, Number(sp.get("offset") ?? 0));
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 20)));

  // Permission scope. Only doctors WITHOUT the fertility advisor flag are
  // restricted to records they personally sent OR linked to appointments
  // they are the assigned doctor on. Everyone else (owner, admin,
  // receptionist read-only, and fertility advisors) sees the whole org.
  let restrictToCallerScope = false;
  let callerDoctorId: string | null = null;
  if (membership.role === "doctor" && !membership.is_fertility_advisor) {
    restrictToCallerScope = true;
    const { data: doc } = await supabase
      .from("doctors")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", membership.organization_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    callerDoctorId = doc?.id ?? null;
  }

  let acceptanceStatus: BudgetAcceptanceStatus | null = null;
  if (bucket === "pending") acceptanceStatus = "pending_acceptance";
  else if (bucket === "accepted") acceptanceStatus = "accepted";
  else if (bucket === "rejected") acceptanceStatus = "rejected";

  // Build the patient ID set when caller is restricted: their assigned
  // appointments + records they personally sent. Cheaper than a giant
  // OR with a join in postgrest.
  let scopedPatientIds: string[] | null = null;
  if (restrictToCallerScope && callerDoctorId) {
    const { data: appts } = await supabase
      .from("appointments")
      .select("patient_id")
      .eq("organization_id", membership.organization_id)
      .eq("doctor_id", callerDoctorId);
    scopedPatientIds = Array.from(
      new Set((appts ?? []).map((a) => a.patient_id as string).filter(Boolean)),
    );
  }

  // Explicit column whitelist for the listing. The card and the patient
  // detail panel both consume `notes` and `rejection_reason`; everything in
  // BudgetRecord is rendered somewhere, so we keep the full list but
  // declare it explicitly to avoid future column bloat (e.g. blob fields)
  // shipping over the wire.
  const BUDGET_COLUMNS =
    "id, organization_id, patient_id, treatment_plan_id, sent_by_user_id, " +
    "sent_at, treatment_type, amount, notes, acceptance_status, " +
    "accepted_at, rejected_at, rejection_reason, followup_id, " +
    // Phase 3 / mig 140 — assignment fields. Needed so the kanban can
    // render the "Sin procesar" sub-bucket (sent_at IS NULL) and the
    // service/tier badge on each card.
    "service_id, tier, assigned_at, assigned_by_user_id, " +
    "created_at, updated_at";
  const BUDGET_SELECT =
    `${BUDGET_COLUMNS}, patient:patients(id, first_name, last_name, phone), followup:clinical_followups!followup_id(id, expected_by, status)`;

  // Fetch limit+1 so we can detect `has_more` without a separate
  // `count: "exact"` round-trip on the listing — the per-bucket counts
  // below already give us the totals for the badges.
  let query = supabase
    .from("budget_records")
    .select(BUDGET_SELECT)
    .eq("organization_id", membership.organization_id)
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit);

  if (acceptanceStatus) query = query.eq("acceptance_status", acceptanceStatus);
  if (treatmentType) query = query.eq("treatment_type", treatmentType);
  if (doctorId) query = query.eq("sent_by_user_id", doctorId);
  if (patientFilter) query = query.eq("patient_id", patientFilter);
  if (from) query = query.gte("sent_at", from);
  if (to) query = query.lte("sent_at", to);

  if (restrictToCallerScope) {
    if (scopedPatientIds && scopedPatientIds.length > 0) {
      query = query.or(
        `sent_by_user_id.eq.${user.id},patient_id.in.(${scopedPatientIds.join(",")})`,
      );
    } else {
      query = query.eq("sent_by_user_id", user.id);
    }
  }

  // Counts per bucket (org-wide, ignoring filters except scope+treatment_type+doctor).
  const baseCountQuery = (status: BudgetAcceptanceStatus) => {
    let q2 = supabase
      .from("budget_records")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id)
      .eq("acceptance_status", status);
    if (treatmentType) q2 = q2.eq("treatment_type", treatmentType);
    if (doctorId) q2 = q2.eq("sent_by_user_id", doctorId);
    if (restrictToCallerScope) {
      if (scopedPatientIds && scopedPatientIds.length > 0) {
        q2 = q2.or(
          `sent_by_user_id.eq.${user.id},patient_id.in.(${scopedPatientIds.join(",")})`,
        );
      } else {
        q2 = q2.eq("sent_by_user_id", user.id);
      }
    }
    return q2;
  };

  // Phase 3 — split the "pending_acceptance" bucket into:
  //   - pending_unsent: sent_at IS NULL (Sin procesar)
  //   - pending_sent:   sent_at IS NOT NULL (Esperando respuesta)
  // The kanban "Pendientes" column renders these as two sub-groups.
  const pendingUnsentCountQuery = () =>
    baseCountQuery("pending_acceptance").is("sent_at", null);
  const pendingSentCountQuery = () =>
    baseCountQuery("pending_acceptance").not("sent_at", "is", null);

  // KPIs query: 90-day window, lightweight projection.
  const now = Date.now();
  const since30d = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const since90d = new Date(now - 90 * 24 * 3600 * 1000).toISOString();

  const buildKpiQuery = () => {
    let qq = supabase
      .from("budget_records")
      .select("acceptance_status, sent_at, accepted_at")
      .eq("organization_id", membership.organization_id)
      .gte("sent_at", since90d);
    if (restrictToCallerScope) {
      if (scopedPatientIds && scopedPatientIds.length > 0) {
        qq = qq.or(
          `sent_by_user_id.eq.${user.id},patient_id.in.(${scopedPatientIds.join(",")})`,
        );
      } else {
        qq = qq.eq("sent_by_user_id", user.id);
      }
    }
    return qq;
  };

  // Wave 2: listing + 3 counts + KPI in a single Promise.all. None of these
  // queries depend on each other; they all share the same org/role/scope
  // filters. The senders lookup must be sequential (Wave 3) because it
  // needs the unique `sent_by_user_id` values from the listing rows.
  const [
    listingRes,
    pendCount,
    accCount,
    rejCount,
    pendUnsentCount,
    pendSentCount,
    kpiRes,
  ] = await Promise.all([
    query,
    baseCountQuery("pending_acceptance"),
    baseCountQuery("accepted"),
    baseCountQuery("rejected"),
    pendingUnsentCountQuery(),
    pendingSentCountQuery(),
    buildKpiQuery(),
  ]);

  if (listingRes.error)
    return NextResponse.json({ error: listingRes.error.message }, { status: 500 });

  const fetched = listingRes.data ?? [];
  const hasMore = fetched.length > limit;
  let items = hasMore ? fetched.slice(0, limit) : fetched;

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    items = items.filter((r) => {
      const raw = (r as unknown as {
        patient?:
          | { first_name: string | null; last_name: string | null }
          | { first_name: string | null; last_name: string | null }[]
          | null;
      }).patient;
      const p = Array.isArray(raw) ? raw[0] : raw;
      const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.toLowerCase();
      return name.includes(needle);
    });
  }

  // Wave 3: resolve "sent_by" + "assigned_by" display names via admin
  // client (bypass RLS on profiles). One round-trip for both id sets.
  // For "Sin procesar" cards (sent_at IS NULL) the meaningful person is
  // the doctor who assigned, not the empty sender — that's why we
  // enrich both.
  const personIds = Array.from(
    new Set(
      items.flatMap((r) => {
        const row = r as BudgetRecord;
        return [row.sent_by_user_id, row.assigned_by_user_id].filter(Boolean) as string[];
      }),
    ),
  );
  const profileMap = new Map<string, { id: string; full_name: string | null }>();
  if (personIds.length > 0) {
    const adminClient = createAdminClient();
    const { data: profiles } = await adminClient
      .from("user_profiles")
      .select("id, full_name")
      .in("id", personIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, { id: p.id, full_name: p.full_name });
    }
  }

  const enriched = items.map((r) => {
    const row = r as BudgetRecord;
    return {
      ...r,
      sent_by: row.sent_by_user_id
        ? profileMap.get(row.sent_by_user_id) ?? { id: row.sent_by_user_id, full_name: null }
        : null,
      assigned_by: row.assigned_by_user_id
        ? profileMap.get(row.assigned_by_user_id) ?? { id: row.assigned_by_user_id, full_name: null }
        : null,
    };
  });

  const kpiAll = kpiRes.data ?? [];
  const kpiSent30d = kpiAll.filter((r) => r.sent_at >= since30d);
  const totalSent30d = kpiSent30d.length;
  const accepted30d = kpiSent30d.filter((r) => r.acceptance_status === "accepted").length;
  const rejected30d = kpiSent30d.filter((r) => r.acceptance_status === "rejected").length;
  const decided30d = accepted30d + rejected30d;
  const acceptanceRatePct = decided30d > 0 ? Math.round((accepted30d / decided30d) * 100) : 0;
  const rejectionRatePct = decided30d > 0 ? Math.round((rejected30d / decided30d) * 100) : 0;

  const acceptedRows = kpiAll.filter(
    (r) => r.acceptance_status === "accepted" && r.accepted_at,
  );
  let avgTimeToAcceptanceDays: number | null = null;
  if (acceptedRows.length > 0) {
    const sumMs = acceptedRows.reduce((acc, r) => {
      const dt =
        new Date(r.accepted_at as string).getTime() -
        new Date(r.sent_at).getTime();
      return acc + Math.max(0, dt);
    }, 0);
    avgTimeToAcceptanceDays = Math.round(
      (sumMs / acceptedRows.length / (24 * 3600 * 1000)) * 10,
    ) / 10;
  }

  // `hasMore` was computed by fetching `limit + 1` rows from the listing.
  // The bucket counts give us the total per bucket without counting on the
  // listing itself, eliminating one Postgres `count(*)` round-trip.
  return NextResponse.json({
    items: enriched,
    has_more: hasMore,
    counts: {
      pending: pendCount.count ?? 0,
      accepted: accCount.count ?? 0,
      rejected: rejCount.count ?? 0,
      // Phase 3 — split of the "pending_acceptance" bucket into two
      // visual sub-groups in the kanban "Pendientes" column.
      pending_unsent: pendUnsentCount.count ?? 0,
      pending_sent: pendSentCount.count ?? 0,
    },
    kpis: {
      total_sent_30d: totalSent30d,
      acceptance_rate_pct: acceptanceRatePct,
      rejection_rate_pct: rejectionRatePct,
      avg_time_to_acceptance_days: avgTimeToAcceptanceDays,
    },
  });
}

// Helper exposed for the treatment_type enum tracking.
export type _BudgetTreatmentType = BudgetTreatmentType;
