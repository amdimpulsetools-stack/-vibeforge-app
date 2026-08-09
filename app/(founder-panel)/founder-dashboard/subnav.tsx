"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Sub-pestañas de segundo nivel del founder panel.
 *
 * La nav principal pasó de 10 ítems a 5 (auditoría de navegación 2026-08-08:
 * con 10 el header no cabía en NINGÚN ancho y lo diario — Soporte — estaba en
 * la posición 8). Lo que salió de la nav no desapareció: vive aquí, a un
 * click de su grupo. Cada pestaña sigue siendo su propia ruta, así que ningún
 * enlace ni deep-link existente se rompe.
 */

interface Tab {
  label: string;
  href: string;
}

function SubNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border/60 px-1 pb-px">
      {tabs.map(({ label, href }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-amber-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

export function ClinicsSubNav() {
  return (
    <SubNav
      tabs={[
        { label: "Resumen", href: "/founder-dashboard/owners" },
        { label: "Organizaciones", href: "/founder-dashboard/organizations" },
        { label: "Equipos", href: "/founder-dashboard/users" },
      ]}
    />
  );
}

export function MoneySubNav() {
  return (
    <SubNav
      tabs={[
        { label: "Resumen", href: "/founder-dashboard/revenue" },
        { label: "Pagos y reembolsos", href: "/founder-dashboard/refunds" },
      ]}
    />
  );
}

export function SystemSubNav() {
  return (
    <SubNav
      tabs={[
        { label: "Salud", href: "/founder-dashboard/health" },
        { label: "Plugins", href: "/founder-dashboard/plugins" },
        { label: "Ajustes", href: "/founder-dashboard/settings" },
      ]}
    />
  );
}
