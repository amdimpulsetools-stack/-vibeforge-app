"use client";

/**
 * Cloudflare Turnstile — CAPTCHA invisible para los formularios de auth.
 *
 * Diseñado para poder desplegarse ANTES de configurar las llaves: si
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY no existe, el componente no renderiza
 * nada y las páginas no envían token — exactamente el comportamiento de
 * hoy. El orden seguro de despliegue es: (1) mergear esto, (2) crear el
 * widget en Cloudflare y poner la env var en Vercel, (3) activar
 * "Captcha protection" en Supabase Auth. Si se activa (3) sin (2), los
 * logins fallan porque Supabase exige token en TODOS los endpoints de
 * auth (signUp, signInWithPassword, resetPasswordForEmail, resend).
 *
 * Los tokens son de UN SOLO USO: tras cada llamada de auth (exitosa o
 * no) hay que llamar a reset() para obtener uno fresco antes del
 * siguiente intento — por eso el handle imperativo.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "flexible" | "compact";
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function ensureScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const started = Date.now();
    const poll = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(poll);
        resolve(window.turnstile);
      } else if (Date.now() - started > 15000) {
        window.clearInterval(poll);
        reject(new Error("Turnstile no cargó"));
      }
    }, 50);
    script.onerror = () => {
      window.clearInterval(poll);
      reject(new Error("Turnstile no cargó"));
    };
  });
}

export interface TurnstileHandle {
  /** Invalida el token actual y genera uno fresco (tokens = un solo uso). */
  reset: () => void;
}

interface Props {
  /** Recibe el token al resolverse el desafío, y null si expira o falla. */
  onToken: (token: string | null) => void;
  className?: string;
}

export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile(
  { onToken, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_ENABLED || !containerRef.current) return;
    let cancelled = false;

    ensureScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          size: "flexible",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        // Sin red hacia Cloudflare: no bloqueamos el formulario aquí —
        // si Supabase exige captcha, su error se mostrará al enviar.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!TURNSTILE_ENABLED) return null;
  return <div ref={containerRef} className={className} />;
});
