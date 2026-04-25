// Tests provided credentials against the e-invoice provider WITHOUT
// persisting them. Used by the connect wizard to validate before save.
//
// Strategy: query a known-non-existent invoice (FFF1-999999). The
// provider responds with "not found" (Nubefact code 24) when credentials
// are valid → that's our "ok" signal. Other errors (10=invalid token,
// 11=invalid route, network, etc.) mean the credentials don't work.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/einvoice";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: z.enum(["nubefact"]).default("nubefact"),
  mode: z.enum(["sandbox", "production"]).default("sandbox"),
  route: z.string().url(),
  token: z.string().min(20),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { provider: providerName, mode, route, token } = parsed.data;
  const provider = getProvider(providerName);
  const result = await provider.query(
    { route, token, mode },
    1,
    "FFF1",
    999999
  );

  // Code 24 = not found in Nubefact = credentials work, doc just doesn't
  // exist (which is what we want — it would never exist).
  if (result.ok || (result.error && result.error.code === "24")) {
    return NextResponse.json({ ok: true });
  }

  // Map common errors to user-friendly Spanish messages.
  const code = result.error?.code ?? "unknown";
  let userMessage: string;
  switch (code) {
    case "10":
      userMessage = "Token incorrecto o eliminado. Verifica el token en tu panel de Nubefact.";
      break;
    case "11":
      userMessage = "La RUTA no es válida. Verifica que copiaste la URL completa desde tu panel de Nubefact (sección API/Integración).";
      break;
    case "network":
      userMessage = "No pudimos conectar con Nubefact. Verifica tu conexión a internet.";
      break;
    default:
      userMessage = result.error?.message ?? "Error desconocido al conectar con Nubefact.";
  }

  return NextResponse.json({
    ok: false,
    error: userMessage,
    code,
  });
}
