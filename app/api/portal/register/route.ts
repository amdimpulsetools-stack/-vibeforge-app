import { NextRequest, NextResponse } from "next/server";
import { getPortalSession, linkPatientToSession } from "@/lib/portal-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  slug: z.string().min(1),
  first_name: z.string().min(2).max(100),
  last_name: z.string().min(2).max(100),
  dni: z.string().min(4).max(20),
  phone: z.string().min(6).max(20),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { slug, first_name, last_name, dni, phone } = parsed.data;

  const session = await getPortalSession(slug);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (session.patient_id) {
    return NextResponse.json({ error: "already_registered" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const email = session.email.toLowerCase().trim();
  const trimmedDni = dni.trim();

  const { data: existingByDni } = await supabase
    .from("patients")
    .select("id, portal_email")
    .eq("organization_id", session.organization_id)
    .eq("dni", trimmedDni)
    .single();

  let patientId: string;

  if (existingByDni) {
    await supabase
      .from("patients")
      .update({
        portal_email: email,
        portal_phone: phone.trim(),
        portal_verified_at: new Date().toISOString(),
      })
      .eq("id", existingByDni.id);

    patientId = existingByDni.id;
  } else {
    const { data: newPatient, error } = await supabase
      .from("patients")
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        dni: trimmedDni,
        email: email,
        phone: phone.trim(),
        portal_email: email,
        portal_phone: phone.trim(),
        portal_verified_at: new Date().toISOString(),
        origin: "Portal del paciente",
        organization_id: session.organization_id,
      })
      .select("id")
      .single();

    if (error || !newPatient) {
      if (error?.code === "23505") {
        return NextResponse.json(
          { error: "Este documento de identidad ya está registrado." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Error al registrar" },
        { status: 500 }
      );
    }

    patientId = newPatient.id;
  }

  await linkPatientToSession(session.id, patientId);

  return NextResponse.json({ success: true, patient_id: patientId });
}
