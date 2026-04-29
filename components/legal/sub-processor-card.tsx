import { ExternalLink, type LucideIcon } from "lucide-react";

interface SubProcessorCardProps {
  name: string;
  purpose: string;
  region?: string;
  policyUrl: string;
  icon?: LucideIcon;
}

export function SubProcessorCard({
  name,
  purpose,
  region,
  policyUrl,
  icon: Icon,
}: SubProcessorCardProps) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-border/70 bg-card/40 p-4 transition-colors hover:border-emerald-500/40 hover:bg-card/70">
      <div className="mb-2 flex items-center gap-2">
        {Icon ? (
          <Icon className="h-4 w-4 text-emerald-400" aria-hidden />
        ) : (
          <span
            aria-hidden
            className="h-2 w-2 rounded-full bg-emerald-400/80"
          />
        )}
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        {region ? (
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {region}
          </span>
        ) : null}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        {purpose}
      </p>

      <a
        href={policyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-400 transition-colors hover:text-emerald-300"
      >
        Política de privacidad
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}
