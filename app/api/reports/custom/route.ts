import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
import {
  CUSTOM_REPORT_SECTIONS,
  type CustomReport,
  type CustomReportSectionKey,
} from "@/types/custom-report";

// ──────────────────────────────────────────────────────────────────
// GET /api/reports/custom?org_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//                        [&sections=services,advances,pharmacy,treatments]
//
// "Resumen de cobros del periodo" (docs/spec-reporte-personalizado.md).
// La ruta NO calcula nada: devuelve tal cual el JSON del RPC
// get_custom_report (mig 260), tipado como CustomReport. Cada sección es
// una cubeta de get_reports_overview (mig 251) con las mismas CTEs; el
// único sitio donde vive esa fórmula es el SQL (CLAUDE.md: un número,
// una fórmula).
//
// Dos puertas: aquí se exige membresía activa owner/admin EN org_id
// (403 si no) y el RPC lo vuelve a comprobar con get_user_org_role
// (patrón M12). Se llama con el cliente del USUARIO, nunca con service
// role, para que el gating del RPC sea real.
//
// `from`/`to` ausentes ⇒ hoy civil de la org (organizations.timezone,
// lib/org-time.ts). Nunca new Date().toISOString(): Vercel corre en UTC
// y a partir de las 19:00 Lima ya sería "mañana".
// ──────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

const sectionKeySchema = z.enum(
  CUSTOM_REPORT_SECTIONS as unknown as [CustomReportSectionKey, ...CustomReportSectionKey[]],
);

const querySchema = z.object({
  org_id: z.string().uuid(),
  from: z.string().regex(DATE_RE, "yyyy-MM-dd").optional(),
  to: z.string().regex(DATE_RE, "yyyy-MM-dd").optional(),
  // CSV de claves válidas; vacío o ausente ⇒ todas (el RPC recibe NULL).
  sections: z
    .string()
    .optional()
    .transform((raw) =>
      raw === undefined || raw.trim() === ""
        ? undefined
        : raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
    )
    .pipe(z.array(sectionKeySchema).min(1).optional()),
});

interface MembershipRow {
  role: string;
}

/** Días civiles entre dos yyyy-MM-dd (misma aritmética que `v_to - v_from` en SQL). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Errores del RPC → HTTP. 42501 = insufficient_privilege (gating M12),
 * 23514 = check_violation (rango invertido, > 366 días, sección desconocida). */
function mapRpcError(err: { code?: string; message?: string }): NextResponse {
  const msg = err.message ?? "";
  if (err.code === "42501" || msg.toLowerCase().includes("forbidden")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (err.code === "23514") {
    return NextResponse.json({ error: msg || "Rango de fechas inválido" }, { status: 400 });
  }
  return NextResponse.json({ error: msg || "No se pudo generar el reporte" }, { status: 500 });
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
  const parsed = querySchema.safeParse({
    org_id: sp.get("org_id") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    sections: sp.get("sections") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { org_id: orgId, sections } = parsed.data;

  // Primera puerta: membresía activa owner/admin EN la org pedida (no una
  // membresía cualquiera del usuario: el founder multi-org vería otra org).
  const { data: membershipRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const membership = (membershipRow as MembershipRow | null) ?? null;
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Rango: si falta from/to, hoy civil de la org (mig 240).
  let { from, to } = parsed.data;
  if (!from || !to) {
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("timezone")
      .eq("id", orgId)
      .maybeSingle();
    const tz = resolveOrgTimezone((orgRow as { timezone?: string | null } | null)?.timezone);
    const today = todayInTz(tz);
    from = from ?? to ?? today;
    to = to ?? from;
  }
  if (Number.isNaN(daysBetween(from, to))) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  if (to < from) {
    return NextResponse.json(
      { error: "Rango inválido: la fecha final es anterior a la inicial" },
      { status: 400 },
    );
  }
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: "El rango máximo del reporte es de un año" },
      { status: 400 },
    );
  }

  // Cliente del USUARIO: el RPC vuelve a gatear con get_user_org_role.
  const { data, error } = await supabase.rpc("get_custom_report", {
    p_org_id: orgId,
    p_from: from,
    p_to: to,
    p_sections: sections ?? null,
  });
  if (error) {
    return mapRpcError(error);
  }
  if (!data) {
    return NextResponse.json({ error: "No se pudo generar el reporte" }, { status: 500 });
  }

  const report = data as CustomReport;
  return NextResponse.json(report, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
