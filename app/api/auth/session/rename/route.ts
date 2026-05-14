import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { renameSession } from "@/lib/auth/sessions";

/**
 * POST /api/auth/session/rename
 *
 * Lets the user replace the auto-derived device_label (eg.
 * "Chrome en macOS") with something they recognize ("Laptop de
 * recepción"). Cosmetic — does not affect enforcement.
 */

const schema = z.object({
  session_id: z.string().uuid(),
  label: z.string().min(1).max(60),
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
  const result = await renameSession(user.id, parsed.data.session_id, parsed.data.label);
  if (!result.ok) {
    return NextResponse.json({ error: "rename_failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
