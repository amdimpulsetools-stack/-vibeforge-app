import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LegalSectionProps {
  id: string;
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function LegalSection({
  id,
  number,
  title,
  description,
  children,
  className,
}: LegalSectionProps) {
  return (
    <section
      id={id}
      // scroll-mt offsets the sticky header so anchor jumps don't clip the title
      className={cn("scroll-mt-24 border-t border-border/60 py-10 sm:py-14", className)}
      aria-labelledby={`${id}-title`}
    >
      <div className="mb-6 flex items-baseline gap-4">
        <span
          aria-hidden
          className="select-none bg-gradient-to-br from-emerald-300 to-emerald-600 bg-clip-text font-mono text-2xl font-bold tracking-tight text-transparent sm:text-3xl"
        >
          {number}
        </span>
        <h2
          id={`${id}-title`}
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          {title}
        </h2>
      </div>

      {description ? (
        <p className="mb-6 max-w-3xl text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      <div className="max-w-3xl space-y-4 text-base leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
