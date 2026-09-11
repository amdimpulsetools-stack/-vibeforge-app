import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { resolveOrgTimezone, todayInTz } from "@/lib/org-time";
import { renderDocumentHtml } from "@/lib/pdf/html/render";
import { htmlToPdfBuffer } from "@/lib/pdf/html/chromium";
import { ORG_DOC_COLUMNS, type OrgDocRow } from "@/lib/pdf/prescription-data";
import { buildCustomReportDocData } from "@/lib/pdf/custom-report-data";
import {
  CUSTOM_REPORT_SECTIONS,
  type CustomReport,
  type CustomReportSectionKey,
} from "@/types/custom-report";

export const runtime = "nodejs"; // Chromium headless (puppeteer-core) no corre en edge

// GET /api/pdf/custom-report?org_id=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD&sections=services,advances,pharmacy,treatments
//
// "Resumen de cobros del periodo" en A4 con membrete. Mismo RPC que la
// pestaña de Reportes (`get_custom_report`, un número una fórmula), con el
// cliente del USUARIO: el RPC vuelve a comprobar la membresía y el rol.
// No es dato clínico: sin logClinicalAccess. Motor: Handlebars
// (lib/pdf/html/templates/custom-report.hbs) → Chromium.
//
//   org_id    obligatorio (uuid). Un usuario con dos clínicas elige cuál.
//   from/to   opcionales; si faltan, hoy civil de la org (nunca new Date()).
//   sections  CSV opcional de claves; ausente ⇒ todas.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Día real del mes (30 de febrero → inválido), en UTC puro: es texto, no fecha de negocio.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function parseSections(raw: string | null): CustomReportSectionKey[] | null | "invalid" {
  if (raw === null || raw.trim() === "") return null; // ⇒ todas
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const valid = CUSTOM_REPORT_SECTIONS.filter((k) => keys.includes(k));
  if (valid.length === 0 || valid.length !== new Set(keys).size) return "invalid";
  return [...valid];
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // 1. Parámetros.
  const sp = request.nextUrl.searchParams;
  const orgId = (sp.get("org_id") ?? "").trim();
  if (!UUID_RE.test(orgId)) {
    return NextResponse.json({ error: "org_id inválido" }, { status: 400 });
  }
  const fromRaw = sp.get("from")?.trim() || null;
  const toRaw = sp.get("to")?.trim() || null;
  if ((fromRaw && !isValidYmd(fromRaw)) || (toRaw && !isValidYmd(toRaw))) {
    return NextResponse.json({ error: "Fechas inválidas (yyyy-MM-dd)" }, { status: 400 });
  }
  const sections = parseSections(sp.get("sections"));
  if (sections === "invalid") {
    return NextResponse.json({ error: "Secciones inválidas" }, { status: 400 });
  }

  // 2. Membresía activa con rol owner/admin en ESA org (Reportes es adminOnly).
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador puede imprimir este reporte" },
      { status: 403 },
    );
  }

  // 3. Branding real de la org + zona horaria (el "hoy" es el de la org).
  const { data: orgRes } = await supabase
    .from("organizations")
    .select(ORG_DOC_COLUMNS)
    .eq("id", orgId)
    .maybeSingle();
  if (!orgRes) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });
  }
  const orgRow = orgRes as unknown as OrgDocRow;
  const tz = resolveOrgTimezone(orgRow.timezone);
  const today = todayInTz(tz);
  const from = fromRaw ?? toRaw ?? today;
  const to = toRaw ?? fromRaw ?? today;
  if (from > to) {
    return NextResponse.json(
      { error: "Rango inválido: la fecha final es anterior a la inicial" },
      { status: 400 },
    );
  }

  // 4. El mismo RPC que la pantalla, con el cliente del usuario (vuelve a
  //    gatear rol y org; 'forbidden' ⇒ 403). Nombre de quien imprime en paralelo.
  const [reportRes, profileRes] = await Promise.all([
    supabase.rpc("get_custom_report", {
      p_org_id: orgId,
      p_from: from,
      p_to: to,
      p_sections: sections,
    }),
    supabase.from("user_profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  if (reportRes.error) {
    const msg = reportRes.error.message ?? "";
    const forbidden = /forbidden/i.test(msg) || reportRes.error.code === "42501";
    return NextResponse.json(
      { error: forbidden ? "Sin permiso para este reporte" : msg || "No se pudo generar el reporte" },
      { status: forbidden ? 403 : 500 },
    );
  }
  const report = reportRes.data as unknown as CustomReport | null;
  if (!report || !report.range) {
    return NextResponse.json({ error: "No se pudo generar el reporte" }, { status: 500 });
  }

  const generatedBy =
    profileRes.data?.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    user.email ||
    "—";

  // 5. Render.
  const data = buildCustomReportDocData(report, orgRow, generatedBy);
  const html = await renderDocumentHtml("custom-report.hbs", data);
  const pdf = await htmlToPdfBuffer(html);

  return new NextResponse(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="resumen-cobros-${report.range.from}_${report.range.to}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
