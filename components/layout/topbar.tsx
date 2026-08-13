"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-user";
import { useUserAvatar } from "@/hooks/use-user-avatar";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useOrgRole } from "@/hooks/use-org-role";
import { useNotifications, type Notification } from "@/hooks/use-notifications";
import { useHasHover } from "@/hooks/use-is-mobile";
import { useLanguage } from "@/components/language-provider";
import { createClient } from "@/lib/supabase/client";
import { getInitials, greetingName } from "@/lib/utils";
import { BorderAvatar } from "@/components/ui/avatar-border";
import {
  Bell,
  CalendarPlus,
  CalendarX2,
  UserX,
  Banknote,
  Info,
  Check,
  CheckCheck,
  Menu,
  ChevronDown,
} from "lucide-react";
import { useMobileNav } from "./mobile-nav-context";

// framer-motion (~36 kB gz) entraba en el First Load de TODAS las páginas del
// dashboard solo por este menú. Lo cargamos bajo demanda: el topbar "arma" el
// menú (montándolo cerrado, invisible) en cuanto el puntero se acerca al
// avatar o el botón recibe foco, así el chunk ya está listo para el primer
// clic. La animación sigue siendo la de framer, idéntica.
const UserMenuDropdown = dynamic(
  () => import("./user-menu-dropdown").then((m) => m.UserMenuDropdown),
  { ssr: false },
);

const TYPE_CONFIG: Record<string, { icon: typeof Bell; className: string }> = {
  appointment_created: { icon: CalendarPlus, className: "text-emerald-500" },
  appointment_cancelled: { icon: CalendarX2, className: "text-red-400" },
  appointment_no_show: { icon: UserX, className: "text-amber-500" },
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(notification)}
      onKeyDown={(e) => e.key === "Enter" && onClick(notification)}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 cursor-pointer ${
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
    </div>
  );
}

export function Topbar() {
  const { user, loading } = useUser();
  const { avatarUrl, avatarOption } = useUserAvatar();
  const { profile } = useUserProfile();
  const { isAdmin } = useOrgRole();
  const { t } = useLanguage();
  const { toggle: toggleMobileNav } = useMobileNav();
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

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Monta (cerrado) el chunk del menú del avatar. Se activa al primer indicio
  // de intención — hover/pointer/foco — para que el clic no espere la red.
  const [userMenuArmed, setUserMenuArmed] = useState(false);
  const armUserMenu = () => setUserMenuArmed(true);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // En táctil el hover emulado de iOS "gasta" el primer tap: solo lo activamos
  // en dispositivos con puntero fino (mouse/trackpad).
  const hasHover = useHasHover();

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setUserMenuOpen(false), 120);
  };

  useEffect(() => () => cancelClose(), []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (open || userMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, userMenuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success(t("nav.logout_success"));
    setUserMenuOpen(false);
    router.push("/login");
    router.refresh();
  };

  const displayName = (() => {
    const full = profile?.full_name?.trim();
    if (full) return greetingName(full);
    const metaFull = (user?.user_metadata?.full_name as string | undefined)?.trim();
    if (metaFull) return greetingName(metaFull);
    return null;
  })();

  const handleNotificationClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    setOpen(false);
    if (n.action_url) router.push(n.action_url);
  };

  return (
    <header className="relative z-40 flex h-16 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-sm px-4 md:px-6 print:hidden">
      <div className="flex items-center">
        {/* Mobile hamburger menu */}
        <button
          onClick={toggleMobileNav}
          className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setOpen(!open)}
            data-tour-step="topbar-notifications"
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
            /* <sm: fixed centrado al viewport — anclado a la campana con
               right-0 el panel (100vw-2rem) se salía por el borde izquierdo,
               porque la campana está a ~3.5rem del borde derecho. */
            <div className="fixed left-1/2 top-16 z-[100] w-[calc(100vw-2rem)] max-w-[360px] -translate-x-1/2 rounded-xl border border-border bg-background shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px] sm:translate-x-0">
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

        {/* User menu */}
        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        ) : (
          <div
            ref={userMenuRef}
            data-tour-step="topbar-user"
            className="relative"
            onPointerEnter={armUserMenu}
            onFocus={armUserMenu}
            onMouseEnter={
              hasHover
                ? () => {
                    cancelClose();
                    setUserMenuOpen(true);
                  }
                : undefined
            }
            onMouseLeave={hasHover ? scheduleClose : undefined}
          >
            <button
              type="button"
              onClick={() => {
                armUserMenu();
                setUserMenuOpen((v) => !v);
              }}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="group flex items-center gap-2 rounded-full pl-2 pr-1 py-1 transition-all duration-200 ease-out hover:bg-accent/60 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {displayName && (
                <span className="hidden sm:block text-xs font-medium text-foreground/80 transition-colors duration-200 group-hover:text-foreground">
                  {displayName}
                </span>
              )}
              <BorderAvatar
                src={avatarUrl}
                avatarOption={avatarOption}
                alt={displayName || user?.email || "User"}
                fallback={
                  displayName
                    ? getInitials(displayName)
                    : user?.email
                      ? getInitials(user.email)
                      : "?"
                }
                size="sm"
              />
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ease-out ${
                  userMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {userMenuArmed && (
              <UserMenuDropdown
                open={userMenuOpen}
                displayName={displayName}
                email={user?.email}
                isAdmin={isAdmin}
                onClose={() => setUserMenuOpen(false)}
                onLogout={handleLogout}
              />
            )}
          </div>
        )}
      </div>
    </header>
  );
}
