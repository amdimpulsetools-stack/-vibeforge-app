"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", href: "/founder-dashboard", icon: LayoutDashboard },
  { label: "Owners", href: "/founder-dashboard/owners", icon: Crown },
  { label: "Organizaciones", href: "/founder-dashboard/organizations", icon: Building2 },
  { label: "Revenue", href: "/founder-dashboard/revenue", icon: DollarSign },
  { label: "Usuarios", href: "/founder-dashboard/users", icon: Users },
  { label: "Health", href: "/founder-dashboard/health", icon: Activity },
];

export default function FounderDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

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

      if (!status.totpEnabled) {
        setAuthorized(true);
        setChecking(false);
        return;
      }

      if (!status.verified) {
        setAuthorized(false);
        setChecking(false);
        return;
      }

      setAuthorized(true);
      setChecking(false);
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          {/* Logo + nav */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              <span className="text-sm font-bold">Founder Panel</span>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                const isActive = pathname === href || (href !== "/founder-dashboard" && pathname.startsWith(href));
                return (
                  <a
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-amber-500/10 text-amber-500"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <a
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Volver al app
            </a>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
