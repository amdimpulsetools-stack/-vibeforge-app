import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getEnabledCulqiConfig } from "@/lib/culqi/config";
import { generalLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";

const createLinkSchema = z.object({
  patient_id: z.string().uuid().nullish(),
  appointment_id: z.string().uuid().nullish(),
  amount: z.number().positive().max(99_999_999.99),
  concept: z.string().trim().min(1).max(200),
  expires_days: z.number().int().min(1).max(90).default(7),
});

/**
 * POST /api/payment-links — staff autenticado.
 * Crea un link de cobro Culqi para la org del usuario.
 * Responde { id, token, url } con url = "/pagar/" + token.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rl = generalLimiter(`payment-links:${user.id}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  // Membresía activa (mismo patrón que /api/whatsapp/config).
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = createLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // La org debe tener Culqi conectado y habilitado.
  const culqi = await getEnabledCulqiConfig(member.organization_id);
  if (!culqi) {
    return NextResponse.json(
      { error: "La clínica no tiene Culqi conectado o está deshabilitado." },
      { status: 400 }
    );
  }

  // El paciente/cita (si vienen) deben ser de la MISMA org — el client
  // del usuario ya limita por RLS, el .eq("organization_id") lo hace explícito.
  if (input.patient_id) {
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("id", input.patient_id)
      .eq("organization_id", member.organization_id)
      .maybeSingle();
    if (!patient) {
      return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
    }
  }
  if (input.appointment_id) {
    const { data: appointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("id", input.appointment_id)
      .eq("organization_id", member.organization_id)
      .maybeSingle();
    if (!appointment) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }
  }

  // Token URL-safe impredecible: 24 bytes crypto → 32 chars base64url.
  const token = randomBytes(24).toString("base64url");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + input.expires_days);

  const { data: link, error } = await supabase
    .from("payment_links")
    .insert({
      token,
      organization_id: member.organization_id,
      patient_id: input.patient_id ?? null,
      appointment_id: input.appointment_id ?? null,
      amount: Math.round(input.amount * 100) / 100,
      currency: "PEN",
      concept: input.concept,
      status: "pending",
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token")
    .single();

  if (error || !link) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo crear el link" },
      { status: 500 }
    );
  }

  const row = link as { id: string; token: string };
  return NextResponse.json({
    id: row.id,
    token: row.token,
    url: `/pagar/${row.token}`,
  });
}
