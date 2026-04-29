"use client";

import { useEffect, useState } from "react";
import { ListOrdered, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LegalTocItem {
  id: string;
  label: string;
}

interface LegalTocProps {
  items: LegalTocItem[];
  ariaLabel?: string;
}

export function LegalToc({ items, ariaLabel = "Tabla de contenidos" }: LegalTocProps) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
    );

    const elements = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const handleClick = (id: string) => {
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      {/* Mobile trigger */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir tabla de contenidos"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-sm text-foreground transition-colors hover:border-emerald-500/40 hover:bg-card"
        >
          <ListOrdered className="h-4 w-4 text-emerald-400" aria-hidden />
          Índice
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {ariaLabel}
              </p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar índice"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <TocList
              items={items}
              activeId={activeId}
              onItemClick={handleClick}
              ariaLabel={ariaLabel}
            />
          </div>
        </div>
      ) : null}

      {/* Desktop sticky */}
      <aside
        className="hidden lg:block"
        aria-label={ariaLabel}
      >
        <div className="sticky top-24">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            En esta página
          </p>
          <TocList
            items={items}
            activeId={activeId}
            onItemClick={handleClick}
            ariaLabel={ariaLabel}
          />
        </div>
      </aside>
    </>
  );
}

function TocList({
  items,
  activeId,
  onItemClick,
  ariaLabel,
}: {
  items: LegalTocItem[];
  activeId: string | null;
  onItemClick: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel}>
      <ul className="space-y-1">
        {items.map((item, idx) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onItemClick(item.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  isActive
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 font-mono text-[10px] tabular-nums",
                    isActive ? "text-emerald-400" : "text-muted-foreground/70"
                  )}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="leading-snug">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
