import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/audit-log
 *
 * Paginated query over clinical_access_log for the calling
 * user's organization. Owner/admin only (RLS enforces this
 * too — the admin client below joins on the membership check
 * inline as belt-and-braces).
 *
 * Filters (all optional, AND-combined):
 *   - from, to: ISO date range over `at`
 *   - user_id: who performed the action
 *   - patient_id: whose record was touched
 *   - resource_type: see lib/audit/clinical-access.ts
 *   - action: view/list/create/...
 *
 * Pagination: cursor-less offset (page * pageSize). Capped at
 * pageSize=100 to keep response payloads sane.
 */

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  user_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  resource_type: z
    .enum([
      "patient",
      "clinical_note",
      "prescription",
      "attachment",
      "lab_result",
      "treatment_plan",
      "medical_history",
      "appointment",
      "ai_query",
      "other",
    ])
    .optional(),
  action: z
    .enum([
      "view",
      "list",
      "create",
      "update",
      "delete",
      "export",
      "print",
      "download",
    ])
    .optional(),
  page: z.coerce.number().int().min(0).default(0),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Owner/admin check. Layout already enforces this for the UI,
  // but the API can be called directly so re-check here.
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const f = parsed.data;

  // Use the admin client to bypass RLS and let us join against
  // auth.users / patients for the display labels. The org filter
  // below is the security boundary.
  const admin = createAdminClient();

  let query = admin
    .from("clinical_access_log")
    .select(
      `
      id, organization_id, user_id, patient_id, resource_id,
      resource_type, action, at, ip_address, user_agent, metadata,
      patients(first_name, last_name)
    `,
      { count: "exact" },
    )
    .eq("organization_id", membership.organization_id)
    .order("at", { ascending: false });

  if (f.from) query = query.gte("at", f.from);
  if (f.to) query = query.lte("at", f.to);
  if (f.user_id) query = query.eq("user_id", f.user_id);
  if (f.patient_id) query = query.eq("patient_id", f.patient_id);
  if (f.resource_type) query = query.eq("resource_type", f.resource_type);
  if (f.action) query = query.eq("action", f.action);

  const offset = f.page * f.page_size;
  query = query.range(offset, offset + f.page_size - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/audit-log] query error", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Resolve user names in a single lookup. Cheaper than a join
  // because clinical_access_log.user_id FKs to auth.users not
  // user_profiles, and PostgREST embed via auxiliary tables is
  // fragile. With page_size capped at 100 the IN-list is small.
  const userIds = Array.from(
    new Set((data ?? []).map((r) => r.user_id).filter(Boolean)),
  );
  const userMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("user_profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      userMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  const enriched = (data ?? []).map((r) => ({
    ...r,
    user: userMap.get(r.user_id) ?? null,
  }));

  return NextResponse.json({
    rows: enriched,
    total: count ?? 0,
    page: f.page,
    page_size: f.page_size,
  });
}
