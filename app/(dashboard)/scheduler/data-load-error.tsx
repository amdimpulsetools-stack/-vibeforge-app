"use client";

import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Aviso de "no se pudieron cargar los datos" para las listas de la agenda y
 * del historial.
 *
 * Por qué existe (incidente 30-sep-2026): la mig 273 dejó dos FKs entre
 * `patient_payments` y `appointments`, PostgREST ya no pudo resolver el
 * embed de la agenda (PGRST201) y el código trataba el error como "lista
 * vacía": la agenda se vio en blanco, sin ningún aviso, con todas las citas
 * intactas en la BD. Regla desde entonces: una consulta que falla LANZA, la
 * pantalla lo dice en voz alta (con Reintentar) y Sentry se entera — nunca
 * una lista vacía silenciosa.
 */

/** Campos de un error de PostgREST (`PostgrestError` de supabase-js). */
type PostgrestErrorLike = {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
  details?: string | null;
};

/**
 * Error que lanza un `queryFn` cuando la consulta a PostgREST falla. Conserva
 * code / hint / details para el aviso y para Sentry; `message` lleva una
 * etiqueta de contexto delante ("Agenda (citas): PGRST201 — …").
 */
export class PostgrestLoadError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  readonly details: string | null;
  /** Mensaje de PostgREST tal cual, sin la etiqueta de contexto. */
  readonly pgMessage: string;

  constructor(label: string, pg: PostgrestErrorLike) {
    const pgMessage = cleanText(pg.message) ?? "Error desconocido";
    const code = cleanText(pg.code);
    super(`${label}: ${code ? `${code} — ` : ""}${pgMessage}`);
    this.name = "PostgrestLoadError";
    this.code = code;
    this.hint = cleanText(pg.hint);
    this.details = cleanText(pg.details);
    this.pgMessage = pgMessage;
  }
}

export type LoadErrorInfo = {
  code: string | null;
  message: string;
  hint: string | null;
  details: string | null;
};

function cleanText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Normaliza cualquier error (PostgrestLoadError, Error, objeto) a sus campos. */
export function getLoadErrorInfo(error: unknown): LoadErrorInfo {
  if (error instanceof PostgrestLoadError) {
    return {
      code: error.code,
      message: error.pgMessage,
      hint: error.hint,
      details: error.details,
    };
  }
  if (error && typeof error === "object") {
    const e = error as PostgrestErrorLike;
    return {
      code: cleanText(e.code),
      message: cleanText(e.message) ?? "Error desconocido",
      hint: cleanText(e.hint),
      details: cleanText(e.details),
    };
  }
  return {
    code: null,
    message: cleanText(error) ?? "Error desconocido",
    hint: null,
    details: null,
  };
}

/**
 * Reporta a Sentry un error de carga UNA sola vez por error distinto: ni en
 * cada re-render ni en cada "Reintentar" que vuelve a fallar igual (React
 * Query crea un objeto Error nuevo en cada intento; la firma
 * code|message|details es la que decide). `extra` se lee en el momento del
 * reporte (p. ej. el rango visible), sin volver a disparar el efecto.
 */
export function useReportLoadError(
  error: unknown,
  {
    area,
    query,
    extra,
  }: { area: string; query: string; extra?: Record<string, unknown> }
) {
  const lastSignatureRef = useRef<string | null>(null);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  useEffect(() => {
    if (!error) {
      // Recuperada: el próximo error (aunque sea idéntico) es otro episodio.
      lastSignatureRef.current = null;
      return;
    }
    const info = getLoadErrorInfo(error);
    const signature = `${info.code ?? ""}|${info.message}|${info.details ?? ""}`;
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    Sentry.captureException(error, {
      tags: { area, query },
      extra: {
        code: info.code,
        hint: info.hint,
        details: info.details,
        ...extraRef.current,
      },
    });
  }, [error, area, query]);
}

const TONES = {
  destructive: {
    box: "border-destructive/30 bg-destructive/10",
    icon: "text-destructive",
    title: "text-destructive",
    button: "border-destructive/40 text-destructive hover:bg-destructive/15",
  },
  warning: {
    box: "border-amber-500/40 bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-900 dark:text-amber-200",
    button:
      "border-amber-500/40 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300",
  },
} as const;

/** Tope del detalle técnico: es una pista para soporte, no un volcado. */
const MAX_DETAIL_CHARS = 300;

/**
 * Franja de error bajo el header (mismo formato que RescheduleBanner): no
 * oculta nada de la pantalla, solo avisa y ofrece Reintentar.
 */
export function DataLoadError({
  title,
  description,
  error,
  onRetry,
  retrying = false,
  tone = "destructive",
  className,
  labels,
}: {
  title: string;
  description?: string;
  error?: unknown;
  onRetry?: () => void;
  /** Hay un reintento en curso: el botón muestra spinner y se deshabilita. */
  retrying?: boolean;
  /** destructive = datos principales; warning = datos secundarios. */
  tone?: keyof typeof TONES;
  className?: string;
  /** Textos del botón y del detalle (inglés en orgs con la interfaz en inglés). */
  labels?: { retry?: string; retrying?: string; details?: string };
}) {
  const info = error ? getLoadErrorInfo(error) : null;
  const styles = TONES[tone];
  const detail = info
    ? `${info.code ? `${info.code} · ` : ""}${info.message}`
    : null;

  return (
    <div
      role="alert"
      className={cn("shrink-0 border-b px-3 py-2.5 md:px-4", styles.box, className)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle
            className={cn("mt-0.5 h-4 w-4 shrink-0", styles.icon)}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold leading-snug", styles.title)}>
              {title}
            </p>
            {description && (
              <p className="mt-0.5 text-xs leading-snug text-foreground/80 md:text-sm">
                {description}
              </p>
            )}
            {detail && (
              <details className="mt-1 text-[11px] text-muted-foreground md:text-xs">
                <summary className="cursor-pointer select-none rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {labels?.details ?? "Detalle técnico"}
                </summary>
                <p className="mt-1 break-words font-mono">
                  {detail.length > MAX_DETAIL_CHARS
                    ? `${detail.slice(0, MAX_DETAIL_CHARS)}…`
                    : detail}
                </p>
              </details>
            )}
          </div>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            aria-busy={retrying}
            className={cn(
              "ml-6 inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border bg-background/60 px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:ml-0 sm:h-8",
              styles.button
            )}
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {retrying ? labels?.retrying ?? "Reintentando…" : labels?.retry ?? "Reintentar"}
          </button>
        )}
      </div>
    </div>
  );
}
