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
import { useUser } from "@/hooks/use-user";
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
  LayoutTemplate,
  ClipboardCheck,
  Headphones,
  FlaskConical,
  Pill,
  BookOpen,
  Receipt,
  Wallet,
  ListPlus,
  ShieldPlus,
  type LucideIcon,
  Megaphone,
  Warehouse,
  ShoppingCart,
  Baby,
  Syringe,
  Tags,
} from "lucide-react";

interface NavItem {
  titleKey: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Hidden specifically for users with role=doctor (e.g. billing pages
   *  that doctors should never see, even if recepcionistas can). */
  hideForDoctor?: boolean;
  /** Only visible if the org has at least one of the listed addons enabled. */
  requiresAnyAddon?: string[];
}

interface NavGroup {
  titleKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Igual que en NavItem, pero a nivel de grupo: sin el addon no se pinta
   *  ni la cabecera del grupo (antes solo los hijos sabían ocultarse y
   *  quedaba un acordeón vacío). */
  requiresAnyAddon?: string[];
  items: NavItem[];
}

type NavEntry = NavItem | NavGroup;

interface NavSection {
  labelKey?: string;
  adminOnly?: boolean;
  entries: NavEntry[];
}

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

const navSections: NavSection[] = [
  {
    labelKey: "nav.section_main",
    entries: [
      { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    labelKey: "nav.section_work",
    entries: [
      {
        titleKey: "nav.scheduler",
        icon: CalendarDays,
        items: [
          { titleKey: "nav.scheduler_calendar", href: "/scheduler", icon: CalendarDays },
          {
            // Seguimientos son capacidad core desde Fase 1: sin gate de
            // addon. Presupuestos sí sigue siendo del Pack Fertilidad.
            titleKey: "nav.scheduler_followups",
            href: "/scheduler/follow-ups",
            icon: ClipboardCheck,
          },
          { titleKey: "nav.scheduler_history", href: "/scheduler/history", icon: History },
        ],
      },
      {
        // Grupo Fertilidad: el embudo del Pack (Presupuestos → Tratamientos)
        // vive junto, no repartido dentro de Agenda. Gate a nivel de GRUPO:
        // una org core no ve ni la cabecera.
        titleKey: "nav.group_fertility",
        icon: Baby,
        requiresAnyAddon: ["fertility_basic", "fertility_premium"],
        items: [
          {
            titleKey: "nav.scheduler_budgets",
            href: "/scheduler/budgets",
            icon: Wallet,
          },
          {
            titleKey: "nav.treatments",
            href: "/tratamientos",
            icon: Syringe,
          },
        ],
      },
      {
        // Módulo Captación (beta oculta): solo orgs con grant del addon.
        titleKey: "nav.captacion",
        href: "/captacion",
        icon: Megaphone,
        requiresAnyAddon: ["captacion"],
      },
      {
        // Módulo Almacén (beta oculta): solo orgs con grant del addon.
        titleKey: "nav.almacen",
        href: "/almacen",
        icon: Warehouse,
        requiresAnyAddon: ["almacen"],
      },
      {
        // Módulo Farmacia (POS, beta oculta): viaja con el addon 'almacen'
        // porque vender es descontar del mismo kardex. El doctor no cobra
        // al mostrador — para consumir insumos en consulta está Almacén.
        titleKey: "nav.farmacia",
        href: "/farmacia",
        icon: ShoppingCart,
        requiresAnyAddon: ["almacen"],
        hideForDoctor: true,
      },
      {
        // Módulo Caja (beta oculta): solo orgs con grant del addon. El
        // doctor no cobra, así que tampoco arquea.
        titleKey: "nav.caja",
        href: "/caja",
        icon: Wallet,
        requiresAnyAddon: ["caja"],
        hideForDoctor: true,
      },
      { titleKey: "nav.patients", href: "/patients", icon: Users },
    ],
  },
  {
    // Section visible para owner/admin (todo) y recepcionistas (solo
    // /facturacion). Doctores no ven nada aqui — ambos items los excluyen.
    labelKey: "nav.section_insights",
    entries: [
      { titleKey: "nav.reports", href: "/reports", icon: BarChart3, adminOnly: true },
      { titleKey: "nav.facturacion", href: "/facturacion", icon: Receipt, hideForDoctor: true },
    ],
  },
  {
    labelKey: "nav.section_management",
    adminOnly: true,
    entries: [
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
          { titleKey: "nav.admin_medication_catalog", href: "/admin/medication-catalog", icon: Pill },
          { titleKey: "nav.admin_diagnosis_codes", href: "/admin/diagnosis-codes", icon: BookOpen },
          { titleKey: "nav.admin_custom_fields", href: "/admin/custom-fields", icon: ListPlus },
          { titleKey: "nav.admin_insurance", href: "/admin/seguros", icon: ShieldPlus },
          {
            // Catálogo de conceptos de cobro de tratamientos (mig 242):
            // solo tiene sentido con el Pack Fertilidad activo.
            titleKey: "nav.treatment_concepts",
            href: "/admin/treatment-concepts",
            icon: Tags,
            adminOnly: true,
            requiresAnyAddon: ["fertility_basic", "fertility_premium"],
          },
        ],
      },
    ],
  },
  {
    labelKey: "nav.section_settings",
    entries: [
      { titleKey: "nav.account", href: "/account", icon: UserCircle },
      { titleKey: "nav.settings", href: "/settings", icon: Settings, adminOnly: true },
    ],
  },
];

import { useMobileNav } from "./mobile-nav-context";
import { useEInvoiceConfig } from "@/hooks/use-einvoice-config";
import { useOrgAddons } from "@/hooks/use-org-addons";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { organization } = useOrganization();
  const { isAdmin, isDoctor } = useOrgRole();
  const { isOpen: mobileOpen, setOpen: setMobileOpen } = useMobileNav();
  const einvoice = useEInvoiceConfig();
  const { hasAnyAddon } = useOrgAddons();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [isFounder, setIsFounder] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Check founder status once. El usuario llega deduplicado por la key
  // ['auth','user'] de useUser() — antes esto disparaba su propio getUser().
  const { user } = useUser();
  const authUserId = user?.id ?? null;
  useEffect(() => {
    if (!authUserId) return;
    const checkFounder = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_profiles")
        .select("is_founder")
        .eq("id", authUserId)
        .single();
      if (data?.is_founder) setIsFounder(true);
    };
    checkFounder();
  }, [authUserId]);

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

  // Colapsado, el sidebar se pinta como un rail oscuro (ver la capa
  // `sidebar-rail` más abajo), así que los estados de las pastillas se
  // invierten a blancos. El ítem activo pasa a acento sólido: su texto usa
  // `--primary-foreground`, que ya está definido por acento y por tema, de
  // modo que un acento claro recibe glifos oscuros sin cablearlo aquí.
  const pillState = (isActive: boolean) =>
    collapsed
      ? isActive
        ? "bg-primary text-primary-foreground"
        : "text-white/70 hover:bg-white/10 hover:text-white"
      : isActive
        ? "bg-primary/12 text-primary font-semibold nav-active-glow"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground";

  const pillIcon = (isActive: boolean) =>
    collapsed
      ? isActive
        ? "text-primary-foreground"
        : "text-white/70 group-hover:text-white"
      : isActive
        ? "text-primary"
        : "text-primary/70 group-hover:text-primary";

  const renderNavItem = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return null;
    if (item.hideForDoctor && isDoctor) return null;
    if (item.requiresAnyAddon && !hasAnyAddon(item.requiresAnyAddon)) return null;
    // Gate the /facturacion entry behind an active e-invoice config —
    // shows up only after the org has finished the Nubefact wizard.
    // The hook caches per-org so this doesn't add extra requests.
    if (item.href === "/facturacion" && !einvoice.connected) return null;
    const isActive = isPathActive(item.href);
    const tourStepByHref: Record<string, string> = {
      "/dashboard": "nav-dashboard",
      "/scheduler": "nav-scheduler",
      "/patients": "nav-patients",
      "/reports": "nav-reports",
      "/settings": "nav-settings",
    };
    const tourStep = tourStepByHref[item.href];
    return (
      <Link key={item.href} href={item.href} data-tour-step={tourStep} className="block">
        <span
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-[color,background-color,box-shadow,transform]",
            pillState(isActive),
            collapsed && "justify-center px-2"
          )}
        >
          <item.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pillIcon(isActive)
            )}
          />
          {!collapsed && <span className="truncate">{t(item.titleKey)}</span>}
        </span>
      </Link>
    );
  };

  const renderNavGroup = (group: NavGroup) => {
    if (group.adminOnly && !isAdmin) return null;
    if (group.requiresAnyAddon && !hasAnyAddon(group.requiresAnyAddon)) return null;

    const groupActive = isGroupActive(group);
    const isExpanded = expandedGroups[group.titleKey] ?? groupActive;
    const tourStepByGroup: Record<string, string> = {
      "nav.scheduler": "nav-scheduler",
    };
    const tourStep = tourStepByGroup[group.titleKey];

    return (
      <div key={group.titleKey} data-tour-step={tourStep}>
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
            "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-[color,background-color,box-shadow,transform]",
            // Expandido el grupo nunca lleva fondo (solo el hijo activo lo
            // tiene); colapsado sí, porque el hijo no se ve y el rail
            // necesita señalar dónde estás.
            collapsed
              ? pillState(groupActive)
              : cn(
                  "hover:bg-accent/60 hover:text-foreground",
                  groupActive ? "text-primary font-semibold" : "text-muted-foreground"
                ),
            collapsed && "justify-center px-2"
          )}
        >
          <group.icon
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pillIcon(groupActive)
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
          <div className="ml-[18px] mt-1.5 flex flex-col gap-1.5 pl-3">
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
        data-tour-step="sidebar"
        className={cn(
          // h-[100dvh] para acompañar al shell del dashboard (100vh en iOS
          // incluye la barra de URL, y el drawer se pasaba de largo).
          "flex h-[100dvh] flex-col bg-sidebar-bg border-r border-border/60 transition-[width] duration-[var(--dur-slow)] relative print:hidden",
          // Desktop: static sidebar with collapse
          "md:relative md:translate-x-0",
          collapsed ? "md:w-[64px]" : "md:w-[250px]",
          // Mobile: fixed drawer that slides in from left
          "fixed inset-y-0 left-0 z-50 w-[250px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
      {/* Rail oscuro del modo colapsado.
          Va como capa propia y se anima con `opacity` en lugar de transicionar
          el `background-color` del panel: opacity la resuelve el compositor,
          así que el fundido corre en la GPU sin repintar el sidebar en cada
          frame. Prueba reversible — borrando este div y el token
          `--sidebar-rail` todo vuelve al estado anterior. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-sidebar-rail transition-opacity duration-200 ease-out",
          collapsed ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Subtle gradient overlay at top */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" />

      {/* Header */}
      <div
        className={cn(
          "relative flex h-16 items-center border-b px-3 transition-colors duration-200",
          collapsed ? "border-white/10" : "border-border/40"
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Prefer icon_url (mig 168 — compact square optimized
                for tile slots) when the org has uploaded one. Falls
                back to logo_url so existing orgs without an icon
                configured keep working unchanged. */}
            {(organization?.icon_url ?? organization?.logo_url) ? (
              <img
                src={(organization?.icon_url ?? organization?.logo_url) as string}
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
            "hidden md:flex h-7 w-7 items-center justify-center rounded-lg transition-[color,background-color,box-shadow,transform]",
            collapsed
              ? "mx-auto text-white/70 hover:bg-white/10 hover:text-white"
              : "ml-auto text-muted-foreground/70 hover:bg-accent hover:text-foreground"
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
          className="md:hidden ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-[color,background-color,box-shadow,transform]"
          aria-label="Cerrar menú"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="relative flex-1 overflow-y-auto p-2.5">
        {navSections.map((section, idx) => {
          if (section.adminOnly && !isAdmin) return null;
          // Filter visible entries to avoid empty sections.
          // Respects both adminOnly (owner+admin) and hideForDoctor flags.
          const visibleEntries = section.entries.filter((e) => {
            const meta = e as {
              adminOnly?: boolean;
              hideForDoctor?: boolean;
              requiresAnyAddon?: string[];
            };
            if (meta.adminOnly && !isAdmin) return false;
            if (meta.hideForDoctor && isDoctor) return false;
            // Grupos con gate de addon también cuentan aquí: si no, una
            // sección podía quedar "visible" con cero entradas pintadas.
            if (meta.requiresAnyAddon && !hasAnyAddon(meta.requiresAnyAddon))
              return false;
            return true;
          });
          if (visibleEntries.length === 0) return null;
          return (
            <div key={section.labelKey ?? idx} className={cn(idx > 0 && "mt-4")}>
              {!collapsed && section.labelKey && (
                <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {t(section.labelKey)}
                </div>
              )}
              {/* flex+gap en vez de space-y: `space-y-*` aplica margen a los
                  hijos, y los <Link> de Next renderizan un <a> inline, donde
                  el margen vertical no tiene efecto — las pastillas quedaban
                  pegadas a 0px. Los hijos de un flex se blockifican, así que
                  el gap funciona pase lo que pase. */}
              <div className="flex flex-col gap-1.5">
                {visibleEntries.map((entry) =>
                  isNavGroup(entry) ? renderNavGroup(entry) : renderNavItem(entry)
                )}
              </div>
            </div>
          );
        })}

        {/* Founder links (platform superuser) */}
        {isFounder && (
          <>
            <div className="my-2 border-t border-border/30" />
            {renderNavItem({
              titleKey: "nav.founder",
              href: "/founder-dashboard",
              icon: Crown,
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "relative flex flex-col gap-1.5 border-t p-2.5 transition-colors duration-200",
          collapsed ? "border-white/10" : "border-border/40"
        )}
      >
        <Link href="/support" className="block">
          <span
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-[color,background-color,box-shadow,transform]",
              pillState(isPathActive("/support")),
              collapsed && "justify-center px-2"
            )}
          >
            <Headphones
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                pillIcon(isPathActive("/support"))
              )}
            />
            {!collapsed && <span className="truncate">{t("nav.support")}</span>}
          </span>
        </Link>
        <button
          onClick={handleLogout}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-[color,background-color,box-shadow,transform] hover:bg-destructive/10 hover:text-destructive",
            collapsed ? "text-white/70" : "text-muted-foreground",
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
