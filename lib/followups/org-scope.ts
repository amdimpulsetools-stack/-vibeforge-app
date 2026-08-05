import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Scoping multi-org para el módulo de seguimientos.
 *
 * El patrón previo en estos endpoints resolvía la organización con
 * `organization_members … .limit(1).single()`. Sin ORDER BY eso elige una
 * membresía ARBITRARIA: para un médico invitado a dos clínicas Postgres
 * puede devolver cualquiera de las dos, así que la API terminaba leyendo
 * o escribiendo en la org equivocada y devolviendo 403/404 espurios sobre
 * seguimientos que el usuario sí puede ver. El mismo bug se corrigió antes
 * en `/api/addons` + `hooks/use-org-addons.ts`.
 *
 * El RLS de `clinical_followups` es `organization_id IN get_user_org_ids()`
 * (mig 053) y `get_user_org_ids()` (mig 013) no filtra por `is_active`: la
 * base deja pasar TODAS las orgs del usuario sin distinguir entre ellas.
 * Por eso esta capa no es redundante — es la que elige la org correcta y
 * la que exige membresía activa.
 */

type OrgResult =
  | { organizationId: string; error?: never }
  | { organizationId?: never; error: NextResponse };

/**
 * Verifica que el usuario tenga membresía ACTIVA en la organización dada.
 * Devuelve `null` si la membresía es válida, o el NextResponse de error
 * que el caller debe retornar tal cual.
 */
export async function assertActiveMembership(
  supabase: SupaClient,
  userId: string,
  organizationId: string
): Promise<NextResponse | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(
      { error: "No perteneces a esta organización" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Resuelve la organización de un seguimiento concreto (endpoints
 * `/[id]/…`). La org sale del PROPIO registro, no de una membresía
 * arbitraria, y luego se exige membresía activa en esa org.
 *
 * Solo para rutas que no necesitan más columnas del seguimiento; las que
 * ya leen el row hacen el select ellas mismas y llaman a
 * `assertActiveMembership` con su `organization_id`.
 */
export async function resolveFollowupOrg(
  supabase: SupaClient,
  userId: string,
  followupId: string
): Promise<OrgResult> {
  const { data: followup } = await supabase
    .from("clinical_followups")
    .select("organization_id")
    .eq("id", followupId)
    .maybeSingle();

  // RLS ya oculta los seguimientos de orgs ajenas, así que "no existe" y
  // "no es tuyo" colapsan en el mismo 404 y no filtran existencia.
  if (!followup) {
    return {
      error: NextResponse.json(
        { error: "Seguimiento no encontrado" },
        { status: 404 }
      ),
    };
  }

  const denied = await assertActiveMembership(
    supabase,
    userId,
    followup.organization_id
  );
  if (denied) return { error: denied };

  return { organizationId: followup.organization_id };
}

/**
 * Resuelve la organización activa para endpoints de colección, donde no
 * hay un registro del cual derivarla. El cliente manda su org activa
 * (`?org_id=` o `organization_id` en el body) y aquí se valida.
 *
 * Sin parámetro se conserva el comportamiento anterior — primera
 * membresía — que es correcto para los usuarios de una sola org y evita
 * romper callers todavía no actualizados.
 */
export async function resolveActiveOrg(
  supabase: SupaClient,
  userId: string,
  requestedOrgId: string | null
): Promise<OrgResult> {
  if (requestedOrgId) {
    const denied = await assertActiveMembership(
      supabase,
      userId,
      requestedOrgId
    );
    if (denied) return { error: denied };
    return { organizationId: requestedOrgId };
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "No perteneces a una organización" },
        { status: 403 }
      ),
    };
  }
  return { organizationId: membership.organization_id };
}
