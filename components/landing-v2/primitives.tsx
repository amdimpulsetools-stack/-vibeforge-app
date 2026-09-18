import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Piezas visuales de la landing `/2`. Misma marca que la home (emerald como
 * acento, Outfit en titulares, Plus Jakarta Sans en el cuerpo, violeta solo
 * para IA/automatización) sobre una estructura editorial: eyebrows en
 * mayúsculas con tracking, titulares grandes y ajustados, tarjetas con una
 * leve inclinación y subrayado "a mano" bajo la frase clave del H1.
 */

export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  dot = false,
  tone = "green",
  className,
}: {
  children: ReactNode;
  dot?: boolean;
  tone?: "green" | "light" | "violet" | "muted";
  className?: string;
}) {
  const tones = {
    green: "text-emerald-700",
    light: "text-emerald-300",
    violet: "text-violet-600",
    muted: "text-slate-500",
  } as const;
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em]",
        tones[tone],
        className
      )}
    >
      {dot && <StatusDot />}
      {children}
    </p>
  );
}

export function StatusDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]",
        className
      )}
    />
  );
}

/** Subrayado "a mano" bajo una palabra del titular (SVG inline, sin
 *  dependencias). Se posiciona bajo el texto y no altera el flujo. */
export function Underlined({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="relative z-10">{children}</span>
      <svg
        aria-hidden
        viewBox="0 0 200 16"
        preserveAspectRatio="none"
        className="pointer-events-none absolute -bottom-1.5 -left-1 h-[0.32em] w-[104%] text-emerald-300"
      >
        <path
          d="M3 11 C 40 4, 90 3, 197 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Arrow({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("text-[1.15em] font-normal leading-none", className)}>
      →
    </span>
  );
}

export const btnBase =
  "inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,box-shadow,background-color,opacity] duration-[var(--dur-base)] ease-[var(--ease-standard)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";

export const btnPrimary = cn(
  btnBase,
  "gradient-primary min-h-12 px-6 text-white shadow-lg shadow-emerald-900/10 hover:-translate-y-0.5 hover:opacity-95 hover:shadow-xl"
);

export const btnOutline = cn(
  btnBase,
  "min-h-12 border border-slate-200 bg-white px-6 text-slate-800 shadow-sm hover:border-emerald-500 hover:bg-emerald-50/60"
);

export const btnSmall = "min-h-10 px-4 text-[13px]";

/** Botón claro sobre fondo oscuro (equivale al "lime" de la referencia:
 *  emerald claro sobre emerald-950, dentro de los matices de la marca). */
export const btnLight = cn(
  btnBase,
  "min-h-12 bg-emerald-300 px-6 text-emerald-950 shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:bg-emerald-200"
);

export const textLink =
  "inline-flex items-center gap-2 text-sm font-semibold text-slate-800 transition-colors hover:text-emerald-700 focus-visible:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-emerald-500";

export function SectionTitle({
  children,
  className,
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      className={cn(
        "font-display text-[1.9rem] font-semibold leading-[1.15] tracking-[-0.03em] text-slate-900 sm:text-4xl lg:text-[2.75rem]",
        className
      )}
    >
      {children}
    </Tag>
  );
}

/** Avatar de iniciales para los mockups. */
export function Initials({
  children,
  tone = "green",
  className,
}: {
  children: ReactNode;
  tone?: "green" | "lilac" | "peach" | "sky";
  className?: string;
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-800",
    lilac: "bg-violet-50 text-violet-700",
    peach: "bg-amber-50 text-amber-800",
    sky: "bg-sky-50 text-sky-800",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Etiqueta de estado para filas de los mockups. */
export function Tag({
  children,
  tone = "green",
  className,
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "violet" | "slate";
  className?: string;
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-600",
  } as const;
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-md px-1.5 py-1 text-[9px] font-medium leading-none",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
