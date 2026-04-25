// Connect / update e-invoice integration for the current org.
//
// Saves provider credentials (route + token) encrypted, plus the org's
// fiscal data (RUC, legal name, etc.) and at least one series. Idempotent:
// re-calling overwrites the existing config (treated as "edit").
//
// Auth: only owners/admins of the org can connect/edit.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { getProvider, type DocTypeCode } from "@/lib/einvoice";

export const runtime = "nodejs";

const seriesSchema = z.object({
  doc_type: z.number().int().min(1).max(4),
  series: z.string().length(4),
  current_number: z.number().int().min(0).default(0),
  is_default: z.boolean().default(false),
});

const bodySchema = z.object({
  // Fiscal data
  ruc: z.string().regex(/^\d{11}$/, "RUC debe ser 11 dígitos"),
  legal_name: z.string().min(1).max(200),
  trade_name: z.string().max(200).optional().nullable(),
  fiscal_address: z.string().min(1).max(500),
  ubigeo: z.string().regex(/^\d{6}$/, "UBIGEO debe ser 6 dígitos").optional().nullable(),

  // Provider credentials
  provider: z.enum(["nubefact"]).default("nubefact"),
  mode: z.enum(["sandbox", "production"]).default("sandbox"),
  route: z.string().url(),
  token: z.string().min(20),

  // Series
  series: z.array(seriesSchema).min(1, "Debes registrar al menos una serie"),

  // Preferences
  default_currency: z.enum(["PEN", "USD"]).default("PEN"),
  default_igv_percent: z.number().min(0).max(100).default(18),
  auto_emit_on_payment: z.boolean().default(false),
  auto_send_email: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
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
    return NextResponse.json(
      { error: "Solo el owner o admin de la clínica puede conectar facturación." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const admin = createAdminClient();

  // Upsert config — idempotent on (organization_id)
  const { error: cfgErr } = await admin
    .from("einvoice_configs")
    .upsert(
      {
        organization_id: membership.organization_id,
        connected_by_user_id: user.id,
        provider: data.provider,
        mode: data.mode,
        is_active: true,
        ruc: data.ruc,
        legal_name: data.legal_name,
        trade_name: data.trade_name ?? null,
        fiscal_address: data.fiscal_address,
        ubigeo: data.ubigeo ?? null,
        provider_route_encrypted: encrypt(data.route),
        provider_token_encrypted: encrypt(data.token),
        default_currency: data.default_currency,
        default_igv_percent: data.default_igv_percent,
        auto_emit_on_payment: data.auto_emit_on_payment,
        auto_send_email: data.auto_send_email,
        last_error: null,
        last_error_at: null,
      },
      { onConflict: "organization_id" }
    );

  if (cfgErr) {
    return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  }

  // Sync series — replace strategy: delete missing, upsert provided.
  // Simpler than diffing for an admin-only mutation.
  const { data: existing } = await admin
    .from("einvoice_series")
    .select("doc_type, series")
    .eq("organization_id", membership.organization_id);

  const incomingKeys = new Set(
    data.series.map((s) => `${s.doc_type}|${s.series}`)
  );
  const toDelete = (existing ?? []).filter(
    (e) => !incomingKeys.has(`${e.doc_type}|${e.series}`)
  );

  if (toDelete.length > 0) {
    for (const s of toDelete) {
      await admin
        .from("einvoice_series")
        .delete()
        .eq("organization_id", membership.organization_id)
        .eq("doc_type", s.doc_type as DocTypeCode)
        .eq("series", s.series as string);
    }
  }

  // Ensure at most one default per (org, doc_type). If user marked >1 we
  // honor only the first per doc_type.
  const seenDefaults = new Set<number>();
  const seriesPayload = data.series.map((s) => {
    const isDefault = s.is_default && !seenDefaults.has(s.doc_type);
    if (isDefault) seenDefaults.add(s.doc_type);
    return {
      organization_id: membership.organization_id,
      doc_type: s.doc_type,
      series: s.series,
      current_number: s.current_number,
      is_default: isDefault,
      is_active: true,
    };
  });

  const { error: seriesErr } = await admin
    .from("einvoice_series")
    .upsert(seriesPayload, { onConflict: "organization_id,doc_type,series" });

  if (seriesErr) {
    return NextResponse.json({ error: seriesErr.message }, { status: 500 });
  }

  // Best-effort live test against the provider (1 query call to a dummy
  // doc — the failure mode "code 24 = not found" actually proves the
  // credentials work). We don't fail the connect if the test fails because
  // the user might be configuring a brand new account; we just record the
  // last_error so the UI can warn.
  void runConnectionTest(membership.organization_id);

  return NextResponse.json({ ok: true });
}

// Fire-and-forget background test — uses already-encrypted creds via the
// loadConfig path. Recorded as last_success_at / last_error.
async function runConnectionTest(organizationId: string) {
  try {
    const { loadConfig } = await import("@/lib/einvoice");
    const config = await loadConfig(organizationId);
    if (!config) return;

    const provider = getProvider(config.providerName);
    const result = await provider.query(config.credentials, 1, "FFF1", 999999);
    // 999999 should not exist → expect either ok=true with found=false (if
    // Nubefact returned its "not found" response) OR ok=true via code 24.
    // Anything else (auth error, network) → record.
    const admin = createAdminClient();
    if (result.error && result.error.code !== "24") {
      await admin
        .from("einvoice_configs")
        .update({
          last_error: `Connection test: ${result.error.message}`,
          last_error_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId);
    } else {
      await admin
        .from("einvoice_configs")
        .update({
          last_error: null,
          last_error_at: null,
          last_success_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId);
    }
  } catch (err) {
    console.error("[einvoice connect-test]", err);
  }
}
