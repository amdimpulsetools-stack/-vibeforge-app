"use client";

import { useEffect, useState } from "react";

/**
 * Color de acento de MARCA resuelto en runtime, para consumidores que no
 * pueden usar clases de Tailwind: Recharts pinta con atributos SVG
 * (`fill`, `stroke`, `stopColor`), y los atributos de presentación no
 * entienden `var(--primary)`. Hay que leer el valor ya computado.
 *
 * De dónde sale el color: `--primary` de `:root`, que es lo que redefine
 * el <style> del tema de acento (lib/theme/accent-themes.ts) inyectado
 * por `app/(dashboard)/layout.tsx`. Así un chart de marca sigue al tema
 * de la organización sin cablear la paleta en el componente.
 *
 * USAR SÓLO PARA COLOR DE MARCA. Si el color del chart significa algo
 * —verde = atendido, rojo = cancelado, azul = programado— tiene que
 * quedarse en su hex fijo: ese color es dato, no decoración.
 *
 * El fallback (#10b981) cubre el primer render en servidor y el frame
 * previo a la hidratación, así que un chart nunca aparece sin color.
 */
const FALLBACK_ACCENT = "#10b981";

export function useBrandAccent(fallback: string = FALLBACK_ACCENT): string {
  const [color, setColor] = useState(fallback);

  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();
      if (value) setColor(value);
    };

    read();

    // El toggle claro/oscuro cambia `--primary` alternando la clase
    // `.dark` en <html> sin desmontar los charts: sin observar el
    // atributo, el chart se quedaría con el color del modo anterior.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return color;
}
