import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { REQUIRED_FIELD_KEYS } from "@/lib/scheduler-config";

const minuteOffset = z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(45)]);

// Sparse override map (mig 176). Keys are whitelisted from the single source
// of truth in lib/scheduler-config; unknown keys are rejected.
const requiredFieldsSchema = z.record(z.enum(REQUIRED_FIELD_KEYS), z.boolean());

const schedulerSettingsSchema = z.object({
  start_hour: z.number().int().min(0).max(23),
  end_hour: z.number().int().min(1).max(24),
  // Additive minute offsets on the hours (mig 175). Default 0 = whole-hour.
  start_minute: minuteOffset,
  end_minute: minuteOffset,
  intervals: z.array(z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60)])).min(1),
  time_indicator: z.boolean(),
  disabled_weekdays: z.array(z.number().int().min(0).max(6)),
  // Live status toggles (mig 171)
  live_status: z.boolean(),
  live_status_auto_close: z.boolean(),
  // Configurable required fields for the New Appointment modal (mig 176)
  required_fields: requiredFieldsSchema,
  // Duración editable por cita (mig 221). El PUT ya exige owner/admin más
  // abajo, que es exactamente quien puede encender el flag.
  allow_custom_duration: z.boolean(),
}).partial().refine(
  (d) => {
    // Cross-field: closing must be strictly after opening, at minute level.
    // Only enforceable when both hours are present in the patch; otherwise the
    // DB CHECK (scheduler_settings_window_valid) is the final guard.
    if (d.start_hour === undefined || d.end_hour === undefined) return true;
    const start = d.start_hour * 60 + (d.start_minute ?? 0);
    const end = d.end_hour * 60 + (d.end_minute ?? 0);
    return end > start;
  },
  { message: "end time must be after start time" },
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the caller's membership. When the client names the org
 * (org_id), the membership is validated IN that org — picking an
 * arbitrary membership with limit(1) reads/writes another org's
 * settings for multi-org users (the founder browsing a client's org
 * saw the toggle ON while that clinic's agenda had it OFF). The
 * no-org_id fallback keeps old clients working.
 */
async function resolveMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string | null
) {
  let query = supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (orgId) query = query.eq("organization_id", orgId);
  const { data } = await query.limit(1).maybeSingle();
  return data as { organization_id: string; role: string } | null;
}

// GET /api/scheduler-settings?org_id=… — load org's scheduler config
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawOrgId = new URL(request.url).searchParams.get("org_id");
  const orgId = rawOrgId && UUID_RE.test(rawOrgId) ? rawOrgId : null;

  const membership = await resolveMembership(supabase, user.id, orgId);

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 });
  }

  // Get or create settings
  let { data: settings } = await supabase
    .from("scheduler_settings")
    .select("*")
    .eq("organization_id", membership.organization_id)
    .single();

  if (!settings) {
    // Auto-create default settings
    const { data: created } = await supabase
      .from("scheduler_settings")
      .insert({ organization_id: membership.organization_id })
      .select()
      .single();
    settings = created;
  }

  return NextResponse.json(settings);
}

// PUT /api/scheduler-settings — update org's scheduler config
export async function PUT(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // org_id travels in the body (stripped before schema validation) so the
  // save lands in the org the user is LOOKING AT, not an arbitrary one.
  const rawOrgId = (body as { org_id?: unknown })?.org_id;
  const orgId =
    typeof rawOrgId === "string" && UUID_RE.test(rawOrgId) ? rawOrgId : null;

  // Check user is admin/owner IN that org
  const membership = await resolveMembership(supabase, user.id, orgId);

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 });
  }

  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = schedulerSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const update = parsed.data;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
  }

  // Window validity (closing strictly after opening, at minute level) is
  // enforced by the schema's cross-field refine above and the DB CHECK
  // constraint scheduler_settings_window_valid (mig 175).

  // Upsert
  const { data: existing } = await supabase
    .from("scheduler_settings")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("scheduler_settings")
      .update(update)
      .eq("organization_id", membership.organization_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } else {
    const { data, error } = await supabase
      .from("scheduler_settings")
      .insert({ organization_id: membership.organization_id, ...update })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }
}
