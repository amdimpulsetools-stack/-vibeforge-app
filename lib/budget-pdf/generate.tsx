/**
 * Server-side helper that produces (or reuses) a PDF for a given
 * `budget_records.id` and returns a signed URL.
 *
 * Shared between:
 *   - POST /api/budgets/[id]/pdf  (explicit "Descargar PDF" button)
 *   - POST /api/budgets/[id]/send (auto-generates so the obstetra
 *                                  gets a signed URL in the response)
 *
 * Caching: if `pdf_storage_path` already points to a file AND
 * `pdf_generated_at >= updated_at`, we reuse the existing object and
 * just mint a new signed URL. Otherwise we render → upload → persist.
 *
 * The function takes both the user-session client (used to enforce
 * RLS on the lookup query and to mint signed URLs as the calling
 * user) and an admin client (used for the upload + the row UPDATE so
 * we don't get tangled with the user's RLS policies on
 * budget_records).
 */

import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BudgetPdfDocument, type BudgetPdfProps } from "./document";
import { renderFivHtmlPdf, shouldUseHtmlPdfPath } from "./render-html";
import {
  buildBudgetPdfPath,
  getBudgetPdfSignedUrl,
  uploadBudgetPdf,
} from "./storage";

interface BudgetForPdf {
  id: string;
  organization_id: string;
  treatment_type: string;
  amount: number | null;
  tier: "A" | "B" | "C" | null;
  service_id: string | null;
  assigned_by_user_id: string | null;
  sent_by_user_id: string | null;
  assigned_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  // mig 167 — Phase 4 fields. Nullable in the DB so historical rows
  // (created before the migration) keep working; the PDF gracefully
  // falls back to "—" when missing.
  appointment_id: string | null;
  assigned_doctor_id: string | null;
  assigned_asesora_member_id: string | null;
  assigned_doctor: { full_name: string | null } | null;
  assigned_asesora: {
    user_id: string | null;
    profile: { full_name: string | null } | null;
  } | null;
  patient: {
    first_name: string | null;
    last_name: string | null;
    dni: string | null;
  } | null;
  service: {
    name: string | null;
    organization_id: string;
  } | null;
}

interface OrgRow {
  id: string;
  name: string;
  ruc: string | null;
  legal_name: string | null;
  logo_url: string | null;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
}

interface OrgBudgetPdfSettingsRow {
  vigencia_days: number;
  terms: unknown;
  footer_text: string | null;
}

const FALLBACK_VIGENCIA_DAYS = 30;
const FALLBACK_TERMS: string[] = [
  "Vigencia del presupuesto: 30 días desde la fecha de emisión.",
  "Servicios médicos no contemplados en este presupuesto serán cotizados por separado.",
];

async function loadBudgetPdfSettings(
  client: SupabaseClient,
  orgId: string,
): Promise<{ vigenciaDays: number; terms: string[]; footerText: string }> {
  const { data } = await client
    .from("org_budget_pdf_settings")
    .select("vigencia_days, terms, footer_text")
    .eq("organization_id", orgId)
    .maybeSingle();

  const row = data as OrgBudgetPdfSettingsRow | null;
  if (!row) {
    return {
      vigenciaDays: FALLBACK_VIGENCIA_DAYS,
      terms: FALLBACK_TERMS,
      footerText: "",
    };
  }

  const terms = Array.isArray(row.terms)
    ? (row.terms.filter((t): t is string => typeof t === "string" && t.trim().length > 0))
    : FALLBACK_TERMS;

  return {
    vigenciaDays: row.vigencia_days || FALLBACK_VIGENCIA_DAYS,
    terms,
    footerText: row.footer_text ?? "",
  };
}

export interface GenerateResult {
  signedUrl: string;
  storagePath: string;
  reused: boolean;
  sizeBytes: number;
}

/**
 * Loads a budget by id, scoped via the user-session client (RLS
 * enforces the org-scoping). Returns null if not found / not visible.
 */
async function loadBudgetForPdf(
  userClient: SupabaseClient,
  budgetId: string,
): Promise<BudgetForPdf | null> {
  const { data, error } = await userClient
    .from("budget_records")
    .select(
      [
        "id",
        "organization_id",
        "treatment_type",
        "amount",
        "tier",
        "service_id",
        "assigned_by_user_id",
        "sent_by_user_id",
        "assigned_at",
        "sent_at",
        "created_at",
        "updated_at",
        "pdf_storage_path",
        "pdf_generated_at",
        "appointment_id",
        "assigned_doctor_id",
        "assigned_asesora_member_id",
        "assigned_doctor:doctors(full_name)",
        "assigned_asesora:organization_members!budget_records_assigned_asesora_member_id_fkey(user_id, profile:profiles(full_name))",
        "patient:patients(first_name, last_name, dni)",
        "service:services(name, organization_id)",
      ].join(","),
    )
    .eq("id", budgetId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BudgetForPdf;
}

async function loadOrg(
  client: SupabaseClient,
  orgId: string,
): Promise<OrgRow | null> {
  const { data } = await client
    .from("organizations")
    .select("id, name, ruc, legal_name, logo_url")
    .eq("id", orgId)
    .maybeSingle();
  return (data as OrgRow | null) ?? null;
}

async function loadProfile(
  client: SupabaseClient,
  userId: string | null,
): Promise<ProfileLite | null> {
  if (!userId) return null;
  const { data } = await client
    .from("profiles")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle();
  return (data as ProfileLite | null) ?? null;
}

/**
 * Map `services.name` → expected enum slot. Mirrors the inference
 * documented in `app/api/budgets/assign/route.ts` (Phase 3).
 */
function inferTreatmentTypeFromService(
  serviceName: string | null,
): string {
  if (!serviceName) return "OTRO";
  const n = serviceName.toLowerCase();
  if (n.includes("ovodon")) return "OVODONACION";
  if (n.includes("ropa")) return "ROPA";
  if (n.includes("crio")) return "CRIO";
  if (n.includes("inseminaci") || n.includes("iiu")) return "IIU";
  if (n.includes("transferencia") || n.includes("ted")) return "TED";
  if (n.includes("inducci")) return "INDUCCION";
  if (n.includes("fiv") || n.includes("fecundaci")) return "FIV";
  return "OTRO";
}

export async function generateBudgetPdf(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  budgetId: string,
): Promise<
  | { ok: true; result: GenerateResult }
  | { ok: false; status: number; error: string }
> {
  const budget = await loadBudgetForPdf(userClient, budgetId);
  if (!budget) {
    return { ok: false, status: 404, error: "Presupuesto no encontrado" };
  }

  // Reuse path: if we already have a PDF and the row has not been
  // edited since render, skip re-rendering.
  const generatedAt = budget.pdf_generated_at
    ? new Date(budget.pdf_generated_at).getTime()
    : 0;
  const updatedAt = new Date(budget.updated_at).getTime();
  if (budget.pdf_storage_path && generatedAt >= updatedAt) {
    try {
      const signedUrl = await getBudgetPdfSignedUrl(
        userClient,
        budget.pdf_storage_path,
      );
      return {
        ok: true,
        result: {
          signedUrl,
          storagePath: budget.pdf_storage_path,
          reused: true,
          sizeBytes: 0,
        },
      };
    } catch {
      // Fall through to re-render — the file might have been deleted
      // out-of-band or the path is stale.
    }
  }

  // Load org. Use admin client so we never 404 on a perfectly valid
  // budget because of an RLS quirk.
  const org = await loadOrg(adminClient, budget.organization_id);
  if (!org) {
    return { ok: false, status: 500, error: "Organización no encontrada" };
  }

  // Doctor (médico tratante) comes from the embedded join on
  // `assigned_doctor_id` (mig 167). For rows created before the
  // migration the field is NULL and we fall back to the assigner's
  // profile so the PDF doesn't blow up — that legacy fallback used
  // to be the primary path, which was the root of the "wrong doctor"
  // bug we're fixing here.
  const doctorName =
    budget.assigned_doctor?.full_name ??
    (await loadProfile(adminClient, budget.assigned_by_user_id))?.full_name ??
    null;
  const doctor = doctorName ? { id: "", full_name: doctorName } : null;

  // Asesora comes from the chained join member → user → profile.
  // No legacy fallback: sent_by_user_id was a wrong proxy that left
  // the PDF blank for un-sent budgets, so we'd rather show "—" than
  // surface the wrong person.
  const asesoraName = budget.assigned_asesora?.profile?.full_name ?? null;
  const asesora = asesoraName ? { id: "", full_name: asesoraName } : null;

  // Tier metadata (currency + includes_text). Optional — fallbacks
  // exist downstream.
  let includesText: string | null = null;
  let currency: "PEN" | "USD" = "PEN";
  let amount = Number(budget.amount ?? 0);
  if (budget.service_id && budget.tier) {
    const { data: tierRow } = await adminClient
      .from("service_budget_tiers")
      .select("amount, currency, includes_text")
      .eq("service_id", budget.service_id)
      .eq("tier", budget.tier)
      .eq("is_active", true)
      .maybeSingle();
    if (tierRow) {
      const t = tierRow as {
        amount: number | string;
        currency: string;
        includes_text: string | null;
      };
      includesText = t.includes_text ?? null;
      currency = t.currency === "USD" ? "USD" : "PEN";
      // Prefer the snapshot stored on `budget_records.amount` (Phase 3
      // captures it at assign time). Only fall back to the live tier
      // amount if the snapshot is missing.
      if (!budget.amount) {
        amount = Number(t.amount);
      }
    }
  }

  const patient = budget.patient ?? {
    first_name: "",
    last_name: "",
    dni: null,
  };

  const pdfSettings = await loadBudgetPdfSettings(
    adminClient,
    budget.organization_id,
  );

  const props: BudgetPdfProps = {
    org: {
      name: org.legal_name ?? org.name,
      ruc: org.ruc,
      logoDataUrl: org.logo_url,
    },
    patient: {
      firstName: patient.first_name ?? "",
      lastName: patient.last_name ?? "",
      documentNumber: patient.dni ?? null,
    },
    doctor: { fullName: doctor?.full_name ?? "—" },
    asesora: asesora?.full_name ? { fullName: asesora.full_name } : null,
    service: {
      name: budget.service?.name ?? budget.treatment_type,
      treatmentType: budget.service?.name
        ? inferTreatmentTypeFromService(budget.service.name)
        : budget.treatment_type,
    },
    tier: budget.tier,
    amount,
    currency,
    includesText,
    fecha: new Date(budget.sent_at ?? budget.assigned_at ?? budget.created_at),
    vigenciaDays: pdfSettings.vigenciaDays,
    terms: pdfSettings.terms,
    footerText: pdfSettings.footerText,
  };

  // Per-org PDF pipeline switch. Today only NATURVITRA's FIV budget
  // uses the new HTML+Handlebars+Puppeteer path; everything else
  // continues to render with @react-pdf/renderer.
  const orgLegalName = org.legal_name ?? org.name;
  const pdfBuffer = shouldUseHtmlPdfPath(orgLegalName, props.service.treatmentType)
    ? await renderFivHtmlPdf({ ...props, budgetId: budget.id })
    : ((await renderToBuffer(
        <BudgetPdfDocument {...props} />,
      )) as Buffer);

  const { path, sizeBytes } = await uploadBudgetPdf(
    adminClient,
    budget.organization_id,
    budget.id,
    pdfBuffer,
  );

  // Persist via admin client to bypass any RLS UPDATE constraints.
  const nowIso = new Date().toISOString();
  await adminClient
    .from("budget_records")
    .update({
      pdf_storage_path: path,
      pdf_generated_at: nowIso,
      pdf_size_bytes: sizeBytes,
    })
    .eq("id", budget.id);

  const signedUrl = await getBudgetPdfSignedUrl(userClient, path);
  return {
    ok: true,
    result: { signedUrl, storagePath: path, reused: false, sizeBytes },
  };
}
