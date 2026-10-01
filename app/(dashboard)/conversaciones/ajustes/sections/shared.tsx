"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Piezas comunes de las secciones de Ajustes de Conversaciones. */

export const input =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export const INTENT_LABEL: Record<string, string> = {
  precio: "Precio",
  agendar: "Quiere agendar",
  reprogramar: "Reprogramar",
  informacion: "Información",
  resultado: "Resultados",
  queja: "Queja / reclamo",
  saludo: "Saludo",
  objecion: "Objeción",
  otro: "Otro",
};

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Chip({ tone, children }: { tone: "red" | "amber" | "muted" | "primary"; children: React.ReactNode }) {
  const cls =
    tone === "red"
      ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : tone === "amber"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : tone === "primary"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function SettingRow({ title, hint, control }: { title: string; hint: string; control: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {control}
    </div>
  );
}

export function SaveButton({
  saving,
  children = "Guardar",
  onClick,
  disabled,
  className,
}: {
  saving: boolean;
  children?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60",
        className,
      )}
    >
      {saving && <Loader2 className="h-4 w-4 animate-spin" />} {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted", className)}>
      {children}
    </button>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">{children}</div>;
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "No se pudieron cargar los datos.";
  return (
    <div className="rounded-lg border border-red-300/60 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
      <p className="font-medium">No se pudo cargar esta sección.</p>
      <p className="mt-0.5 text-xs opacity-80">{msg}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-semibold underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

/** "una por línea" ⇄ lista. */
export function linesToList(s: string, max = 20): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}
export function listToLines(a: string[]): string {
  return a.join("\n");
}
