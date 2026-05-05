import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

/**
 * GET /api/clinical-followups/dashboard
 *
 * Dual-mode endpoint:
 *
 *  1. Legacy mode (no `bucket` query param): conserva el shape original
 *     `{ data: { overdue, this_week, upcoming }, counts }` que consumen
 *     vistas previas del módulo de seguimientos.
 *
 *  2. Bucket mode (`?bucket=pending|recovered|no_response|counts`):
 *     usado por el panel de Seguimientos Automatizados del addon
 *     fertility. Soporta paginación (`offset`, `limit`), filtros y
 *     devuelve `{ items, has_more, counts, kpis? }`.
 */
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
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const bucket = sp.get("bucket");

  if (!bucket) {
    return legacyResponse(supabase, sp);
  }

  const validBuckets = new Set([
    "pending",
    "recovered",
    "no_response",
    "counts",
  ]);
  if (!validBuckets.has(bucket)) {
    return NextResponse.json(
      { error: "Bucket inválido" },
      { status: 400 }
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }
  const orgId = membership.organization_id;

  const offset = parsePositiveInt(sp.get("offset"), 0);
  const rawLimit = parsePositiveInt(sp.get("limit"), 20);
  const limit = Math.min(Math.max(rawLimit, 1), 100);

  const filters: BucketFilters = {
    doctor_id: sp.get("doctor_id"),
    origin: sp.getAll("origin"),
    rule_key: sp.get("rule_key"),
    date_from: sp.get("date_from"),
    date_to: sp.get("date_to"),
  };

  const counts = await loadBucketCounts(supabase, orgId, filters);

  if (bucket === "counts") {
    const res = NextResponse.json({ counts });
    res.headers.set("Cache-Control", "private, max-age=60");
    return res;
  }

  const items = await loadBucketItems(
    supabase,
    orgId,
    bucket as "pending" | "recovered" | "no_response",
    filters,
    offset,
    limit
  );

  const hasMore = items.length > limit;
  const trimmed = hasMore ? items.slice(0, limit) : items;

  const responseBody: {
    items: unknown[];
    has_more: boolean;
    counts: BucketCounts;
    kpis?: RecoveredKpis;
  } = {
    items: trimmed,
    has_more: hasMore,
    counts,
  };

  if (bucket === "recovered") {
    responseBody.kpis = await loadRecoveredKpis(supabase, orgId, counts);
  }

  const res = NextResponse.json(responseBody);
  res.headers.set("Cache-Control", "private, max-age=60");
  return res;
}

// ─────────────────────────────────────────────────────────────────────
// Legacy shape (no bucket param) — kept verbatim from the original
// implementation so existing consumers do not break.
// ─────────────────────────────────────────────────────────────────────

async function legacyResponse(
  supabase: SupaClient,
  sp: URLSearchParams
): Promise<NextResponse> {
  const doctorId = sp.get("doctor_id");
  const priorityFilter = sp.get("priority");

  let query = supabase
    .from("clinical_followups")
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .eq("is_resolved", false)
    .not("follow_up_date", "is", null)
    .order("follow_up_date", { ascending: true });

  if (doctorId) query = query.eq("doctor_id", doctorId);
  if (priorityFilter) query = query.eq("priority", priorityFilter);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = (data ?? [])
    .filter((item) => {
      if (item.last_contacted_at) {
        const contactedAt = new Date(item.last_contacted_at);
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        if (contactedAt > threeDaysAgo) return false;
      }
      return true;
    })
    .map((item) => {
      const followUpDate = new Date(item.follow_up_date + "T00:00:00");
      const diffTime = followUpDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let urgency: "overdue" | "this_week" | "upcoming";
      if (daysDiff < 0) urgency = "overdue";
      else if (daysDiff <= 7) urgency = "this_week";
      else urgency = "upcoming";

      return { ...item, urgency, days_diff: daysDiff };
    })
    .filter((item) => item.days_diff <= 365);

  const overdue = items.filter((i) => i.urgency === "overdue");
  const thisWeek = items.filter((i) => i.urgency === "this_week");
  const upcoming = items.filter((i) => i.urgency === "upcoming");

  return NextResponse.json({
    data: { overdue, this_week: thisWeek, upcoming },
    counts: {
      overdue: overdue.length,
      this_week: thisWeek.length,
      upcoming: upcoming.length,
      total: items.length,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Bucket-mode helpers
// ─────────────────────────────────────────────────────────────────────

interface BucketFilters {
  doctor_id: string | null;
  origin: string[];
  rule_key: string | null;
  date_from: string | null;
  date_to: string | null;
}

interface BucketCounts {
  pending: number;
  recovered: number;
  no_response: number;
}

interface RecoveredKpis {
  recovered_attributable: number;
  organic_initiative: number;
  recovery_rate_pct: number;
  revenue_attributed: number;
}

const PENDING_STATUSES = ["pendiente", "contactado", "pospuesto"];
const RECOVERED_STATUSES = [
  "agendado_via_contacto",
  "agendado_organico_dentro_ventana",
];
const NO_RESPONSE_STATUSES = [
  "desistido_silencioso",
  "vencido",
  "cerrado_manual",
];

const RECOVERED_LOOKBACK_DAYS = 30;
const NO_RESPONSE_LOOKBACK_DAYS = 60;

const SELECT_WITH_DETAILS =
  "*, doctors(full_name), patients(first_name, last_name, phone)";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

// PostgrestFilterBuilder generics are very specific and don't compose well
// across helpers. We type queries as `any` internally and rely on response
// shape narrowing at the call sites.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

function applyCommonFilters(
  query: AnyQuery,
  filters: BucketFilters
): AnyQuery {
  let q = query;
  if (filters.doctor_id && filters.doctor_id !== "all") {
    q = q.eq("doctor_id", filters.doctor_id);
  }
  if (filters.origin.length > 0 && filters.origin.length < 3) {
    q = q.in("source", filters.origin);
  }
  if (filters.rule_key && filters.rule_key !== "all") {
    q = q.eq("rule_key", filters.rule_key);
  }
  if (filters.date_from) {
    q = q.gte("expected_by", `${filters.date_from}T00:00:00.000Z`);
  }
  if (filters.date_to) {
    q = q.lte("expected_by", `${filters.date_to}T23:59:59.999Z`);
  }
  return q;
}

function buildPendingQuery(
  supabase: SupaClient,
  orgId: string,
  filters: BucketFilters,
  selectClause: string,
  countOnly = false
): AnyQuery {
  const nowIso = new Date().toISOString();
  const q = supabase
    .from("clinical_followups")
    .select(selectClause, countOnly ? { count: "exact", head: true } : undefined)
    .eq("organization_id", orgId)
    .in("status", PENDING_STATUSES)
    .or(`snooze_until.is.null,snooze_until.lte.${nowIso}`);
  return applyCommonFilters(q, filters);
}

function buildRecoveredQuery(
  supabase: SupaClient,
  orgId: string,
  filters: BucketFilters,
  selectClause: string,
  countOnly = false
): AnyQuery {
  const since = lookbackIso(RECOVERED_LOOKBACK_DAYS);
  const q = supabase
    .from("clinical_followups")
    .select(selectClause, countOnly ? { count: "exact", head: true } : undefined)
    .eq("organization_id", orgId)
    .in("status", RECOVERED_STATUSES)
    .gte("closed_at", since);
  return applyCommonFilters(q, filters);
}

function buildNoResponseQuery(
  supabase: SupaClient,
  orgId: string,
  filters: BucketFilters,
  selectClause: string,
  countOnly = false
): AnyQuery {
  const since = lookbackIso(NO_RESPONSE_LOOKBACK_DAYS);
  const q = supabase
    .from("clinical_followups")
    .select(selectClause, countOnly ? { count: "exact", head: true } : undefined)
    .eq("organization_id", orgId)
    .in("status", NO_RESPONSE_STATUSES)
    .gte("closed_at", since);
  return applyCommonFilters(q, filters);
}

async function loadBucketCounts(
  supabase: SupaClient,
  orgId: string,
  filters: BucketFilters
): Promise<BucketCounts> {
  const [pendingRes, recoveredRes, noResponseRes] = (await Promise.all([
    buildPendingQuery(supabase, orgId, filters, "id", true),
    buildRecoveredQuery(supabase, orgId, filters, "id", true),
    buildNoResponseQuery(supabase, orgId, filters, "id", true),
  ])) as Array<{ count: number | null }>;

  return {
    pending: pendingRes.count ?? 0,
    recovered: recoveredRes.count ?? 0,
    no_response: noResponseRes.count ?? 0,
  };
}

async function loadBucketItems(
  supabase: SupaClient,
  orgId: string,
  bucket: "pending" | "recovered" | "no_response",
  filters: BucketFilters,
  offset: number,
  limit: number
): Promise<unknown[]> {
  // Fetch limit+1 to detect if there are more pages without an extra count.
  const fetchSize = limit + 1;
  let q: AnyQuery;

  if (bucket === "pending") {
    q = buildPendingQuery(supabase, orgId, filters, SELECT_WITH_DETAILS, false)
      .order("expected_by", { ascending: true, nullsFirst: false })
      .range(offset, offset + fetchSize - 1);
  } else if (bucket === "recovered") {
    q = buildRecoveredQuery(supabase, orgId, filters, SELECT_WITH_DETAILS, false)
      .order("closed_at", { ascending: false })
      .range(offset, offset + fetchSize - 1);
  } else {
    q = buildNoResponseQuery(supabase, orgId, filters, SELECT_WITH_DETAILS, false)
      .order("closed_at", { ascending: false })
      .range(offset, offset + fetchSize - 1);
  }

  const { data, error } = (await q) as {
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  };
  if (error) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown> & {
      follow_up_date?: string | null;
      expected_by?: string | null;
    };
    let daysDiff: number | undefined;
    const ref = r.follow_up_date
      ? new Date(`${r.follow_up_date}T00:00:00`)
      : r.expected_by
        ? new Date(r.expected_by)
        : null;
    if (ref) {
      const diff = ref.getTime() - today.getTime();
      daysDiff = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return { ...r, days_diff: daysDiff };
  });
}

async function loadRecoveredKpis(
  supabase: SupaClient,
  orgId: string,
  counts: BucketCounts
): Promise<RecoveredKpis> {
  const since = lookbackIso(RECOVERED_LOOKBACK_DAYS);

  const [withContactRes, organicRes, totalClosedRes, ltvValue] =
    await Promise.all([
      supabase
        .from("clinical_followups")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "agendado_via_contacto")
        .gte("closed_at", since),
      supabase
        .from("clinical_followups")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("status", "agendado_organico_dentro_ventana")
        .gte("closed_at", since),
      supabase
        .from("clinical_followups")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .in("status", [...RECOVERED_STATUSES, ...NO_RESPONSE_STATUSES])
        .gte("closed_at", since),
      loadLtv(supabase, orgId),
    ]);

  const withContact = withContactRes.count ?? 0;
  const organic = organicRes.count ?? 0;
  const totalClosed = totalClosedRes.count ?? 0;
  const recoveredCount = counts.recovered;

  const recoveryRatePct =
    totalClosed > 0 ? (recoveredCount / totalClosed) * 100 : 0;
  // Honestidad de la métrica (spec sec. 0.3): el revenue solo se atribuye
  // donde el sistema EFECTIVAMENTE actuó (categoría A — withContact).
  // La categoría B (paciente volvió por iniciativa propia) NO cuenta para
  // revenue atribuido, aunque sí aparece como "Iniciativa propia" en KPIs.
  const revenueAttributed = withContact * ltvValue;

  return {
    recovered_attributable: withContact,
    organic_initiative: organic,
    recovery_rate_pct: Number(recoveryRatePct.toFixed(2)),
    revenue_attributed: Math.round(revenueAttributed * 100) / 100,
  };
}

async function loadLtv(
  supabase: SupaClient,
  orgId: string
): Promise<number> {
  const { data } = await supabase
    .from("organization_addons")
    .select("addon_key, settings, enabled")
    .eq("organization_id", orgId)
    .in("addon_key", [FERTILITY_PREMIUM_KEY, FERTILITY_BASIC_KEY]);

  if (!data || data.length === 0) return 5000;

  const preferred =
    data.find((r) => r.addon_key === FERTILITY_PREMIUM_KEY && r.enabled) ??
    data.find((r) => r.addon_key === FERTILITY_BASIC_KEY && r.enabled) ??
    data[0];

  const settings =
    preferred && typeof preferred.settings === "object" && preferred.settings !== null
      ? (preferred.settings as Record<string, unknown>)
      : {};
  const raw = settings.ltv_promedio_paciente;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 5000;
}

function lookbackIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}
