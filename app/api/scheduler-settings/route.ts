import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

  const body = await request.json();

  // Validate fields
  const update: Record<string, unknown> = {};
  if (body.start_hour !== undefined) {
    const h = Number(body.start_hour);
    if (h >= 0 && h <= 23) update.start_hour = h;
  }
  if (body.end_hour !== undefined) {
    const h = Number(body.end_hour);
    if (h >= 1 && h <= 24) update.end_hour = h;
  }
  if (body.intervals !== undefined && Array.isArray(body.intervals)) {
    const valid = body.intervals.filter((v: number) => [15, 20, 30, 45, 60].includes(v));
    if (valid.length > 0) update.intervals = valid;
  }
  if (body.time_indicator !== undefined) {
    update.time_indicator = Boolean(body.time_indicator);
  }
  if (body.disabled_weekdays !== undefined && Array.isArray(body.disabled_weekdays)) {
    const valid = body.disabled_weekdays.filter((v: number) => v >= 0 && v <= 6);
    update.disabled_weekdays = valid;
  }

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
