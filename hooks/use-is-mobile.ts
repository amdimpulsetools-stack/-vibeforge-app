"use client";

import { useEffect, useState } from "react";

/**
 * Suscribe un media query de forma SSR-safe.
 * Devuelve `false` en el primer render (servidor y cliente) y se sincroniza
 * tras montar, para no romper la hidratación.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** `true` en viewports < 768px (breakpoint md de Tailwind). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/**
 * `true` solo en dispositivos con hover real (mouse/trackpad).
 * Úsalo para gatear interacciones `onMouseEnter`: en pantallas táctiles
 * iOS emula el hover en el primer tap y obliga a un segundo toque.
 */
export function useHasHover(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
