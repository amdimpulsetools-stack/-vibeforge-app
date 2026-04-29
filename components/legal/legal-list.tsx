import type { ReactNode } from "react";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LegalListProps {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function LegalList({ children, className }: LegalListProps) {
  return (
    <ul className={cn("space-y-2.5", className)} role="list">
      {children}
    </ul>
  );
}

interface LegalListItemProps {
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function LegalListItem({
  children,
  icon: Icon = CheckCircle2,
  className,
}: LegalListItemProps) {
  return (
    <li className={cn("flex items-start gap-3", className)}>
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
        aria-hidden
      />
      <span className="text-sm leading-relaxed text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </span>
    </li>
  );
}
