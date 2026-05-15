import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logClinicalAccess } from "@/lib/audit/clinical-access";

/**
 * GET /api/admin/audit-log/export
 *
 * Streams the filtered audit log as CSV. Same filters as the
 * paginated endpoint but no pagination (capped at 10k rows —
 * if a compliance audit needs more, run multiple narrower
 * queries by date range).
 *
 * The export action is itself audited — an export of audit
 * logs is a sensitive action that an owner might do for an
 * inspection by SUSALUD or DIGEMID, and we want a record of
 * who requested it.
 */

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  user_id: z.string().uuid().optional(),
  patient_id: z.string().uuid().optional(),
  resource_type: z.string().optional(),
  action: z.string().optional(),
});

const MAX_ROWS = 10_000;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }
  const f = parsed.data;

  const admin = createAdminClient();

  let query = admin
    .from("clinical_access_log")
    .select(`
      id, user_id, patient_id, resource_id, resource_type, action,
      at, ip_address, user_agent, metadata,
      patients(first_name, last_name)
    `)
    .eq("organization_id", membership.organization_id)
    .order("at", { ascending: false })
    .limit(MAX_ROWS);

  if (f.from) query = query.gte("at", f.from);
  if (f.to) query = query.lte("at", f.to);
  if (f.user_id) query = query.eq("user_id", f.user_id);
  if (f.patient_id) query = query.eq("patient_id", f.patient_id);
  if (f.resource_type) query = query.eq("resource_type", f.resource_type);
  if (f.action) query = query.eq("action", f.action);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Resolve user names once.
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

  const csv = buildCsv(data ?? [], userMap);

  // Self-audit: log that this export happened.
  logClinicalAccess({
    organizationId: membership.organization_id,
    userId: user.id,
    resourceType: "other",
    action: "export",
    metadata: {
      kind: "audit_log_csv",
      row_count: data?.length ?? 0,
      filters: f,
    },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

interface Row {
  id: string;
  user_id: string;
  patient_id: string | null;
  resource_id: string | null;
  resource_type: string;
  action: string;
  at: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  // Supabase PostgREST returns FK embeds as arrays even for
  // many-to-one relationships. Type both shapes so we can handle
  // either at runtime.
  patients:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
}

function buildCsv(
  rows: Row[],
  userMap: Map<string, { full_name: string | null; email: string | null }>,
): string {
  const headers = [
    "fecha_hora",
    "user_email",
    "user_nombre",
    "accion",
    "tipo_recurso",
    "recurso_id",
    "paciente_id",
    "paciente_nombre",
    "ip",
    "user_agent",
    "metadata_json",
  ];

  const lines = [headers.join(",")];
  for (const r of rows) {
    const u = userMap.get(r.user_id);
    // Supabase embed may return either object or single-element
    // array for many-to-one FKs. Normalize.
    const patientObj = Array.isArray(r.patients) ? r.patients[0] : r.patients;
    const patientName = patientObj
      ? `${patientObj.first_name ?? ""} ${patientObj.last_name ?? ""}`.trim()
      : "";
    lines.push(
      [
        csvEscape(r.at),
        csvEscape(u?.email ?? ""),
        csvEscape(u?.full_name ?? ""),
        csvEscape(r.action),
        csvEscape(r.resource_type),
        csvEscape(r.resource_id ?? ""),
        csvEscape(r.patient_id ?? ""),
        csvEscape(patientName),
        csvEscape(r.ip_address ?? ""),
        csvEscape(r.user_agent ?? ""),
        csvEscape(JSON.stringify(r.metadata ?? {})),
      ].join(","),
    );
  }
  // Excel/Sheets need a BOM for UTF-8 acentos (Lima/Bogotá in
  // device labels). Prefix once.
  return "﻿" + lines.join("\n");
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const needsQuoting = /[",\n\r]/.test(v);
  const escaped = v.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}
