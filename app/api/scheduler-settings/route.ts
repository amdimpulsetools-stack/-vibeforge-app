import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const schedulerSettingsSchema = z.object({
  start_hour: z.number().int().min(0).max(23),
  end_hour: z.number().int().min(1).max(24),
  intervals: z.array(z.union([z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60)])).min(1),
  time_indicator: z.boolean(),
  disabled_weekdays: z.array(z.number().int().min(0).max(6)),
}).partial();

// GET /api/scheduler-settings — load org's scheduler config
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get user's org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

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

  // Check user is admin/owner
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 404 });
  }

  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schedulerSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 });
  }

  const update = parsed.data;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_valid_fields" }, { status: 400 });
  }

  // Ensure start < end
  if (update.start_hour !== undefined && update.end_hour !== undefined) {
    if ((update.start_hour as number) >= (update.end_hour as number)) {
      return NextResponse.json({ error: "start_hour must be less than end_hour" }, { status: 400 });
    }
  }

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
