"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const [userId, setUserId] = useState<string | null>(null);

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

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setMounted(true);
        return;
      }
      setUserId(user.id);
      supabase
        .from("user_profiles")
        .select("theme")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.theme && (data.theme === "light" || data.theme === "dark")) {
            setTheme(data.theme);
            applyTheme(data.theme);
            try { window.localStorage.setItem("vibeforge-theme", data.theme); } catch {}
          }
          setMounted(true);
        });
    });
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { window.localStorage.setItem("vibeforge-theme", next); } catch {}

    // Persist to DB (fire-and-forget)
    if (userId) {
      const supabase = createClient();
      supabase
        .from("user_profiles")
        .update({ theme: next })
        .eq("id", userId)
        .then(() => {});
    }
  }, [theme, userId]);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
