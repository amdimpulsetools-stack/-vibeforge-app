"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { useState } from "react";
import {
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronLeft,
  Zap,
  UserCircle,
  Calendar,
  Stethoscope,
  Variable,
  ChevronDown,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

const navItems: NavItem[] = [
  { title: "Dashboard",   href: "/dashboard",    icon: LayoutDashboard },
  { title: "Citas",       href: "/appointments", icon: Calendar },
  { title: "Cuenta",      href: "/account",      icon: UserCircle },
  { title: "Ajustes",     href: "/settings",     icon: Settings },
];

const adminGroup: NavGroup = {
  title: "Administración",
  icon: ShieldCheck,
  items: [
    { title: "Doctores",          href: "/admin/doctors",           icon: Stethoscope },
    { title: "Variables Globales", href: "/admin/global-variables", icon: Variable },
  ],
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [adminOpen, setAdminOpen] = useState(
    adminGroup.items.some((i) => pathname.startsWith(i.href))
  );

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/login");
    router.refresh();
  };

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-card transition-all duration-300",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
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
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {/* Ítems principales */}
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <span
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </span>
          </Link>
        ))}

        {/* Separador */}
        <div className={cn("my-2 border-t border-border/60", collapsed && "mx-1")} />

        {/* Grupo Administración */}
        {collapsed ? (
          // En modo colapsado mostrar ítems directamente con iconos
          adminGroup.items.map((item) => (
            <Link key={item.href} href={item.href}>
              <span
                className={cn(
                  "flex items-center justify-center rounded-lg px-2 py-2 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                )}
                title={item.title}
              >
                <item.icon className="h-[18px] w-[18px]" />
              </span>
            </Link>
          ))
        ) : (
          <>
            {/* Header del grupo */}
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <adminGroup.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 text-left font-medium">{adminGroup.title}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  adminOpen && "rotate-180"
                )}
              />
            </button>

            {/* Sub-ítems colapsables */}
            {adminOpen && (
              <div className="ml-3 space-y-0.5 border-l border-border/50 pl-3">
                {adminGroup.items.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <span
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        isActive(item.href)
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      <item.icon className="h-[16px] w-[16px] shrink-0" />
                      <span>{item.title}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
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
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}
