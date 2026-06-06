import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

async function assertFounder(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("is_founder")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_founder) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: user.id };
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

  return NextResponse.json({
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
