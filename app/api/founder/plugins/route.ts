import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireFounder } from "@/lib/require-founder";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLUGINS } from "@/lib/plugins/registry";

export const runtime = "nodejs";

// ──────────────────────────────────────────────────────────────────
// Founder Panel — plugins API
//
// GET  /api/founder/plugins  → list installed plugin rows joined with
//                              org name + registry metadata.
// POST /api/founder/plugins  → install a plugin on an org.
//
// Both gated by `user_profiles.is_founder = true`. The org_plugins
// table also has founder-only RLS as defense in depth.
// ──────────────────────────────────────────────────────────────────

// Auditoría 2026-08-08: este guard propio omitía la capa 3 (cookie 2FA) —
// un session cookie robado del founder podía operar plugins sin 2FA,
// exactamente lo que requireFounder se creó para impedir. Ahora delega en
// el guard canónico de 3 capas. Devuelve la lista de orgs vía este mismo
// route (GET ?with_orgs=1) porque el browser client NO tiene RLS de
// founder sobre organizations (el comentario "wide RLS access" del page
// era falso: solo veía las orgs de las que el founder es owner).
async function assertFounder(): Promise<{ userId: string } | NextResponse> {
  const result = await requireFounder();
  if ("error" in result) return result.error;
  return { userId: result.userId };
}

interface OrgPluginListRow {
  id: string;
  plugin_key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  installed_at: string;
  organization_id: string;
  organization: { name: string; legal_name: string | null } | null;
}

export async function GET() {
  const guard = await assertFounder();
  if (guard instanceof NextResponse) return guard;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("org_plugins")
    .select(
      "id, plugin_key, enabled, config, installed_at, organization_id, organization:organizations(name, legal_name)",
    )
    .order("installed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = ((data as unknown as OrgPluginListRow[]) ?? []).map((r) => {
    const orgEmbed = Array.isArray(r.organization)
      ? r.organization[0]
      : r.organization;
    return {
      id: r.id,
      plugin_key: r.plugin_key,
      enabled: r.enabled,
      config: r.config ?? {},
      installed_at: r.installed_at,
      organization_id: r.organization_id,
      org_name: orgEmbed?.name ?? "—",
      org_legal_name: orgEmbed?.legal_name ?? null,
      // Enrich with registry metadata so the UI doesn't need to know
      // about lib/plugins shape.
      registry: PLUGINS[r.plugin_key]
        ? {
            name: PLUGINS[r.plugin_key].name,
            description: PLUGINS[r.plugin_key].description,
            requires_addons: PLUGINS[r.plugin_key].requires_addons,
          }
        : null,
    };
  });

  // Lista de orgs para el dropdown del instalador — vía admin client
  // porque el browser client solo ve las orgs del propio founder.
  const { data: orgRows } = await admin
    .from("organizations")
    .select("id, name, legal_name")
    .order("name");

  return NextResponse.json({
    organizations: orgRows ?? [],
    rows,
    available_plugins: Object.values(PLUGINS).map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      requires_addons: p.requires_addons,
      family: p.family,
    })),
  });
}

const installSchema = z.object({
  organization_id: z.string().uuid(),
  plugin_key: z.string().min(1),
  config: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const guard = await assertFounder();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const parsed = installSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (!PLUGINS[parsed.data.plugin_key]) {
    return NextResponse.json(
      { error: `Unknown plugin_key: ${parsed.data.plugin_key}` },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("org_plugins")
    .insert({
      organization_id: parsed.data.organization_id,
      plugin_key: parsed.data.plugin_key,
      enabled: true,
      config: parsed.data.config ?? {},
      installed_by_user_id: guard.userId,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
