import { Repeat } from "lucide-react";

type Size = "xs" | "sm" | "md";

const sizeClasses: Record<Size, string> = {
  xs: "gap-0.5 rounded-full px-1.5 py-0 text-[9px]",
  sm: "gap-0.5 rounded-full px-2 py-0.5 text-[10px]",
  md: "gap-1 rounded-full px-2.5 py-0.5 text-xs",
};

const iconSizeClasses: Record<Size, string> = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
};

export function RecurringBadge({
  size = "sm",
  label = "Recurrente",
}: {
  size?: Size;
  label?: string;
}) {
  return (
    <span
      title="Paciente con 2+ citas completadas"
      className={`inline-flex items-center font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ${sizeClasses[size]}`}
    >
      <Repeat className={iconSizeClasses[size]} />
      {label}
    </span>
  );
}

export function RecurringDot({ className = "" }: { className?: string }) {
  return (
    <span
      title="Paciente recurrente"
      aria-label="Paciente recurrente"
      className={`inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 ${className}`}
    />
  );
}
