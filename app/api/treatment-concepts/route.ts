import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generalLimiter } from "@/lib/rate-limit";
import { assertActiveMembership } from "@/lib/followups/org-scope";
import { assertFertilityAddon } from "@/lib/fertility/assert-fertility-addon";
import { normalizeSearchText } from "@/lib/utils";
import type { Database } from "@/types/database";
import type { TreatmentPaymentConcept } from "@/types/treatments";

/**
 * /api/treatment-concepts — catálogo de conceptos de pago de tratamiento
 * por org (mig 242). El `revenue_bucket` lo fija la dueña una vez desde
 * Admin; recepción solo elige el concepto al cobrar.
 *
 *  GET   ?org_id=[&all=1]  Miembros activos: solo conceptos activos.
 *                          `all=1` (owner/admin) incluye inactivos.
 *                          → `{ data: TreatmentPaymentConcept[] }`
 *  POST  ?org_id=          Admin: `{ label, revenue_bucket, igv_affectation?,
 *                          display_order? }`; `key` = slug del label, único
 *                          por org. → 201 `{ data }`
 *  POST  ?org_id=&seed=1   Admin: siembra el catálogo default (RPC
 *                          `seed_treatment_payment_concepts`, idempotente)
 *                          → `{ data: lista completa }`
 *  PATCH ?org_id=          Admin: `{ id, label?, revenue_bucket?,
 *                          igv_affectation?, display_order?, is_active? }`
 *                          → `{ data }`
 *
 * Escrituras con el cliente del USUARIO: las policies tpc_* (is_org_admin)
 * son la segunda barrera; aquí solo se devuelve un 403 legible antes.
 */

const BUCKETS = ["honorarium", "general", "third_party"] as const;
// Afectaciones SUNAT admitidas por el CHECK de la tabla.
const IGV_AFFECTATIONS = [1, 8, 9, 12, 16, 17, 20] as const;

const igvSchema = z
  .number()
  .int()
  .refine((v) => (IGV_AFFECTATIONS as readonly number[]).includes(v), "Afectación IGV inválida")
  .nullable()
  .optional();

const createSchema = z.object({
  label: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  revenue_bucket: z.enum(BUCKETS),
  igv_affectation: igvSchema,
  display_order: z.number().int().min(0).max(10000).optional(),
});

const patchSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(80).optional(),
    revenue_bucket: z.enum(BUCKETS).optional(),
    igv_affectation: igvSchema,
    display_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

type SupaClient = Awaited<ReturnType<typeof createClient>>;

type Access =
  | { error: NextResponse; supabase?: never; userId?: never; orgId?: never; isAdmin?: never }
  | { error?: never; supabase: SupaClient; userId: string; orgId: string; isAdmin: boolean };

/** slug estable a partir del label: "Honorarios — aspiración" → "honorarios_aspiracion". */
function slugify(label: string): string {
  return normalizeSearchText(label)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "concepto";
}

async function resolveAccess(request: NextRequest): Promise<Access> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  }
  const orgId = request.nextUrl.searchParams.get("org_id");
  if (!orgId) {
    return { error: NextResponse.json({ error: "Falta org_id" }, { status: 400 }) };
  }
  const denied = await assertActiveMembership(supabase, user.id, orgId);
  if (denied) return { error: denied };
  const noAddon = await assertFertilityAddon(supabase, orgId);
  if (noAddon) return { error: noAddon };

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();
  const role = (membership as { role: string } | null)?.role;
  return { supabase, userId: user.id, orgId, isAdmin: role === "owner" || role === "admin" };
}

async function listConcepts(supabase: SupaClient, orgId: string, includeInactive: boolean) {
  let query = supabase
    .from("treatment_payment_concepts")
    .select("*")
    .eq("organization_id", orgId)
    .order("display_order", { ascending: true })
    .order("label", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TreatmentPaymentConcept[];
}

export async function GET(request: NextRequest) {
  const access = await resolveAccess(request);
  if (access.error) return access.error;
  const wantsAll = request.nextUrl.searchParams.get("all") === "1" && access.isAdmin;
  try {
    const data = await listConcepts(access.supabase, access.orgId, wantsAll);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo listar los conceptos" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await resolveAccess(request);
  if (access.error) return access.error;
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Solo dirección puede administrar conceptos" }, { status: 403 });
  }

  const { supabase } = access;
  const rl = generalLimiter(access.userId);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  // Semilla del catálogo default (idempotente por (org, key)).
  if (request.nextUrl.searchParams.get("seed") === "1") {
    const { error: seedErr } = await supabase.rpc("seed_treatment_payment_concepts", {
      p_org_id: access.orgId,
    });
    if (seedErr) {
      return NextResponse.json({ error: seedErr.message }, { status: 500 });
    }
    const data = await listConcepts(supabase, access.orgId, true);
    return NextResponse.json({ data });
  }

  let input: z.infer<typeof createSchema>;
  try {
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const insert: Database["public"]["Tables"]["treatment_payment_concepts"]["Insert"] = {
    organization_id: access.orgId,
    key: slugify(input.label),
    label: input.label,
    revenue_bucket: input.revenue_bucket,
    igv_affectation: input.igv_affectation ?? null,
    display_order: input.display_order ?? 0,
  };
  const { data, error } = await supabase
    .from("treatment_payment_concepts")
    .insert(insert)
    .select("*")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Ya existe un concepto con ese nombre" }, { status: 409 });
    }
    if (error?.code === "42501") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    return NextResponse.json({ error: error?.message ?? "No se pudo crear" }, { status: 500 });
  }
  return NextResponse.json({ data: data as unknown as TreatmentPaymentConcept }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const access = await resolveAccess(request);
  if (access.error) return access.error;
  if (!access.isAdmin) {
    return NextResponse.json({ error: "Solo dirección puede administrar conceptos" }, { status: 403 });
  }

  let input: z.infer<typeof patchSchema>;
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { id, ...rest } = input;
  const update: Database["public"]["Tables"]["treatment_payment_concepts"]["Update"] = {};
  if (rest.label !== undefined) update.label = rest.label;
  if (rest.revenue_bucket !== undefined) update.revenue_bucket = rest.revenue_bucket;
  if (rest.igv_affectation !== undefined) update.igv_affectation = rest.igv_affectation;
  if (rest.display_order !== undefined) update.display_order = rest.display_order;
  if (rest.is_active !== undefined) update.is_active = rest.is_active;
  // La `key` NO se regenera al renombrar: los pagos ya cobrados referencian
  // el id, y la key es solo la identidad estable del seed.
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const rl = generalLimiter(access.userId);
  if (!rl.success) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const { data, error } = await access.supabase
    .from("treatment_payment_concepts")
    .update(update)
    .eq("id", id)
    .eq("organization_id", access.orgId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "42501") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Concepto no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ data: data as unknown as TreatmentPaymentConcept });
}
