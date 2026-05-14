import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revokeAllSessions } from "@/lib/auth/sessions";

/**
 * POST /api/auth/session/revoke-all
 *
 * Closes every active session for the calling user. Optionally
 * keeps the current session alive (default: yes) so the user
 * isn't logged out of the device they're using to issue the
 * request.
 *
 * Reason is always `logout_all` for audit clarity.
 */

const schema = z.object({
  keep_current_session_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // body is optional — empty body means "revoke everything"
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await revokeAllSessions(
    user.id,
    "logout_all",
    parsed.data.keep_current_session_id,
  );

  return NextResponse.json({
    ok: result.ok,
    revoked_count: result.count,
  });
}
