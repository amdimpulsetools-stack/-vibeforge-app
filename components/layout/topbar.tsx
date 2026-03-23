"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/hooks/use-user";
import { useNotifications, type Notification } from "@/hooks/use-notifications";
import { getInitials } from "@/lib/utils";
import {
  Bell,
  CalendarPlus,
  CalendarX2,
  Banknote,
  Info,
  Check,
  CheckCheck,
} from "lucide-react";

const TYPE_CONFIG: Record<string, { icon: typeof Bell; className: string }> = {
  appointment_created: { icon: CalendarPlus, className: "text-emerald-500" },
  appointment_cancelled: { icon: CalendarX2, className: "text-red-400" },
  payment_received: { icon: Banknote, className: "text-amber-400" },
  info: { icon: Info, className: "text-blue-400" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function NotificationItem({
  notification,
  onRead,
  onClick,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  return (
    <button
      onClick={() => onClick(notification)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
        notification.is_read ? "opacity-60" : ""
      }`}
    >
      <div className={`mt-0.5 shrink-0 ${config.className}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-tight ${notification.is_read ? "" : "font-semibold"}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {timeAgo(notification.created_at)}
        </p>
      </div>
      {!notification.is_read && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRead(notification.id);
          }}
          title="Marcar como leída"
          className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
    </button>
  );
}

export function Topbar() {
  const { user, loading } = useUser();
  const {
    notifications,
    unreadCount,
    loading: notifsLoading,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    setOpen(false);
    if (n.action_url) router.push(n.action_url);
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm px-6">
      <div>{/* Breadcrumbs o titulo dinamico */}</div>
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
            title="Notificaciones"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-xl border border-border bg-card shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold">Notificaciones</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Marcar todas como leídas
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[400px] overflow-y-auto">
                {notifsLoading ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Cargando...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="py-12 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Sin notificaciones
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {notifications.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onRead={markAsRead}
                        onClick={handleNotificationClick}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block font-medium">
              {user?.email}
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary ring-1 ring-primary/20">
              {user?.email ? getInitials(user.email) : "?"}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
