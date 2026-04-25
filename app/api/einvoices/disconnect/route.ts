// Disconnects the e-invoice integration for the current org.
// Soft delete — keeps historical comprobantes (`einvoices` rows) intact.
// Marks the config inactive and wipes credentials. Series stay so they
// can be reused if the org reconnects (their correlative numbers must
// continue from where they left off — SUNAT doesn't allow gaps).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  await admin
    .from("einvoice_configs")
    .update({
      is_active: false,
      provider_route_encrypted: null,
      provider_token_encrypted: null,
      last_error: null,
      last_error_at: null,
    })
    .eq("organization_id", membership.organization_id);

  return NextResponse.json({ ok: true });
}
