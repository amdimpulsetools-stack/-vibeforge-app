"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import {
  LayoutDashboard,
  Settings,
  UserCircle,
  LogOut,
  ChevronLeft,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  titleKey: string;
  href: string;
  icon: LucideIcon;
}

// ================================================
// PERSONALIZA: Agrega aquí las rutas de tu app
// ================================================
const navItems: NavItem[] = [
  { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  // { titleKey: "Pacientes", href: "/patients", icon: Users },
  // { titleKey: "Citas", href: "/appointments", icon: Calendar },
  { titleKey: "nav.account", href: "/account", icon: UserCircle },
  { titleKey: "nav.settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success(t("nav.logout_success"));
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-all duration-300",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center border-b border-border px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold">{APP_NAME}</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed ? "mx-auto" : "ml-auto"
          )}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && <span>{t(item.titleKey)}</span>}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
