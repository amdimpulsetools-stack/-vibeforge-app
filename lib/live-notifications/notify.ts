import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLiveNotificationEvent,
  type LiveNotificationEventKey,
} from "./catalog";

/**
 * Helper central de emisión de notificaciones en vivo.
 *
 * Único punto del código que escribe en `notifications`. Todos los call-sites
 * pasan por aquí, y aquí se llama al RPC `notify_org_members` (mig 192), que
 * hace el fan-out por usuario.
 *
 * Server-only a propósito: desde mig 192 el INSERT directo está cerrado por
 * RLS, así que un call-site de cliente no tiene forma de emitir. Los que
 * emitían desde el navegador ahora pasan por
 * `POST /api/live-notifications/emit`.
 *
 * Es fire-and-forget por diseño: una notificación que no sale NUNCA debe
 * tumbar la acción que la originó (crear la cita, cobrar el pago). Los fallos
 * se registran y se devuelven, no se lanzan.
 */

export interface NotifyOrgMembersArgs {
  organizationId: string;
  event: LiveNotificationEventKey | string;
  title: string;
  body?: string;
  actionUrl?: string | null;
  /**
   * user_id del doctor dueño de la cita. Necesario cuando el evento declara
   * `doctorScope: "own"`: sin él, la audiencia "doctor" no casa con nadie y
   * el doctor simplemente no recibe nada (fallo silencioso y seguro, nunca
   * un broadcast a todos los doctores).
   */
  doctorUserId?: string | null;
  /**
   * Saca a este usuario del fan-out. Para no anunciarle a alguien lo que
   * acaba de hacer (mig 220).
   */
  excludeUserId?: string | null;
  /**
   * Aviso DIRIGIDO: cuando va informado, el fan-out se reduce a esa persona
   * y las audiencias se ignoran por completo (mig 220). Es para los avisos
   * cuyo destinatario se elige por su papel en el hecho —quien abrió la caja
   * que quedó sin cerrar— y no por su rol en la organización, que es lo
   * único que la matriz de Settings sabe expresar. La membresía se sigue
   * verificando en el RPC.
   */
  targetUserId?: string | null;
}

export interface NotifyResult {
  ok: boolean;
  /** Filas creadas. 0 es un resultado válido: la org apagó el evento. */
  recipients: number;
  error?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function notifyOrgMembers(
  supabase: SupabaseClient<any, any, any>,
  args: NotifyOrgMembersArgs
): Promise<NotifyResult> {
  const event = getLiveNotificationEvent(args.event);
  if (!event) {
    // Clave fuera del catálogo: bug de programación, no del usuario.
    console.error("[live-notifications] evento desconocido:", args.event);
    return { ok: false, recipients: 0, error: "unknown_event" };
  }

  const { data, error } = await (supabase as any).rpc("notify_org_members", {
    p_organization_id: args.organizationId,
    p_event_key: event.key,
    p_default_audiences: [...event.defaultAudiences],
    p_type: event.type,
    p_title: args.title,
    p_body: args.body ?? "",
    p_action_url: args.actionUrl ?? null,
    p_doctor_user_id: args.doctorUserId ?? null,
    p_doctor_scope: event.doctorScope,
    p_exclude_user_id: args.excludeUserId ?? null,
    p_target_user_id: args.targetUserId ?? null,
  });

  if (error) {
    console.error("[live-notifications] notify_org_members falló:", error.message);
    return { ok: false, recipients: 0, error: error.message };
  }

  return { ok: true, recipients: typeof data === "number" ? data : 0 };
}
