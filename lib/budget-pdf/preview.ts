/**
 * Vista previa del presupuesto con datos de EJEMPLO.
 *
 * Pedido de la Dra. Patricia (24-sep): ver cómo sale el PDF de cada
 * tratamiento sin tener que emitir el presupuesto de una paciente real.
 *
 * Fidelidad: la vista previa recorre EXACTAMENTE el mismo camino que el
 * PDF real (`generate.ts`): mismo plugin resuelto por
 * `getActiveBudgetPdfPlugin`, misma config de `org_plugins`, misma marca
 * y datos de la org (Ajustes), mismos vigencia/términos/pie de
 * `org_budget_pdf_settings`, mismo render HTML → Chromium. Lo único
 * ficticio es la paciente (y el código del presupuesto, P-AAAA-0000).
 * Médico y asesora son reales de la org para que la cabecera se vea
 * como en un presupuesto de verdad.
 *
 * Nada se guarda: ni en `budget_records` ni en Storage.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetPdfProps } from "./document";
import { PATRICIA_ROUTES, resolvePatriciaRoute, type PatriciaRouteKey } from "./patricia/routing";
import type { BudgetTreatmentType } from "@/lib/plugins/types";
import { loadBudgetPdfSettings, loadOrg, type OrgRow } from "./generate";

/** Id fijo de la muestra: el código impreso sale P-AAAA-0000, obviamente de ejemplo. */
export const PREVIEW_BUDGET_ID = "00000000-0000-0000-0000-000000000000";

export interface PreviewTemplate {
  /** Valor estable que viaja en el POST. */
  value: string;
  /** Rótulo para el selector. */
  label: string;
  treatmentType: BudgetTreatmentType;
  /** Nombre de servicio con el que el plugin enruta a esta plantilla. */
  serviceName: string;
}

const PATRICIA_ROUTE_TYPE: Record<PatriciaRouteKey, BudgetTreatmentType> = {
  FIV: "FIV",
  FIV_SEMEN_DONADO: "FIV",
  FIV_MIXTO: "FIV",
  OVODON: "OVODONACION",
  OVODON_DONANTE_CONOCIDA: "OVODONACION",
  OVODON_SEMEN_DONADO: "OVODONACION",
  DUOSTIM: "DUOSTIM",
  CRIO: "CRIO",
  TED: "TED",
  IIU: "IIU",
  IIU_SEMEN_DONADO: "IIU",
  ROPA: "ROPA",
};

const VITRA_LABELS: Partial<Record<BudgetTreatmentType, string>> = {
  FIV: "Fecundación In Vitro (FIV)",
  CRIO: "Criopreservación de óvulos",
  IIU: "Inseminación Artificial (IIU)",
  TED: "Transferencia Embrionaria Diferida (TED)",
  DUOSTIM: "DUO STIM · Acumulación de Embriones",
  ROPA: "Método ROPA",
  OVODONACION: "Ovodonación + NGS",
};

/**
 * Plantillas disponibles para un plugin instalado. Patricia enruta por
 * NOMBRE de servicio (12 plantillas sobre 7 tipos): se usa el título de
 * cada ruta como nombre y se comprueba que el router lo devuelve a esa
 * misma plantilla — si alguien cambia un título o una regla y deja de
 * cuadrar, la opción desaparece en vez de previsualizar otra plantilla.
 */
export function previewTemplatesForPlugin(pluginKey: string): PreviewTemplate[] {
  if (pluginKey === "budget_pdf_patricia") {
    return Object.values(PATRICIA_ROUTES)
      .map((r) => ({
        value: r.key,
        label: r.title,
        treatmentType: PATRICIA_ROUTE_TYPE[r.key],
        serviceName: r.title,
      }))
      .filter((t) => resolvePatriciaRoute(t.treatmentType, t.serviceName)?.key === t.value);
  }
  if (pluginKey === "budget_pdf_vitra") {
    return (Object.entries(VITRA_LABELS) as [BudgetTreatmentType, string][]).map(
      ([type, label]) => ({ value: type, label, treatmentType: type, serviceName: label }),
    );
  }
  return [];
}

/** Médico real de la org (el primero activo), para que la cabecera se vea real. */
async function sampleDoctor(client: SupabaseClient, orgId: string): Promise<string> {
  const { data } = await client
    .from("doctors")
    .select("full_name")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { full_name: string | null } | null)?.full_name ?? "Médico de ejemplo";
}

/** Asesora real de la org (primer miembro con is_fertility_advisor), o ninguna. */
async function sampleAdvisor(
  client: SupabaseClient,
  orgId: string,
): Promise<{ fullName: string; phone: string | null } | null> {
  const { data: member } = await client
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq("is_fertility_advisor", true)
    .limit(1)
    .maybeSingle();
  const userId = (member as { user_id: string } | null)?.user_id;
  if (!userId) return null;
  const { data: profile } = await client
    .from("user_profiles")
    .select("full_name, whatsapp_phone")
    .eq("id", userId)
    .maybeSingle();
  const p = profile as { full_name: string | null; whatsapp_phone: string | null } | null;
  return p?.full_name ? { fullName: p.full_name, phone: p.whatsapp_phone ?? null } : null;
}

/**
 * Props del presupuesto de ejemplo. Mismo armado que `generate.ts`, con
 * paciente ficticia. `amount` / `tier` solo importan a plugins con tiers
 * (Vitra); Patricia imprime su desglose de precio único y los ignora.
 */
export async function buildPreviewProps(
  adminClient: SupabaseClient,
  orgId: string,
  template: PreviewTemplate,
): Promise<{ props: BudgetPdfProps & { budgetId: string }; org: OrgRow } | null> {
  const org = await loadOrg(adminClient, orgId);
  if (!org) return null;
  const [settings, doctorName, asesora] = await Promise.all([
    loadBudgetPdfSettings(adminClient, orgId),
    sampleDoctor(adminClient, orgId),
    sampleAdvisor(adminClient, orgId),
  ]);

  return {
    org,
    props: {
      org: {
        name: org.legal_name ?? org.name,
        ruc: org.ruc,
        logoDataUrl: org.logo_url,
        address: org.address,
        phone: org.phone,
        phoneSecondary: org.phone_secondary,
        emailPublic: org.email_public,
        website: org.website,
        printColorPrimary: org.print_color_primary,
      },
      patient: {
        firstName: "Paciente",
        lastName: "de Ejemplo",
        documentNumber: "00000000",
      },
      doctor: { fullName: doctorName },
      asesora,
      service: { name: template.serviceName, treatmentType: template.treatmentType },
      tier: "A",
      amount: 0,
      honorariosAdjustment: 0,
      currency: "PEN",
      includesText: null,
      fecha: new Date(),
      vigenciaDays: settings.vigenciaDays,
      terms: settings.terms,
      footerText: settings.footerText,
      singlePricing: settings.singlePricing,
      budgetId: PREVIEW_BUDGET_ID,
    },
  };
}
