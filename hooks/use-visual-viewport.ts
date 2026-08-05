"use client";

import { useEffect, useState } from "react";

export interface MobileViewport {
  /** Alto visible real en px (excluye el teclado). */
  height: number;
  /** Desplazamiento del viewport visual respecto del layout viewport. */
  top: number;
}

/**
 * Alto REAL del viewport en móvil.
 *
 * iOS Safari no encoge `100dvh` cuando aparece el teclado: un panel o un
 * dialog que mide la pantalla completa deja su pie (típicamente el botón
 * de guardar o el composer de chat) debajo del teclado, inalcanzable.
 * `window.visualViewport` SÍ refleja el área visible y su desplazamiento,
 * así que lo espejamos y el consumidor lo aplica como estilo inline.
 *
 * Devuelve `null` en escritorio (≥ `breakpoint`) y cuando el navegador no
 * expone la API — en ambos casos el consumidor debe caer en su layout de
 * CSS puro, de modo que el escritorio no cambia.
 *
 * Extraído de `scheduler/appointment-form-modal.tsx` (lote 1) al reusarse
 * en `components/ai-assistant-panel.tsx`.
 */
export function useVisualViewport(breakpoint = 768): MobileViewport | null {
  const [viewport, setViewport] = useState<MobileViewport | null>(null);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const sync = () => {
      if (window.innerWidth >= breakpoint) {
        setViewport(null);
        return;
      }
      setViewport({ height: vv.height, top: vv.offsetTop });
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [breakpoint]);

  return viewport;
}
