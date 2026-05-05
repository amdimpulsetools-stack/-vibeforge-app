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

  const membership = await getMembership(user.id);
  if (!membership)
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });

  if (!(await isFertilityActive(membership.organization_id))) {
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

  let query = supabase
    .from("budget_records")
    .select(
      "*, patient:patients(id, first_name, last_name, phone), followup:clinical_followups!followup_id(id, expected_by, status)",
      { count: "exact" },
    )
    .eq("organization_id", membership.organization_id)
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);

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

  const { data, error, count } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  let items = data ?? [];

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    items = items.filter((r) => {
      const p = (r as { patient?: { first_name: string | null; last_name: string | null } | null }).patient;
      const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.toLowerCase();
      return name.includes(needle);
    });
  }

  // Resolve "sent_by" display name via admin client (bypass RLS on profiles).
  const senderIds = Array.from(
    new Set(items.map((r) => (r as BudgetRecord).sent_by_user_id).filter(Boolean) as string[]),
  );
  const adminClient = createAdminClient();
  const senderMap = new Map<string, { id: string; full_name: string | null }>();
  if (senderIds.length > 0) {
    const { data: profiles } = await adminClient
      .from("user_profiles")
      .select("id, full_name")
      .in("id", senderIds);
    for (const p of profiles ?? []) {
      senderMap.set(p.id, { id: p.id, full_name: p.full_name });
    }
  }

  const enriched = items.map((r) => {
    const row = r as BudgetRecord;
    return {
      ...r,
      sent_by: row.sent_by_user_id
        ? senderMap.get(row.sent_by_user_id) ?? { id: row.sent_by_user_id, full_name: null }
        : null,
    };
  });

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

  const [pendCount, accCount, rejCount] = await Promise.all([
    baseCountQuery("pending_acceptance"),
    baseCountQuery("accepted"),
    baseCountQuery("rejected"),
  ]);

  // KPIs
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

  const { data: kpiRows } = await buildKpiQuery();
  const kpiAll = kpiRows ?? [];
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

  const totalForBucket = count ?? enriched.length;
  const hasMore = offset + enriched.length < totalForBucket;

  return NextResponse.json({
    items: enriched,
    has_more: hasMore,
    counts: {
      pending: pendCount.count ?? 0,
      accepted: accCount.count ?? 0,
      rejected: rejCount.count ?? 0,
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
