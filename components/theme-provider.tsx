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
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  const userIdRef = useRef<string | null>(null);
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

        const { data } = await supabase
          .from("user_profiles")
          .select("theme")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        if (data?.theme && (data.theme === "light" || data.theme === "dark")) {
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
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem("vibeforge-theme", next); } catch {}

    // Persist to DB (fire-and-forget, chunk async)
    const userId = userIdRef.current;
    if (userId) {
      import("@/lib/supabase/client").then(({ createClient }) => {
        createClient()
          .from("user_profiles")
          .update({ theme: next })
          .eq("id", userId)
          .then(() => {});
      });
    }
  }, [theme]);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
