// Returns the current org's e-invoice integration status (for the UI
// card on Settings → Integraciones). Never exposes encrypted secrets.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.organization_id) {
    return NextResponse.json({ connected: false });
  }

  const { data: cfgRaw } = await supabase
    .from("einvoice_configs")
    .select(
      "provider, mode, is_active, ruc, legal_name, fiscal_address, ubigeo, " +
        "default_currency, default_igv_percent, auto_emit_on_payment, auto_send_email, " +
        "last_error, last_error_at, last_success_at, connected_at"
    )
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  const cfg = cfgRaw as unknown as {
    provider: string;
    mode: "sandbox" | "production";
    is_active: boolean;
    ruc: string | null;
    legal_name: string | null;
    fiscal_address: string | null;
    ubigeo: string | null;
    default_currency: "PEN" | "USD";
    default_igv_percent: number;
    auto_emit_on_payment: boolean;
    auto_send_email: boolean;
    last_error: string | null;
    last_error_at: string | null;
    last_success_at: string | null;
    connected_at: string;
  } | null;

  if (!cfg || !cfg.is_active) {
    return NextResponse.json({ connected: false });
  }

  // Series belonging to this org
  const { data: series } = await supabase
    .from("einvoice_series")
    .select("doc_type, series, current_number, is_default, is_active")
    .eq("organization_id", membership.organization_id)
    .order("doc_type")
    .order("series");

  return NextResponse.json({
    connected: true,
    config: {
      provider: cfg.provider,
      mode: cfg.mode,
      ruc: cfg.ruc,
      legal_name: cfg.legal_name,
      fiscal_address: cfg.fiscal_address,
      ubigeo: cfg.ubigeo,
      default_currency: cfg.default_currency,
      default_igv_percent: cfg.default_igv_percent,
      auto_emit_on_payment: cfg.auto_emit_on_payment,
      auto_send_email: cfg.auto_send_email,
      last_error: cfg.last_error,
      last_error_at: cfg.last_error_at,
      last_success_at: cfg.last_success_at,
      connected_at: cfg.connected_at,
    },
    series: series ?? [],
  });
}
