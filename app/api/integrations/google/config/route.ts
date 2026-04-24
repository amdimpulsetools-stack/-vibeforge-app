// GET/PATCH the Google Calendar description customization for the current
// org. Only owners/admins can update. Reads are allowed to any org member
// so the UI can show current state regardless of role.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DESCRIPTION_FIELD_KEYS,
  normalizeConfig,
  type DescriptionFieldsConfig,
} from "@/lib/google-calendar-description";

export const runtime = "nodejs";

async function getOrg(userId: string): Promise<{ organizationId: string; role: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.organization_id) return null;
  return { organizationId: data.organization_id, role: data.role };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const org = await getOrg(user.id);
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 403 });

  const { data } = await supabase
    .from("google_calendar_integrations")
    .select("description_fields")
    .eq("organization_id", org.organizationId)
    .maybeSingle();

  const config = normalizeConfig(
    (data as { description_fields?: unknown } | null)?.description_fields
  );
  return NextResponse.json({ config });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const org = await getOrg(user.id);
  if (!org) return NextResponse.json({ error: "no_org" }, { status: 403 });
  if (!["owner", "admin"].includes(org.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const raw = (body as { config?: unknown })?.config;
  const config: DescriptionFieldsConfig = normalizeConfig(raw);

  // Only accept known keys — normalizeConfig already drops unknowns.
  const jsonPayload: Record<string, boolean> = {};
  for (const key of DESCRIPTION_FIELD_KEYS) {
    jsonPayload[key] = config[key];
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("google_calendar_integrations")
    .update({ description_fields: jsonPayload })
    .eq("organization_id", org.organizationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config });
}
