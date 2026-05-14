import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listActiveSessions, getSessionLimitForUser } from "@/lib/auth/sessions";

/**
 * GET /api/auth/session/list
 *
 * Returns the calling user's active sessions plus their current
 * per-role limit. Used by /account/devices.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [sessions, limit] = await Promise.all([
    listActiveSessions(user.id),
    getSessionLimitForUser(user.id),
  ]);

  return NextResponse.json({
    limit,
    sessions: sessions.map((s) => ({
      id: s.id,
      device_id: s.device_id,
      device_label: s.device_label,
      ip_city: s.ip_city,
      ip_country: s.ip_country,
      last_seen_at: s.last_seen_at,
      created_at: s.created_at,
    })),
  });
}
