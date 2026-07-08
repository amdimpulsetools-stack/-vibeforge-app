import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlanLimit, planLimitErrorBody } from "@/lib/plan/check-limit";
import { generalLimiter } from "@/lib/rate-limit";

// ──────────────────────────────────────────────────────────────────
// POST /api/doctors/self — "Yo también atiendo pacientes"
//
// Crea el perfil de doctor del PROPIO owner/admin (fila en `doctors`
// vinculada a su user_id). Hasta ahora la única vía para crear un
// doctor era invitar a un miembro con rol doctor, lo que dejaba al
// dueño-doctor (la persona del plan Independiente) sin poder
// seleccionarse como médico de una cita — habría tenido que
// invitarse a sí mismo con un segundo email.
//
// Separa dos conceptos: el ROL de cuenta (owner/admin = permisos) y
// el PERFIL de profesional (fila en doctors = recurso agendable).
// La fila cuenta contra `max_doctors` vía get_org_usage (que cuenta
// doctors activos), así que el pricing por plan queda intacto:
// en Independiente el owner ocupa su único cupo de doctor; en Centro
// Médico ocupa 1 de 3. Mismo soft-wall 402 que /api/members.
// ──────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  cmp: z.string().trim().max(20).optional(),
  specialty: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes" },
      { status: 429 },
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Body vacío es válido — todos los campos son opcionales.
  }
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sin organización" }, { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Solo el dueño o un administrador pueden crear su propio perfil de doctor" },
      { status: 403 },
    );
  }

  const orgId = membership.organization_id;
  const supabaseAdmin = createAdminClient();

  // ¿Ya tiene perfil de doctor en esta org? (unique parcial de mig 135)
  const { data: existing } = await supabaseAdmin
    .from("doctors")
    .select("id, is_active")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "already_doctor", doctor_id: existing.id },
      { status: 409 },
    );
  }

  // Soft-wall del plan: el perfil propio consume un cupo de doctor
  // igual que uno invitado. En Independiente (1 doctor) el owner
  // ocupa su cupo; nada se regala en planes superiores.
  const limitCheck = await checkPlanLimit(orgId, "doctors");
  if (!limitCheck.ok) {
    return NextResponse.json(planLimitErrorBody(limitCheck), { status: 402 });
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const fullName =
    profile?.full_name?.trim() || user.email?.split("@")[0] || "Doctor";

  // cmp es NOT NULL UNIQUE — mismo placeholder que el flujo de
  // invitación de miembros cuando aún no se conoce el número real.
  const cmp =
    parsed.data.cmp && parsed.data.cmp.length > 0
      ? parsed.data.cmp
      : `PEND-${crypto.randomUUID().slice(0, 8)}`;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("doctors")
    .insert({
      full_name: fullName,
      cmp,
      specialty: parsed.data.specialty ?? null,
      organization_id: orgId,
      user_id: user.id,
      is_active: true,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // 23505 = unique_violation (cmp duplicado o carrera en user/org).
    if (insertErr?.code === "23505") {
      return NextResponse.json(
        { error: "CMP ya registrado u operación duplicada" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: insertErr?.message ?? "No se pudo crear el perfil de doctor" },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
