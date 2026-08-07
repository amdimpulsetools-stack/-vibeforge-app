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
import { maybeCreateBudgetPendingFollowup } from "@/lib/followups/triggers";

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
    // mig 184 — origen polimórfico. Complementa (no reemplaza) el
    // back-link `budget_records.followup_id` de mig 136: ahora el
    // vínculo se puede navegar en las dos direcciones.
    source_type: "budget_record",
    source_id: budget.id,
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
  //
  // 2.11b — el scope vive ahora en SQL (mig 201): la función
  // budget_records_in_caller_scope() y los RPCs de counts/KPIs expresan
  // "sus citas" con un EXISTS resuelto vía auth.uid(). Desapareció el fetch
  // SIN LÍMITE de todos los appointments del doctor y la lista de UUIDs
  // interpolada en el `.or()` de 9 queries.
  const restrictToCallerScope =
    membership.role === "doctor" && !membership.is_fertility_advisor;

  // For "accepted" bucket we now return 3 sub-states (accepted/
  // in_progress/completed) so the UI can split the column. The
  // single-status filter is replaced by an `.in()` filter below.
  let acceptanceStatus: BudgetAcceptanceStatus | null = null;
  let acceptanceStatusIn: BudgetAcceptanceStatus[] | null = null;
  if (bucket === "pending") acceptanceStatus = "pending_acceptance";
  else if (bucket === "accepted")
    acceptanceStatusIn = ["accepted", "in_progress", "completed"];
  else if (bucket === "rejected") acceptanceStatus = "rejected";

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
    // Phase 5 prep / mig 142 — treatment lifecycle. The kanban
    // "Aceptados" column splits into Por iniciar / En curso /
    // Completados using these fields.
    "started_at, started_by_user_id, completed_at, " +
    "created_at, updated_at";
  const BUDGET_SELECT =
    // `email` feeds the send-channel modal (shows it next to the Email
    // button and disables the channel when missing).
    `${BUDGET_COLUMNS}, patient:patients(id, first_name, last_name, phone, email), followup:clinical_followups!followup_id(id, expected_by, status)`;

  // Fetch limit+1 so we can detect `has_more` without a separate
  // `count: "exact"` round-trip on the listing — the per-bucket counts
  // below already give us the totals for the badges.
  //
  // Fuente del listado: para el doctor restringido se consulta la función
  // budget_records_in_caller_scope() (SETOF budget_records, mig 201) en vez
  // de la tabla — PostgREST admite los mismos embeds/filtros/order/range
  // sobre funciones que devuelven SETOF de una tabla, y el scope queda como
  // EXISTS en SQL en lugar de una lista de UUIDs interpolada. En runtime
  // .select() tras .rpc() devuelve el mismo builder de filtros; el tipado de
  // supabase-js lo estrecha de más, de ahí el cast.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let query: any = restrictToCallerScope
    ? (supabase.rpc("budget_records_in_caller_scope") as any).select(BUDGET_SELECT)
    : supabase.from("budget_records").select(BUDGET_SELECT);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  query = query
    .eq("organization_id", membership.organization_id)
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit);

  if (acceptanceStatus) query = query.eq("acceptance_status", acceptanceStatus);
  if (acceptanceStatusIn)
    query = query.in("acceptance_status", acceptanceStatusIn);
  if (treatmentType) query = query.eq("treatment_type", treatmentType);
  if (doctorId) query = query.eq("sent_by_user_id", doctorId);
  if (patientFilter) query = query.eq("patient_id", patientFilter);
  if (from) query = query.gte("sent_at", from);
  if (to) query = query.lte("sent_at", to);

  // KPIs: 90-day window (agregación server-side, mig 201).
  const now = Date.now();
  const since30d = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const since90d = new Date(now - 90 * 24 * 3600 * 1000).toISOString();

  // Wave 2: listing + counts + KPI in a single Promise.all.
  //
  // 2.11a — los 7 counts head+exact y la query de KPIs que traía TODAS las
  // filas de 90 días para agregar en JS se reemplazan por dos RPCs con
  // COUNT(*)/AVG FILTER (get_budget_bucket_counts y get_budget_kpis,
  // mig 201): mismos filtros (treatment_type, doctor) y mismo scope, con el
  // índice idx_budget_records_org_status_sent (mig 136) por debajo. De 9
  // queries por request a 3.
  const [listingRes, countsRes, kpiRes] = await Promise.all([
    query,
    supabase.rpc("get_budget_bucket_counts", {
      p_org_id: membership.organization_id,
      p_treatment_type: treatmentType ?? null,
      p_sent_by: doctorId ?? null,
      p_restrict_to_caller: restrictToCallerScope,
    }),
    supabase.rpc("get_budget_kpis", {
      p_org_id: membership.organization_id,
      p_since_30d: since30d,
      p_since_90d: since90d,
      p_restrict_to_caller: restrictToCallerScope,
    }),
  ]);

  if (listingRes.error)
    return NextResponse.json({ error: listingRes.error.message }, { status: 500 });

  const fetched = (listingRes.data ?? []) as Record<string, unknown>[];
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
        const row = r as unknown as BudgetRecord;
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
    const row = r as unknown as BudgetRecord;
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

  // KPIs agregados en SQL (mismos números que la agregación JS anterior);
  // los porcentajes se siguen redondeando aquí con la misma fórmula.
  const kpiData = (kpiRes.data ?? null) as {
    total_sent_30d: number;
    accepted_30d: number;
    rejected_30d: number;
    avg_time_to_acceptance_days: number | null;
  } | null;
  const totalSent30d = kpiData?.total_sent_30d ?? 0;
  const accepted30d = kpiData?.accepted_30d ?? 0;
  const rejected30d = kpiData?.rejected_30d ?? 0;
  const decided30d = accepted30d + rejected30d;
  const acceptanceRatePct = decided30d > 0 ? Math.round((accepted30d / decided30d) * 100) : 0;
  const rejectionRatePct = decided30d > 0 ? Math.round((rejected30d / decided30d) * 100) : 0;
  const avgTimeToAcceptanceDays =
    kpiData?.avg_time_to_acceptance_days ?? null;

  const countsData = (countsRes.data ?? null) as {
    pending: number;
    accepted: number;
    rejected: number;
    pending_unsent: number;
    pending_sent: number;
    in_progress: number;
    completed: number;
  } | null;

  // `hasMore` was computed by fetching `limit + 1` rows from the listing.
  // The bucket counts give us the total per bucket without counting on the
  // listing itself, eliminating one Postgres `count(*)` round-trip.
  return NextResponse.json({
    items: enriched,
    has_more: hasMore,
    counts: {
      pending: countsData?.pending ?? 0,
      accepted: countsData?.accepted ?? 0,
      rejected: countsData?.rejected ?? 0,
      // Phase 3 — split of the "pending_acceptance" bucket into two
      // visual sub-groups in the kanban "Pendientes" column.
      pending_unsent: countsData?.pending_unsent ?? 0,
      pending_sent: countsData?.pending_sent ?? 0,
      // Phase 5 prep — split of the "Aceptados" tab into 3 sub-buckets.
      // `accepted` is the "Por iniciar" count (pre-start). `in_progress`
      // and `completed` mirror the new acceptance_status values.
      accepted_unstarted: countsData?.accepted ?? 0,
      in_progress: countsData?.in_progress ?? 0,
      completed: countsData?.completed ?? 0,
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
