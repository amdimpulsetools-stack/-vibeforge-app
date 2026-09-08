import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logClinicalAccess } from "@/lib/audit/clinical-access";
import { resolveDisplayName } from "@/lib/scheduler/display-name";

export const runtime = "nodejs";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const createSchema = z
  .object({
    org_id: z.string().uuid(),
    block_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    all_day: z.boolean(),
    start_time: z.string().regex(HHMM).nullable().optional(),
    end_time: z.string().regex(HHMM).nullable().optional(),
    office_id: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (b) => b.all_day || (!!b.start_time && !!b.end_time && b.start_time < b.end_time),
    { message: "start_time must be before end_time" }
  );

/**
 * POST /api/scheduler/blocks — crea un bloqueo de agenda (mig 254).
 *
 * Antes el diálogo insertaba directo desde el cliente y `created_by` quedaba
 * NULL. Ahora pasa por aquí para estampar autor + nombre y dejar la fila
 * "Bloqueo de agenda · Crear" en clinical_access_log (insert solo con
 * service role). RLS sigue mandando en el insert: cualquier miembro activo
 * de la org puede bloquear, igual que antes.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const b = parsed.data;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", b.org_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const createdByName = await resolveDisplayName(supabase, user);

  const { data: row, error } = await supabase
    .from("schedule_blocks")
    .insert({
      organization_id: b.org_id,
      block_date: b.block_date,
      all_day: b.all_day,
      start_time: b.all_day ? null : b.start_time,
      end_time: b.all_day ? null : b.end_time,
      office_id: b.office_id ?? null,
      reason: b.reason || null,
      created_by: user.id,
      created_by_name: createdByName,
    } as Record<string, unknown>)
    .select("id, block_date, start_time, end_time, office_id, all_day, reason, organization_id, created_at, created_by_name")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }

  logClinicalAccess({
    organizationId: b.org_id,
    userId: user.id,
    resourceType: "schedule_block",
    action: "create",
    resourceId: row.id,
    metadata: {
      block_date: b.block_date,
      all_day: b.all_day,
      start_time: b.all_day ? null : b.start_time,
      end_time: b.all_day ? null : b.end_time,
      office_id: b.office_id ?? null,
      reason: b.reason || null,
      created_by_name: createdByName,
    },
  });

  return NextResponse.json(row);
}
