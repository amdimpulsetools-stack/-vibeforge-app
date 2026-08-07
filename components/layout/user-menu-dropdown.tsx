"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useLanguage } from "@/components/language-provider";
import { UserCircle, Settings, LogOut } from "lucide-react";

/**
 * Menú del avatar del topbar.
 *
 * Vive en su propio módulo porque es el ÚNICO consumidor de framer-motion en
 * todo el shell del dashboard (~36 kB gz). El topbar lo carga con
 * next/dynamic en cuanto el puntero se acerca al avatar, de modo que el
 * chunk sale del First Load de todas las páginas del dashboard sin que el
 * primer clic tenga que esperar la descarga.
 *
 * La animación es exactamente la que estaba inline en topbar.tsx: no se
 * toca ni un valor.
 */
export function UserMenuDropdown({
  open,
  displayName,
  email,
  isAdmin,
  onClose,
  onLogout,
}: {
  open: boolean;
  displayName: string | null;
  email: string | null | undefined;
  isAdmin: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={{ willChange: "transform, opacity" }}
          className="absolute right-0 top-full z-[100] mt-2 w-56 origin-top-right overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-sm"
        >
          {/* Header */}
          <div className="border-b border-border/60 px-3 py-2.5">
            {displayName && (
              <p className="text-sm font-semibold leading-tight">
                {displayName}
              </p>
            )}
            <p className="truncate text-[11px] text-muted-foreground">
              {email}
            </p>
          </div>

          {/* Items */}
          <div className="p-1">
            <Link
              href="/account"
              role="menuitem"
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/90 transition-colors duration-150 hover:bg-accent hover:text-foreground"
            >
              <UserCircle className="h-4 w-4 text-muted-foreground" />
              {t("nav.account")}
            </Link>
            {isAdmin && (
              <Link
                href="/settings"
                role="menuitem"
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground/90 transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                {t("nav.settings")}
              </Link>
            )}
            <div className="my-1 h-px bg-border/60" />
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-500 transition-colors duration-150 hover:bg-red-500/10"
            >
              <LogOut className="h-4 w-4" />
              {t("nav.logout")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
