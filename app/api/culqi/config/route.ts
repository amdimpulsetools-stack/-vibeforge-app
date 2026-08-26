import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { saveCulqiConfig, deleteCulqiConfig, isTestPublicKey } from "@/lib/culqi/config";

export const runtime = "nodejs";

// Calcado de /api/whatsapp/config: GET/PUT/DELETE de la config de la
// org, solo owner/admin (la RLS de culqi_config lo refuerza en la BD).
// La secret key JAMÁS se devuelve — solo el marcador "••••••••".

const SECRET_MASK = "••••••••";

const culqiConfigSchema = z.object({
  public_key: z
    .string()
    .trim()
    .regex(/^pk_(test|live)_[A-Za-z0-9]+$/, "Public key inválida (pk_test_... o pk_live_...)"),
  secret_key: z
    .string()
    .trim()
    .min(1)
    .optional(),
  enabled: z.boolean().optional(),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();
  if (!member || !["owner", "admin"].includes(member.role)) {
    return { error: NextResponse.json({ error: "No tienes permisos" }, { status: 403 }) };
  }
  return { supabase, user, member };
}

/** GET /api/culqi/config — config de la org (secret key enmascarada). */
export async function GET() {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { supabase, member } = ctx;

  const { data: config } = await supabase
    .from("culqi_config")
    .select("public_key, enabled, connected_at, updated_at")
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  if (!config) return NextResponse.json(null);

  const row = config as {
    public_key: string;
    enabled: boolean;
    connected_at: string | null;
    updated_at: string | null;
  };
  return NextResponse.json({
    public_key: row.public_key,
    secret_key: SECRET_MASK,
    enabled: row.enabled,
    is_test: isTestPublicKey(row.public_key),
    connected_at: row.connected_at,
    updated_at: row.updated_at,
  });
}

/** PUT /api/culqi/config — conecta/actualiza la cuenta Culqi de la org. */
export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { supabase, user, member } = ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = culqiConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // "••••••••" = mantener la secret key ya guardada (patrón WhatsApp).
  const secretKey =
    input.secret_key && input.secret_key !== SECRET_MASK ? input.secret_key : undefined;

  if (secretKey !== undefined) {
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) {
      return NextResponse.json(
        { error: "Secret key inválida (sk_test_... o sk_live_...)" },
        { status: 400 }
      );
    }
    const pkTest = isTestPublicKey(input.public_key);
    const skTest = secretKey.startsWith("sk_test_");
    if (pkTest !== skTest) {
      return NextResponse.json(
        { error: "Las llaves no coinciden: una es de prueba (test) y la otra de producción (live)." },
        { status: 400 }
      );
    }
  } else {
    // Sin secret key nueva: solo válido si ya hay config guardada.
    const { data: existing } = await supabase
      .from("culqi_config")
      .select("organization_id")
      .eq("organization_id", member.organization_id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json(
        { error: "Ingresa la llave secreta para conectar Culqi." },
        { status: 400 }
      );
    }
  }

  const { error } = await saveCulqiConfig(supabase, {
    organizationId: member.organization_id,
    publicKey: input.public_key,
    secretKey,
    enabled: input.enabled,
    connectedBy: secretKey !== undefined ? user.id : undefined,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/culqi/config — desvincula la cuenta Culqi (borra llaves). */
export async function DELETE() {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  const { supabase, member } = ctx;

  const { error } = await deleteCulqiConfig(supabase, member.organization_id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
