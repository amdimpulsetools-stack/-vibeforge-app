import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { revokeSession } from "@/lib/auth/sessions";

/**
 * POST /api/auth/session/revoke
 *
 * Closes a specific session. The reason field captures whether
 * this came from the user pressing "Cerrar sesión" on their
 * devices page (`user_explicit`) or from the limit-exceeded
 * modal choosing which one to drop (`limit_exceeded`).
 *
 * Idempotent — revoking an already-revoked session returns 200.
 *
 * Ownership is enforced inside revokeSession() so we don't have
 * to trust the body.
 */

const schema = z.object({
  session_id: z.string().uuid(),
  reason: z
    .enum(["user_explicit", "limit_exceeded"])
    .default("user_explicit"),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await revokeSession(
    user.id,
    parsed.data.session_id,
    parsed.data.reason,
  );

  if (!result.ok) {
    return NextResponse.json({ error: "revoke_failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
