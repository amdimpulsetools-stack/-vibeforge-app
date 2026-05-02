import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import {
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
} from "@/types/fertility";

interface FertilitySettings {
  delay_days_first_consultation: number;
  delay_days_second_consultation: number;
  delay_days_budget_acceptance: number;
  max_attempts: number;
  auto_contact_time: string;
  auto_send_email: boolean;
  auto_send_whatsapp: boolean;
  default_message_tone: "amable" | "directo";
  ltv_promedio_paciente: number;
}

const DEFAULTS: FertilitySettings = {
  delay_days_first_consultation: 21,
  delay_days_second_consultation: 14,
  delay_days_budget_acceptance: 7,
  max_attempts: 3,
  auto_contact_time: "08:00",
  auto_send_email: true,
  auto_send_whatsapp: true,
  default_message_tone: "amable",
  ltv_promedio_paciente: 5000,
};

const SettingsSchema = z.object({
  delay_days_first_consultation: z.number().int().min(5).max(60),
  delay_days_second_consultation: z.number().int().min(5).max(60),
  delay_days_budget_acceptance: z.number().int().min(3).max(30),
  max_attempts: z.number().int().min(1).max(10),
  auto_contact_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/u, "Formato inválido (HH:MM)"),
  auto_send_email: z.boolean(),
  auto_send_whatsapp: z.boolean(),
  default_message_tone: z.enum(["amable", "directo"]),
  ltv_promedio_paciente: z.number().nonnegative().max(1_000_000),
});

const FERTILITY_ADDON_KEYS = [
  FERTILITY_PREMIUM_KEY,
  FERTILITY_BASIC_KEY,
] as const;

/**
 * GET /api/admin/fertility/settings
 *
 * Devuelve los settings del addon fertility para la organización del
 * usuario. Si no hay row en organization_addons, devuelve los defaults.
 * Cualquier miembro activo puede leer.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 }
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }

  const settings = await loadFertilitySettings(
    supabase,
    membership.organization_id
  );

  return NextResponse.json(settings);
}

/**
 * PUT /api/admin/fertility/settings
 *
 * Solo owner/admin. Persiste los settings (merge) en organization_addons.settings
 * del addon fertility activo. Sincroniza followup_rules.delay_days cuando
 * cambian los plazos para que el cron lea el valor correcto.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 }
    );
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "No perteneces a una organización activa" },
      { status: 403 }
    );
  }
  if (!["owner", "admin"].includes(membership.role)) {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador puede editar la configuración" },
      { status: 403 }
    );
  }
  const orgId = membership.organization_id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }
  const incoming = parsed.data;

  // Determine which fertility tier is enabled. Premium wins if both are
  // somehow active (the tier_group constraint should prevent this).
  const { data: enabledRows } = await supabase
    .from("organization_addons")
    .select("addon_key, settings, enabled")
    .eq("organization_id", orgId)
    .in("addon_key", FERTILITY_ADDON_KEYS as readonly string[]);

  const enabledRow =
    (enabledRows ?? []).find(
      (r) => r.addon_key === FERTILITY_PREMIUM_KEY && r.enabled
    ) ??
    (enabledRows ?? []).find(
      (r) => r.addon_key === FERTILITY_BASIC_KEY && r.enabled
    ) ??
    (enabledRows ?? [])[0] ??
    null;

  if (!enabledRow) {
    return NextResponse.json(
      { error: "El addon de fertility no está activo en esta organización" },
      { status: 400 }
    );
  }

  const currentSettings = isObjectRecord(enabledRow.settings)
    ? enabledRow.settings
    : {};
  const merged = { ...currentSettings, ...incoming };

  const { error: upErr } = await supabase
    .from("organization_addons")
    .update({ settings: merged })
    .eq("organization_id", orgId)
    .eq("addon_key", enabledRow.addon_key);
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Sync followup_rules.delay_days so the cron reads from the rule.
  const ruleSyncs: Array<{ rule_key: string; delay_days: number }> = [
    {
      rule_key: "fertility.first_consultation_lapse",
      delay_days: incoming.delay_days_first_consultation,
    },
    {
      rule_key: "fertility.second_consultation_lapse",
      delay_days: incoming.delay_days_second_consultation,
    },
    {
      rule_key: "fertility.budget_pending_acceptance",
      delay_days: incoming.delay_days_budget_acceptance,
    },
  ];

  for (const sync of ruleSyncs) {
    const { error: ruleErr } = await supabase
      .from("followup_rules")
      .update({ delay_days: sync.delay_days })
      .eq("organization_id", orgId)
      .eq("rule_key", sync.rule_key);
    if (ruleErr) {
      // Non-fatal: settings were saved, but rule sync failed for this key.
      // We continue trying the rest. The cron will use the default until
      // a subsequent save propagates.
      continue;
    }
  }

  // Return canonical full shape (defaults filled).
  const fullSettings = mergeWithDefaults(merged);
  return NextResponse.json(fullSettings);
}

async function loadFertilitySettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string
): Promise<FertilitySettings> {
  const { data: rows } = await supabase
    .from("organization_addons")
    .select("addon_key, settings, enabled")
    .eq("organization_id", organizationId)
    .in("addon_key", FERTILITY_ADDON_KEYS as readonly string[]);

  if (!rows || rows.length === 0) {
    return { ...DEFAULTS };
  }

  const preferred =
    rows.find((r) => r.addon_key === FERTILITY_PREMIUM_KEY && r.enabled) ??
    rows.find((r) => r.addon_key === FERTILITY_BASIC_KEY && r.enabled) ??
    rows[0];

  const stored = isObjectRecord(preferred.settings) ? preferred.settings : {};
  return mergeWithDefaults(stored);
}

function mergeWithDefaults(stored: Record<string, unknown>): FertilitySettings {
  return {
    delay_days_first_consultation: numberOr(
      stored.delay_days_first_consultation,
      DEFAULTS.delay_days_first_consultation
    ),
    delay_days_second_consultation: numberOr(
      stored.delay_days_second_consultation,
      DEFAULTS.delay_days_second_consultation
    ),
    delay_days_budget_acceptance: numberOr(
      stored.delay_days_budget_acceptance,
      DEFAULTS.delay_days_budget_acceptance
    ),
    max_attempts: numberOr(stored.max_attempts, DEFAULTS.max_attempts),
    auto_contact_time:
      typeof stored.auto_contact_time === "string" &&
      /^([01]\d|2[0-3]):([0-5]\d)$/u.test(stored.auto_contact_time)
        ? stored.auto_contact_time
        : DEFAULTS.auto_contact_time,
    auto_send_email:
      typeof stored.auto_send_email === "boolean"
        ? stored.auto_send_email
        : DEFAULTS.auto_send_email,
    auto_send_whatsapp:
      typeof stored.auto_send_whatsapp === "boolean"
        ? stored.auto_send_whatsapp
        : DEFAULTS.auto_send_whatsapp,
    default_message_tone:
      stored.default_message_tone === "amable" ||
      stored.default_message_tone === "directo"
        ? stored.default_message_tone
        : DEFAULTS.default_message_tone,
    ltv_promedio_paciente: numberOr(
      stored.ltv_promedio_paciente,
      DEFAULTS.ltv_promedio_paciente
    ),
  };
}

function numberOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
