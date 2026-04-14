"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { useEffect, useState } from "react";
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
  Crown,
  Cable,
  LayoutTemplate,
  ClipboardCheck,
  Headphones,
  FlaskConical,
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
  // Dashboard: visible to all roles (doctor sees personal, admin sees org-wide)
  { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    titleKey: "nav.scheduler",
    icon: CalendarDays,
    items: [
      { titleKey: "nav.scheduler_calendar", href: "/scheduler", icon: CalendarDays },
      { titleKey: "nav.scheduler_followups", href: "/scheduler/follow-ups", icon: ClipboardCheck },
      { titleKey: "nav.scheduler_history", href: "/scheduler/history", icon: History },
    ],
  },
  { titleKey: "nav.patients", href: "/patients", icon: Users },
  // Reports: admin+ only
  { titleKey: "nav.reports", href: "/reports", icon: BarChart3, adminOnly: true },
  {
    titleKey: "nav.admin",
    icon: ShieldCheck,
    adminOnly: true,
    items: [
      { titleKey: "nav.admin_offices", href: "/admin/offices", icon: Building2 },
      { titleKey: "nav.admin_doctors", href: "/admin/doctors", icon: Stethoscope },
      { titleKey: "nav.admin_services", href: "/admin/services", icon: ClipboardList },
      { titleKey: "nav.admin_lookups", href: "/admin/lookups", icon: ListOrdered },
      { titleKey: "nav.admin_members", href: "/admin/members", icon: UsersRound },
      { titleKey: "nav.admin_clinical_templates", href: "/admin/clinical-templates", icon: LayoutTemplate },
      { titleKey: "nav.admin_treatment_plan_templates", href: "/admin/treatment-plan-templates", icon: ClipboardList },
      { titleKey: "nav.admin_exam_catalog", href: "/admin/exam-catalog", icon: FlaskConical },
    ],
  },
  { titleKey: "nav.account", href: "/account", icon: UserCircle },
  // Settings: admin+ only
  { titleKey: "nav.settings", href: "/settings", icon: Settings, adminOnly: true },
];

import { useMobileNav } from "./mobile-nav-context";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { organization } = useOrganization();
  const { isAdmin } = useOrgRole();
  const { isOpen: mobileOpen, setOpen: setMobileOpen } = useMobileNav();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isFounder, setIsFounder] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Check founder status once
  useEffect(() => {
    const checkFounder = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("is_founder")
        .eq("id", user.id)
        .single();
      if (data?.is_founder) setIsFounder(true);
    };
    checkFounder();
  }, []);

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
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
            isActive
              ? "bg-primary/12 text-primary font-semibold nav-active-glow"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <item.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          {!collapsed && <span className="truncate">{t(item.titleKey)}</span>}
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
            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
            "hover:bg-accent/60 hover:text-foreground",
            groupActive ? "text-primary font-semibold" : "text-muted-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <group.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              groupActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate">{t(group.titleKey)}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
              />
            </>
          )}
        </button>
        {!collapsed && isExpanded && (
          <div className="ml-[18px] mt-0.5 space-y-0.5 pl-3">
            {group.items.map(renderNavItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "flex h-screen flex-col bg-sidebar-bg border-r border-border/60 transition-all duration-300 relative",
          // Desktop: static sidebar with collapse
          "md:relative md:translate-x-0",
          collapsed ? "md:w-[64px]" : "md:w-[250px]",
          // Mobile: fixed drawer that slides in from left
          "fixed inset-y-0 left-0 z-50 w-[250px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
      {/* Subtle gradient overlay at top */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative flex h-16 items-center border-b border-border/40 px-3">
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            {organization?.logo_url ? (
              <img
                src={organization.logo_url}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-border/50"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg gradient-primary shadow-sm">
                <Zap className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <span className="block text-sm font-bold tracking-tight truncate">
                {organization?.name ?? APP_NAME}
              </span>
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "hidden md:flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-all duration-200",
            collapsed ? "mx-auto" : "ml-auto"
          )}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              collapsed && "rotate-180"
            )}
          />
        </button>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-all duration-200"
          aria-label="Cerrar menú"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {navEntries.map((entry) =>
          isNavGroup(entry) ? renderNavGroup(entry) : renderNavItem(entry)
        )}

        {/* Founder links (platform superuser) */}
        {isFounder && (
          <>
            <div className="my-2 border-t border-border/30" />
            {renderNavItem({
              titleKey: "nav.founder",
              href: "/founder",
              icon: Crown,
            })}
            {renderNavItem({
              titleKey: "nav.integrations",
              href: "/founder/integrations",
              icon: Cable,
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="relative border-t border-border/40 p-2.5 space-y-0.5">
        <Link href="/support">
          <span
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
              isPathActive("/support")
                ? "bg-primary/12 text-primary font-semibold nav-active-glow"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <Headphones
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                isPathActive("/support") ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            {!collapsed && <span className="truncate">{t("nav.support")}</span>}
          </span>
        </Link>
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
    </>
  );
}
