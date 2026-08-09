"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Building2,
  DollarSign,
  Users,
  Activity,
  Shield,
  LogOut,
  Loader2,
  Crown,
  Headphones,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Nav primaria: 5 destinos, ordenados por frecuencia de uso real.
 *
 * Antes eran 10 planos (auditoría de navegación 2026-08-08). Dos problemas:
 * el header no cabía en NINGÚN ancho (10 ítems piden ~1412px dentro de un
 * contenedor de 1248px, por eso "Volver al app" se partía en dos líneas), y
 * el orden era casi inverso al uso — Soporte, que es diario, estaba en la
 * posición 8, detrás de Reembolsos y Usuarios, que se tocan una vez al mes.
 *
 * Lo que salió de aquí no desapareció: vive como sub-pestaña de su grupo
 * (ver subnav.tsx) y conserva su ruta, así que ningún deep-link se rompe.
 *   Clínicas → Owners + Organizaciones + Equipos
 *   Dinero   → Revenue + Reembolsos
 *   Sistema  → Health + Plugins + Ajustes
 * Overview salió del todo: el panel CEO ya lo cubre, y mostraba un "revenue
 * del mes" que significaba lo contrario que el de CEO.
 */
const NAV_ITEMS = [
  { label: "Hoy", href: "/founder-dashboard/ceo", icon: Crown },
  { label: "Soporte", href: "/founder-dashboard/support", icon: Headphones, badge: true },
  { label: "Clínicas", href: "/founder-dashboard/owners", icon: Building2 },
  { label: "Dinero", href: "/founder-dashboard/revenue", icon: DollarSign },
  { label: "Sistema", href: "/founder-dashboard/health", icon: Activity },
];

/** Rutas que pertenecen a cada grupo, para marcar la pestaña activa. */
const GROUP_ROUTES: Record<string, string[]> = {
  "/founder-dashboard/owners": [
    "/founder-dashboard/owners",
    "/founder-dashboard/organizations",
    "/founder-dashboard/users",
  ],
  "/founder-dashboard/revenue": [
    "/founder-dashboard/revenue",
    "/founder-dashboard/refunds",
  ],
  "/founder-dashboard/health": [
    "/founder-dashboard/health",
    "/founder-dashboard/plugins",
    "/founder-dashboard/settings",
  ],
};

function isGroupActive(href: string, pathname: string): boolean {
  const routes = GROUP_ROUTES[href] ?? [href];
  return routes.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

export default function FounderDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pendingTickets, setPendingTickets] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Skip if already authorized
    if (authorized && !checking) return;

    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_founder, totp_enabled")
        .eq("id", user.id)
        .single();

      if (!profile?.is_founder) {
        router.push("/dashboard");
        return;
      }

      const res = await fetch("/api/founder/totp/status");
      const status = await res.json();

      // Las pantallas TOTPSetup/TOTPVerify viven en la página raíz y solo se
      // renderizan con ?setup=true / ?verify=true. Antes NADIE redirigía con
      // esos params: cuando la sesión 2FA expiraba (TTL 4h), el panel entero
      // quedaba respondiendo 403 sin ofrecer jamás la re-verificación
      // (auditoría 2026-08-08). Ahora el layout es quien te lleva ahí.
      const params = new URLSearchParams(window.location.search);
      const onAuthScreen =
        pathname === "/founder-dashboard" &&
        (params.get("verify") === "true" || params.get("setup") === "true");

      if (!status.totpEnabled) {
        // requireFounder exige la cookie 2FA SIEMPRE — sin TOTP configurado
        // el panel no funciona, así que forzamos el setup en vez de dejar
        // pasar a páginas que morirán en 403.
        if (!onAuthScreen) {
          router.replace("/founder-dashboard?setup=true");
          return;
        }
        setAuthorized(false);
        setChecking(false);
        return;
      }

      if (!status.verified) {
        if (!onAuthScreen) {
          router.replace("/founder-dashboard?verify=true");
          return;
        }
        setAuthorized(false);
        setChecking(false);
        return;
      }

      setAuthorized(true);
      setChecking(false);

      // Badge de Soporte: lo que espera respuesta. Best-effort — que falle
      // no debe tumbar el panel.
      try {
        const pr = await fetch("/api/founder/support/pending");
        if (pr.ok) {
          const pd = await pr.json();
          setPendingTickets(pd.pending ?? 0);
        }
      } catch {
        /* sin badge */
      }
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not authorized = show children (page.tsx handles showing verify/setup screens)
  // Authorized = show full layout with navbar

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top navbar */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3 px-4">
          {/* Logo + nav */}
          <div className="flex min-w-0 items-center gap-6">
            {/* Móvil: sin esto NO había forma de cambiar de sección bajo 768px */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent md:hidden"
                  aria-label="Abrir menú"
                >
                  <Menu className="h-5 w-5" />
                  {pendingTickets > 0 && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="border-b border-border/60 p-4">
                  <SheetTitle className="text-sm">Founder Panel</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col p-2">
                  {NAV_ITEMS.map(({ label, href, icon: Icon, badge }) => {
                    const isActive = isGroupActive(href, pathname);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-amber-500/10 text-amber-500"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                        {badge && pendingTickets > 0 && (
                          <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {pendingTickets}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </SheetContent>
            </Sheet>

            <div className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              <span className="hidden text-sm font-bold sm:inline">Founder Panel</span>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ label, href, icon: Icon, badge }) => {
                const isActive = isGroupActive(href, pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-amber-500/10 text-amber-500"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {badge && pendingTickets > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {pendingTickets}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href="/dashboard"
              className="hidden whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              ← Volver al app
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
