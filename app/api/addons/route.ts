import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const orgId = membership.organization_id;

  const [catalogRes, orgAddonsRes, orgSpecRes, orgRes] = await Promise.all([
    supabase
      .from("addons")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("organization_addons")
      .select("addon_key, enabled, settings, activated_at")
      .eq("organization_id", orgId),
    supabase
      .from("organization_specialties")
      .select("specialties(slug)")
      .eq("organization_id", orgId),
    supabase
      .from("organizations")
      .select("primary_specialty_id, specialties(slug)")
      .eq("id", orgId)
      .single(),
  ]);

  const catalog = catalogRes.data ?? [];
  const orgAddons = orgAddonsRes.data ?? [];
  const orgSpecSlugs = new Set<string>();

  for (const row of orgSpecRes.data ?? []) {
    const spec = row.specialties as unknown as { slug: string } | null;
    if (spec?.slug) orgSpecSlugs.add(spec.slug);
  }

  const primarySpec = orgRes.data?.specialties as unknown as { slug: string } | null;
  if (primarySpec?.slug) orgSpecSlugs.add(primarySpec.slug);

  const enriched = catalog.map((addon) => {
    const orgAddon = orgAddons.find((oa) => oa.addon_key === addon.key);
    const recommended =
      Array.isArray(addon.specialties) &&
      addon.specialties.some((s: string) => orgSpecSlugs.has(s));
    return {
      ...addon,
      enabled: orgAddon?.enabled ?? false,
      activated_at: orgAddon?.activated_at ?? null,
      settings: orgAddon?.settings ?? {},
      recommended,
    };
  });

  return NextResponse.json(enriched);
}

const toggleSchema = z.object({
  addon_key: z.string().min(1),
  enabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = toggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { addon_key, enabled } = parsed.data;
  const orgId = membership.organization_id;

  if (enabled) {
    const { error } = await supabase.from("organization_addons").upsert(
      {
        organization_id: orgId,
        addon_key,
        enabled: true,
        activated_by: user.id,
        activated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,addon_key" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("organization_addons")
      .update({ enabled: false })
      .eq("organization_id", orgId)
      .eq("addon_key", addon_key);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
