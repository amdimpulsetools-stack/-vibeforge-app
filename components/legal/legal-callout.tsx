import type { ReactNode } from "react";
import {
  AlertTriangle,
  Info,
  ShieldCheck,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "info" | "warning" | "success" | "time";

interface LegalCalloutProps {
  variant?: Variant;
  title?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<
  Variant,
  { container: string; icon: string; defaultIcon: LucideIcon }
> = {
  info: {
    container:
      "border-l-emerald-500/70 bg-emerald-500/[0.06] [--legal-accent:theme(colors.emerald.300)]",
    icon: "text-emerald-400",
    defaultIcon: Info,
  },
  warning: {
    container:
      "border-l-amber-500/80 bg-amber-500/[0.07] [--legal-accent:theme(colors.amber.300)]",
    icon: "text-amber-400",
    defaultIcon: AlertTriangle,
  },
  success: {
    container:
      "border-l-emerald-500/70 bg-emerald-500/[0.06] [--legal-accent:theme(colors.emerald.300)]",
    icon: "text-emerald-400",
    defaultIcon: ShieldCheck,
  },
  time: {
    container:
      "border-l-violet-500/70 bg-violet-500/[0.06] [--legal-accent:theme(colors.violet.300)]",
    icon: "text-violet-300",
    defaultIcon: Clock,
  },
};

export function LegalCallout({
  variant = "info",
  title,
  icon,
  children,
  className,
}: LegalCalloutProps) {
  const styles = variantStyles[variant];
  const Icon = icon ?? styles.defaultIcon;

  return (
    <aside
      className={cn(
        "my-6 flex gap-3 rounded-r-lg border-l-4 px-4 py-4 backdrop-blur-sm",
        styles.container,
        className
      )}
      role="note"
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", styles.icon)} aria-hidden />
      <div className="space-y-1">
        {title ? (
          <p className="text-sm font-semibold text-foreground">{title}</p>
        ) : null}
        <div className="text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </aside>
  );
}
