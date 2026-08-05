import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import {
  assertActiveMembership,
  resolveActiveOrg,
} from "@/lib/followups/org-scope";

const followupSchema = z.object({
  // Org activa del cliente. Opcional: sin ella se cae al fallback de
  // primera membresía (ver lib/followups/org-scope.ts).
  organization_id: z.string().uuid().optional(),
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  clinical_note_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["red", "yellow", "green"]),
  reason: z.string().min(1).max(500),
  follow_up_date: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const patientId = request.nextUrl.searchParams.get("patient_id");
  const showResolved = request.nextUrl.searchParams.get("show_resolved") === "true";
  const priority = request.nextUrl.searchParams.get("priority");
  const orgId = request.nextUrl.searchParams.get("org_id");

  if (orgId) {
    const denied = await assertActiveMembership(supabase, user.id, orgId);
    if (denied) return denied;
  }

  let query = supabase
    .from("clinical_followups")
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .order("created_at", { ascending: false });

  // Sin `org_id` no se filtra por organización, como hasta ahora: el RLS
  // acota a las orgs del usuario y un usuario de una sola org ve lo mismo.
  if (orgId) query = query.eq("organization_id", orgId);
  if (patientId) query = query.eq("patient_id", patientId);
  if (!showResolved) query = query.eq("is_resolved", false);
  if (priority) query = query.eq("priority", priority);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = generalLimiter(user.id);
  if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = followupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });

  const { organization_id: requestedOrgId, ...followupData } = parsed.data;
  const org = await resolveActiveOrg(supabase, user.id, requestedOrgId ?? null);
  if (org.error) return org.error;
  const organizationId = org.organizationId;

  // mig 184 — origen polimórfico. Este endpoint solo lo usa el panel de
  // historia clínica (app/(dashboard)/patients/clinical-followups-panel.tsx),
  // que manda `appointment_id` y `clinical_note_id` cuando el panel se
  // abre desde una cita o desde una nota, y ambos null cuando el
  // usuario lo crea suelto desde la ficha del paciente.
  //
  // La prioridad appointment > clinical_note > manual es la MISMA que
  // usa el backfill de la mig 184, para que una fila creada hoy y una
  // backfilleada de ayer con los mismos ids acaben con el mismo origen.
  const sourceType = followupData.appointment_id
    ? "appointment"
    : followupData.clinical_note_id
      ? "clinical_note"
      : "manual";
  const sourceId =
    followupData.appointment_id ?? followupData.clinical_note_id ?? null;

  const { data, error } = await supabase
    .from("clinical_followups")
    .insert({
      ...followupData,
      organization_id: organizationId,
      source_type: sourceType,
      source_id: sourceId,
    })
    .select("*, doctors(full_name), patients(first_name, last_name, phone)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logClinicalAccess({
    organizationId,
    userId: user.id,
    resourceType: "appointment",
    action: "create",
    patientId: parsed.data.patient_id,
    resourceId: data?.id ?? null,
    metadata: {
      kind: "clinical_followup",
      priority: parsed.data.priority,
    },
  });

  return NextResponse.json({ data }, { status: 201 });
}
