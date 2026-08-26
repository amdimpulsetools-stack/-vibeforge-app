import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { z } from "zod";

// Conexión Culqi (Cobros al paciente — F1). Mismo patrón que
// /api/whatsapp/config: el secret se guarda cifrado con lib/encryption
// (AES-256-GCM) y NUNCA vuelve al cliente — ni siquiera enmascarado
// completo: GET solo devuelve {connected, public_key, enabled}.
//
// La tabla `culqi_config` tiene RLS solo owner/admin. El GET usa el
// admin client DESPUÉS de verificar membresía porque cualquier miembro
// (recepcionista incluida) necesita saber si la org tiene Culqi
// conectado para habilitar el botón "Cobrar por link" — el public_key
// es público por diseño (va en el checkout del navegador) y el enabled
// es un booleano sin secretos.

const culqiConfigSchema = z.object({
  public_key: z.string().trim().min(1),
  // "••••••••" = centinela del form de edición: conserva el secret ya
  // guardado (igual que access_token en whatsapp/config).
  secret_key: z.string().trim().min(1),
  enabled: z.boolean(),
});

export const runtime = "nodejs";

const SECRET_SENTINEL = "••••••••";

interface CulqiConfigRow {
  organization_id: string;
  public_key: string;
  secret_key_encrypted: string;
  enabled: boolean;
  connected_by: string | null;
  connected_at: string;
  updated_at: string;
}

async function getMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, member: null };

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  return { user, member };
}

/**
 * GET /api/culqi-config
 * Estado de la conexión para cualquier miembro de la org.
 * Devuelve {connected, public_key, enabled} — SIN el secret.
 */
export async function GET() {
  const { user, member } = await getMember();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!member) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("culqi_config")
    .select("public_key, enabled")
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  const row = data as Pick<CulqiConfigRow, "public_key" | "enabled"> | null;

  return NextResponse.json({
    connected: !!row,
    public_key: row?.public_key ?? null,
    enabled: row?.enabled ?? false,
  });
}

/**
 * PUT /api/culqi-config
 * Crea o actualiza la conexión. Solo owner/admin.
 * Valida prefijos pk_/sk_ y que ambas llaves sean del mismo ambiente.
 */
export async function PUT(req: NextRequest) {
  const { user, member } = await getMember();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
  }

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

  const { public_key, secret_key, enabled } = parsed.data;

  if (!/^pk_(test|live)_/.test(public_key)) {
    return NextResponse.json(
      { error: "La llave pública debe empezar con pk_test_ o pk_live_." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const keepSecret = secret_key === SECRET_SENTINEL;

  const { data: existingData } = await admin
    .from("culqi_config")
    .select("organization_id, public_key")
    .eq("organization_id", member.organization_id)
    .maybeSingle();
  const existing = existingData as Pick<
    CulqiConfigRow,
    "organization_id" | "public_key"
  > | null;

  if (keepSecret && !existing) {
    return NextResponse.json(
      { error: "Ingresa la llave secreta." },
      { status: 400 }
    );
  }

  const pkEnv = public_key.startsWith("pk_live_") ? "live" : "test";

  if (!keepSecret) {
    if (!/^sk_(test|live)_/.test(secret_key)) {
      return NextResponse.json(
        { error: "La llave secreta debe empezar con sk_test_ o sk_live_." },
        { status: 400 }
      );
    }
    const skEnv = secret_key.startsWith("sk_live_") ? "live" : "test";
    if (pkEnv !== skEnv) {
      return NextResponse.json(
        {
          error:
            "Ambas llaves deben ser del mismo ambiente: pk_test_ con sk_test_, o pk_live_ con sk_live_.",
        },
        { status: 400 }
      );
    }
  } else if (existing) {
    // Se conserva el secret guardado: no permitas cambiar el ambiente
    // de la llave pública sin re-ingresar la secreta correspondiente.
    const prevEnv = existing.public_key?.startsWith("pk_live_")
      ? "live"
      : "test";
    if (prevEnv !== pkEnv) {
      return NextResponse.json(
        {
          error:
            "Cambiaste el ambiente de la llave pública: vuelve a ingresar la llave secreta del mismo ambiente.",
        },
        { status: 400 }
      );
    }
  }

  const payload: Record<string, unknown> = {
    organization_id: member.organization_id,
    public_key,
    enabled,
    updated_at: new Date().toISOString(),
  };
  if (!keepSecret) {
    payload.secret_key_encrypted = encrypt(secret_key);
  }
  if (!existing) {
    payload.connected_by = user.id;
    payload.connected_at = new Date().toISOString();
  }

  const { error } = await admin
    .from("culqi_config")
    .upsert(payload, { onConflict: "organization_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    connected: true,
    public_key,
    enabled,
  });
}

/**
 * DELETE /api/culqi-config
 * Desconecta Culqi: elimina la fila (secret cifrado incluido). Los
 * payment_links existentes se conservan para auditoría — sin config,
 * la página pública de pago rechaza el checkout por su propio guard.
 */
export async function DELETE() {
  const { user, member } = await getMember();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("culqi_config")
    .delete()
    .eq("organization_id", member.organization_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
