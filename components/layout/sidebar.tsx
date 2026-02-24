"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import {
  LayoutDashboard,
  Settings,
  UserCircle,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Zap,
  ShieldCheck,
  Building2,
  Stethoscope,
  ClipboardList,
  ListOrdered,
  CalendarDays,
  Users,
  UsersRound,
  BarChart3,
  History,
  Settings2,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  titleKey: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavGroup {
  titleKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const navEntries: NavEntry[] = [
  { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, adminOnly: true },
  {
    titleKey: "nav.scheduler",
    icon: CalendarDays,
    items: [
      { titleKey: "nav.scheduler_calendar", href: "/scheduler", icon: CalendarDays },
      { titleKey: "nav.scheduler_history", href: "/scheduler/history", icon: History },
    ],
  },
  { titleKey: "nav.patients", href: "/patients", icon: Users },
  { titleKey: "nav.reports", href: "/reports", icon: BarChart3 },
  {
    titleKey: "nav.admin",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { titleKey: "nav.admin_offices", href: "/admin/offices", icon: Building2 },
      { titleKey: "nav.admin_doctors", href: "/admin/doctors", icon: Stethoscope },
      { titleKey: "nav.admin_services", href: "/admin/services", icon: ClipboardList },
      { titleKey: "nav.admin_lookups", href: "/admin/lookups", icon: ListOrdered },
      { titleKey: "nav.admin_variables", href: "/admin/global-variables", icon: Settings2 },
      { titleKey: "nav.admin_members", href: "/admin/members", icon: UsersRound },
    ],
  },
  { titleKey: "nav.account", href: "/account", icon: UserCircle },
  { titleKey: "nav.settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { organization } = useOrganization();
  const { isAdmin } = useOrgRole();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const isPathActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => isPathActive(item.href));

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success(t("nav.logout_success"));
    router.push("/login");
    router.refresh();
  };

  const renderNavItem = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return null;
    const isActive = isPathActive(item.href);
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
  };

  const renderNavGroup = (group: NavGroup) => {
    if (group.adminOnly && !isAdmin) return null;

    const groupActive = isGroupActive(group);
    const isExpanded = expandedGroups[group.titleKey] ?? groupActive;

    return (
      <div key={group.titleKey}>
        <button
          onClick={() => {
            if (collapsed) {
              setCollapsed(false);
              setExpandedGroups((prev) => ({ ...prev, [group.titleKey]: true }));
            } else {
              toggleGroup(group.titleKey);
            }
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            groupActive ? "text-primary font-medium" : "text-muted-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <group.icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{t(group.titleKey)}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </>
          )}
        </button>
        {!collapsed && isExpanded && (
          <div className="ml-4 mt-1 space-y-1 border-l border-border pl-2">
            {group.items.map(renderNavItem)}
          </div>
        )}
      </div>
    );
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
          <div className="flex items-center gap-2 min-w-0">
            {organization?.logo_url ? (
              <img
                src={organization.logo_url}
                alt=""
                className="h-7 w-7 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Zap className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0">
              <span className="block text-sm font-bold truncate">{organization?.name ?? APP_NAME}</span>
            </div>
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
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navEntries.map((entry) =>
          isNavGroup(entry) ? renderNavGroup(entry) : renderNavItem(entry)
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
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
