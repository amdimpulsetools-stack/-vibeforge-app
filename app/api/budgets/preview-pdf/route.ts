import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generalLimiter } from "@/lib/rate-limit";
import { assertFertilityAddon } from "@/lib/fertility/assert-fertility-addon";
import { getActiveBudgetPdfPlugin } from "@/lib/plugins/active";
import { getPluginByKey } from "@/lib/plugins/registry";
import { buildPreviewProps, previewTemplatesForPlugin } from "@/lib/budget-pdf/preview";

export const runtime = "nodejs";
// Mismo presupuesto de tiempo que /api/budgets/[id]/pdf: arranque en frío
// de chromium + render.
export const maxDuration = 30;

/**
 * /api/budgets/preview-pdf — vista previa del presupuesto con datos de
 * EJEMPLO (lib/budget-pdf/preview.ts).
 *
 *  GET  ?organization_id=… → `{ plugin: { key, name } | null, templates: [{ value, label }] }`
 *  POST { organization_id, template } → el PDF (application/pdf, inline).
 *
 * Mismo camino que el PDF real (plugin + config + marca + términos de la
 * org); solo la paciente es ficticia. No escribe nada: ni budget_records
 * ni Storage. La org viaja explícita y se valida la membresía ACTIVA en
 * ella (nunca `limit(1)` sobre membresías: un usuario multi-org vería la
 * plantilla de otra clínica).
 */

type SupaClient = Awaited<ReturnType<typeof createClient>>;

async function authorize(supabase: SupaClient, orgId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return { error: NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 }) };
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (!member) {
    return { error: NextResponse.json({ error: "No perteneces a esta organización" }, { status: 403 }) };
  }
  const noAddon = await assertFertilityAddon(supabase, orgId);
  if (noAddon) return { error: noAddon };
  return { ok: true as const };
}

/** Primer plugin de presupuestos instalado y habilitado en la org. */
async function installedBudgetPlugin(orgId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("org_plugins")
    .select("plugin_key")
    .eq("organization_id", orgId)
    .eq("enabled", true);
  for (const row of (data as { plugin_key: string }[] | null) ?? []) {
    const plugin = getPluginByKey(row.plugin_key);
    if (plugin?.family === "budget_pdf") return plugin;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("organization_id");
  if (!orgId || !z.string().uuid().safeParse(orgId).success) {
    return NextResponse.json({ error: "Falta organization_id" }, { status: 400 });
  }
  const supabase = await createClient();
  const auth = await authorize(supabase, orgId);
  if ("error" in auth) return auth.error;

  const plugin = await installedBudgetPlugin(orgId);
  if (!plugin) return NextResponse.json({ plugin: null, templates: [] });
  return NextResponse.json({
    plugin: { key: plugin.key, name: plugin.name },
    templates: previewTemplatesForPlugin(plugin.key).map((t) => ({ value: t.value, label: t.label })),
  });
}

const bodySchema = z
  .object({
    organization_id: z.string().uuid(),
    template: z.string().min(1).max(60),
  })
  .strict();

export async function POST(request: NextRequest) {
  let input: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const supabase = await createClient();
  const auth = await authorize(supabase, input.organization_id);
  if ("error" in auth) return auth.error;

  const installed = await installedBudgetPlugin(input.organization_id);
  if (!installed) {
    return NextResponse.json(
      { error: "Esta organización no tiene un plugin de presupuestos instalado" },
      { status: 404 },
    );
  }
  const template = previewTemplatesForPlugin(installed.key).find((t) => t.value === input.template);
  if (!template) return NextResponse.json({ error: "Plantilla desconocida" }, { status: 400 });

  const admin = createAdminClient();
  const built = await buildPreviewProps(admin, input.organization_id, template);
  if (!built) return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 });

  // El MISMO resolvedor que el PDF real: plugin + config fusionada.
  const active = await getActiveBudgetPdfPlugin(admin, input.organization_id, template.treatmentType);
  if (!active) {
    return NextResponse.json(
      { error: "El plugin no aplica a este tratamiento en esta organización" },
      { status: 404 },
    );
  }

  let pdf: Buffer;
  try {
    pdf = await active.plugin.render(built.props, active.config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[budget-pdf-preview] render threw:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const filename = `vista-previa-${template.value.toLowerCase()}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
