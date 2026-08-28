import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { META_API_VERSION, META_BASE_URL } from "@/lib/whatsapp/client";
import { upsertWhatsAppConfig } from "@/lib/whatsapp/config-store";
import { z } from "zod";

/**
 * POST /api/whatsapp/embedded-signup
 *
 * Cierre servidor del Embedded Signup de Meta (flujo "Conectar con
 * Facebook"): el browser ya corrió FB.login + sessionInfoListener y nos
 * entrega el `code` de un solo uso junto con waba_id/phone_number_id.
 * Aquí, con el META_APP_SECRET (que JAMÁS sale del servidor):
 *
 *   1. Intercambiamos el code por el business token del cliente
 *      (larga duración, scoped a su WABA).
 *   2. Suscribimos nuestra app a los webhooks de esa WABA — sin esto
 *      los mensajes entrantes nunca llegan a /api/whatsapp/webhook.
 *   3. Verificamos que el phone_number_id pertenece a la WABA y
 *      extraemos display_phone_number + verified_name.
 *   4. Registramos el número en Cloud API (PIN de 6 dígitos generado
 *      aquí). BEST-EFFORT: en Coexistence el número ya está activo en
 *      la app del celular y el register puede fallar o no aplicar —
 *      guardamos la conexión igual con registration_status='pending'
 *      y devolvemos un warning, nunca rompemos el onboarding.
 *   5. Guardamos todo en whatsapp_config por el MISMO camino que el
 *      wizard manual (lib/whatsapp/config-store.ts — token y PIN
 *      cifrados). Reconectar sobreescribe la config existente.
 */

const bodySchema = z.object({
  code: z.string().min(1),
  waba_id: z.string().min(1),
  phone_number_id: z.string().min(1),
  coexistence: z.boolean().optional().default(true),
});

export const runtime = "nodejs";

interface GraphError {
  error?: { message?: string; code?: number; error_user_msg?: string };
}

/** Llamada a Graph API que devuelve el JSON o lanza con mensaje de Meta. */
async function graphFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok) {
    const message =
      data?.error?.error_user_msg || data?.error?.message || `Meta API ${res.status}`;
    const err = new Error(message) as Error & { metaCode?: number };
    err.metaCode = data?.error?.code;
    throw err;
  }
  return data;
}

/** Mismo formato que el wizard manual (whatsapp-wizard.tsx). */
function generateVerifyToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "El Embedded Signup no está configurado en este entorno." },
      { status: 501 }
    );
  }

  const supabase = await createClient();

  // Misma autorización que /api/whatsapp/config: solo owner/admin de la org.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { code, waba_id, phone_number_id, coexistence } = parsed.data;

  // ── 1. Code → business token del cliente ──────────────────────────
  let accessToken: string;
  try {
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);
    const tokenData = await graphFetch<{ access_token: string }>(tokenUrl.toString());
    accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("Meta no devolvió access_token");
  } catch (e) {
    // El code caduca en ~30 s y es de un solo uso: el retry correcto es
    // volver a abrir el popup, no reintentar este POST.
    return NextResponse.json(
      {
        error:
          "No pudimos validar la autorización con Meta. Vuelve a intentar la conexión con Facebook.",
        detail: e instanceof Error ? e.message : undefined,
      },
      { status: 502 }
    );
  }

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  // ── 2. Suscribir la app a los webhooks de la WABA del cliente ─────
  try {
    await graphFetch(`${META_BASE_URL}/${waba_id}/subscribed_apps`, {
      method: "POST",
      headers: authHeaders,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "Meta autorizó la cuenta pero no pudimos suscribirla a las notificaciones de mensajes. Vuelve a intentar.",
        detail: e instanceof Error ? e.message : undefined,
      },
      { status: 502 }
    );
  }

  // ── 3. Confirmar que el número pertenece a la WABA ────────────────
  let displayPhoneNumber: string | null = null;
  let verifiedName: string | null = null;
  try {
    const phones = await graphFetch<{
      data: Array<{ id: string; display_phone_number?: string; verified_name?: string }>;
    }>(
      `${META_BASE_URL}/${waba_id}/phone_numbers?fields=id,display_phone_number,verified_name`,
      { headers: authHeaders }
    );
    const phone = phones.data?.find((p) => p.id === phone_number_id);
    if (!phone) {
      return NextResponse.json(
        { error: "El número elegido no pertenece a la cuenta de WhatsApp autorizada." },
        { status: 400 }
      );
    }
    displayPhoneNumber = phone.display_phone_number ?? null;
    verifiedName = phone.verified_name ?? null;
  } catch (e) {
    return NextResponse.json(
      {
        error: "No pudimos verificar el número con Meta. Vuelve a intentar.",
        detail: e instanceof Error ? e.message : undefined,
      },
      { status: 502 }
    );
  }

  // ── 4. Register en Cloud API (best-effort) ────────────────────────
  // randomInt es cripto-seguro; padStart conserva ceros a la izquierda.
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  let registrationStatus: "registered" | "pending" = "registered";
  let warning: string | undefined;
  try {
    await graphFetch(`${META_BASE_URL}/${phone_number_id}/register`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
  } catch (e) {
    // En Coexistence el número ya está activo en la app del celular y
    // este paso puede fallar o no aplicar: la conexión se guarda igual.
    registrationStatus = "pending";
    warning = coexistence
      ? "Tu número quedó conectado. El registro en Cloud API quedó pendiente (normal cuando mantienes la app de WhatsApp Business); si el envío falla, contáctanos."
      : "Tu número quedó conectado, pero el registro en Cloud API quedó pendiente. Si el envío falla, contáctanos.";
    console.error(
      "[whatsapp/embedded-signup] register best-effort falló:",
      e instanceof Error ? e.message : e
    );
  }

  // ── 5. Guardar por el camino único (cifrado incluido) ─────────────
  // Conservamos el webhook_verify_token existente si la org ya tenía uno
  // (está pegado en la consola de Meta); si no, generamos uno nuevo.
  const { data: existing } = await supabase
    .from("whatsapp_config")
    .select("webhook_verify_token")
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  const { data: saved, error: saveError } = await upsertWhatsAppConfig(
    supabase,
    member.organization_id,
    {
      waba_id,
      phone_number_id,
      access_token: accessToken,
      webhook_verify_token: existing?.webhook_verify_token || generateVerifyToken(),
      is_active: true,
      business_verified: true,
      connected_via: "embedded_signup",
      coexistence,
      register_pin: pin,
      registration_status: registrationStatus,
      display_phone_number: displayPhoneNumber,
      verified_name: verifiedName,
    }
  );

  if (saveError || !saved) {
    return NextResponse.json(
      { error: saveError?.message || "No se pudo guardar la configuración." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    display_phone_number: displayPhoneNumber,
    verified_name: verifiedName,
    registration_status: registrationStatus,
    coexistence,
    warning,
  });
}
