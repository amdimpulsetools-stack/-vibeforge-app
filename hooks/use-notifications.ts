"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

const ICON_MAP: Record<string, string> = {
  appointment_created: "📅",
  appointment_cancelled: "❌",
  appointment_no_show: "🚫",
  payment_received: "💰",
  info: "ℹ️",
};

/**
 * Campanita del topbar.
 *
 * Desde la mig 192 las notificaciones se emiten con `user_id` concreto
 * (fan-out por rol en `notify_org_members`), así que esto lee y escucha POR
 * USUARIO, no por organización. El cambio de emisión y el de suscripción
 * viajan juntos a propósito: separarlos dejaría una ventana en la que el
 * canal escucha algo que ya nadie emite (o al revés).
 *
 * Compatibilidad: las filas anteriores a la mig 192 tienen `user_id NULL` y
 * eran broadcast de org. Se siguen LEYENDO (la policy de SELECT las deja
 * pasar a cualquier miembro), así que la campanita no pierde el histórico.
 * Lo que no hacen es llegar por Realtime — el filtro del canal es por
 * usuario y no admite un OR. Da igual: nadie las emite ya, sólo se
 * consultan.
 */
export function useNotifications() {
  const { organizationId } = useOrganization();
  // Usuario deduplicado vía React Query (key ['auth','user']) — antes este
  // hook disparaba su propio supabase.auth.getUser() al montar.
  const { user } = useUser();
  const userId = user?.id ?? null;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Fetch recent notifications: las mías + el histórico broadcast de la org.
  const fetchNotifications = useCallback(async () => {
    if (!organizationId || !userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, organization_id, user_id, type, title, body, action_url, is_read, created_at")
      .eq("organization_id", organizationId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(50);

    const items = (data as Notification[]) ?? [];
    setNotifications(items);
    setUnreadCount(items.filter((n) => !n.is_read).length);
    setLoading(false);
  }, [organizationId, userId]);

  // Mark single as read
  const markAsRead = useCallback(async (id: string) => {
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Mark all as read. El `.or()` acota el UPDATE a lo que este usuario ve
  // (lo suyo + el legacy de su org); sin él, el filtro sólo por org intentaría
  // tocar filas de compañeros y la policy las rechazaría en silencio.
  const markAllAsRead = useCallback(async () => {
    if (!organizationId || !userId) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("organization_id", organizationId)
      .or(`user_id.eq.${userId},user_id.is.null`)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [organizationId, userId]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription — por usuario, no por organización.
  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
          setUnreadCount((prev) => prev + 1);

          // Show toast
          const icon = ICON_MAP[newNotif.type] || "🔔";
          toast(`${icon} ${newNotif.title}`, {
            description: newNotif.body || undefined,
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
