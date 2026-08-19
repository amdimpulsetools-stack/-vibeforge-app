"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AUTH_USER_QUERY_KEY } from "@/lib/query-keys";
import type { User } from "@supabase/supabase-js";

// PERF (Lote 2 / 2.10): este provider vive en el root layout, así que todo lo
// que importe estáticamente entra en el First Load de las rutas públicas
// (landing/login/blog). supabase-js (~54 kB gz con realtime) se importa SOLO
// vía import() dinámico: la resolución del tema sigue siendo idéntica a antes
// (localStorage síncrono en el primer efecto, sin flash) y la sincronización
// con user_profiles.theme se difiere al chunk async.
// El import de tipos de @supabase/supabase-js es type-only y se borra al compilar.

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  /**
   * True when the org owner set an org-wide theme and the current user
   * is NOT the owner: their personal toggle is disabled — the owner's
   * choice is the theme for every member (founder decision, mig 225).
   */
  locked: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
  locked: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [locked, setLocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const userIdRef = useRef<string | null>(null);
  // Org the user OWNS — toggling as owner propagates the theme to it.
  const ownedOrgIdRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  // On mount: read from localStorage first (instant), then sync from DB
  useEffect(() => {
    const local = window.localStorage?.getItem("vibeforge-theme") as Theme;
    if (local === "light" || local === "dark") {
      setTheme(local);
      applyTheme(local);
    } else {
      // Default to light when no cache exists
      applyTheme("light");
    }

    let cancelled = false;

    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();

        // Deduplicado con useUser(): comparte la key ['auth','user'], así que
        // en el dashboard reutiliza el getUser() ya cacheado y en rutas
        // públicas es la única llamada.
        const user = await queryClient.fetchQuery<User | null>({
          queryKey: AUTH_USER_QUERY_KEY,
          staleTime: Infinity,
          gcTime: Infinity,
          queryFn: async () => {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            return user;
          },
        });

        if (cancelled) return;

        if (!user) {
          setMounted(true);
          return;
        }
        userIdRef.current = user.id;

        const [{ data }, { data: member }] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("theme")
            .eq("id", user.id)
            .single(),
          // Org-wide theme (mig 225): the owner's choice overrides the
          // member's personal theme. One membership row is enough — the
          // active one with the highest role mirrors the session check.
          supabase
            .from("organization_members")
            .select("role, organization_id, organizations(theme)")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const role = (member as { role?: string } | null)?.role ?? null;
        const orgTheme = (
          member as { organizations?: { theme?: string | null } | null } | null
        )?.organizations?.theme;
        if (role === "owner") {
          ownedOrgIdRef.current =
            (member as { organization_id?: string } | null)?.organization_id ?? null;
        }

        const isOrgEnforced =
          role !== null &&
          role !== "owner" &&
          (orgTheme === "light" || orgTheme === "dark");

        if (isOrgEnforced) {
          // The owner's theme wins for every member.
          setTheme(orgTheme as Theme);
          applyTheme(orgTheme as Theme);
          setLocked(true);
          try { window.localStorage.setItem("vibeforge-theme", orgTheme as Theme); } catch {}
        } else if (data?.theme && (data.theme === "light" || data.theme === "dark")) {
          setTheme(data.theme);
          applyTheme(data.theme);
          try { window.localStorage.setItem("vibeforge-theme", data.theme); } catch {}
        }
        setMounted(true);
      } catch {
        if (!cancelled) setMounted(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const toggleTheme = useCallback(() => {
    // Org theme enforced and this user isn't the owner → the toggle is
    // inert (the UI hides/disables it, this is defense-in-depth).
    if (locked) return;

    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem("vibeforge-theme", next); } catch {}

    // Persist to DB (fire-and-forget, chunk async)
    const userId = userIdRef.current;
    if (userId) {
      import("@/lib/supabase/client").then(({ createClient }) => {
        const supabase = createClient();
        supabase
          .from("user_profiles")
          .update({ theme: next })
          .eq("id", userId)
          .then(() => {});
        // Owner: propagate to the whole org (mig 225) — every member
        // picks it up on their next session.
        const ownedOrgId = ownedOrgIdRef.current;
        if (ownedOrgId) {
          supabase
            .from("organizations")
            .update({ theme: next })
            .eq("id", ownedOrgId)
            .then(() => {});
        }
      });
    }
  }, [theme, locked]);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, locked }}>
      {children}
    </ThemeContext.Provider>
  );
}
