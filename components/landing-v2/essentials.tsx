import type { ComponentType } from "react";
import { Receipt, ShieldCheck } from "lucide-react";
import { GoogleCalendarIcon, WhatsAppIcon } from "@/components/landing/trust-badges";
import { ESSENTIALS } from "./content";
import { Container } from "./primitives";

/**
 * Franja bajo el hero: qué incluye Yenda en una línea + las credenciales
 * reales (mismas cuatro de la home, con su redacción exacta: Google
 * "integración verificada", Meta "proveedor tecnológico verificado", SUNAT,
 * Ley 29733). Los logos de terceros son los SVG inline que ya usa la home.
 */
const BADGES: { Icon: ComponentType<{ className?: string }>; label: string }[] = [
  { Icon: GoogleCalendarIcon, label: "Integración verificada por Google" },
  { Icon: WhatsAppIcon, label: "Proveedor tecnológico verificado por Meta" },
  {
    Icon: ({ className }) => <Receipt className={className} strokeWidth={2} aria-hidden />,
    label: "Boletas y facturas SUNAT",
  },
  {
    Icon: ({ className }) => <ShieldCheck className={className} strokeWidth={2} aria-hidden />,
    label: "Protección de datos · Ley 29733",
  },
];

export function EssentialsV2() {
  return (
    <section aria-label="Lo esencial y credenciales" className="border-t border-slate-200">
      <Container className="flex flex-col gap-6 py-7 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
        <p className="max-w-md text-[13.5px] leading-relaxed text-slate-600">
          <strong className="font-semibold text-slate-900">{ESSENTIALS.lead}</strong>{" "}
          {ESSENTIALS.rest}
        </p>
        <ul aria-label="Credenciales verificadas" className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-7">
          {BADGES.map(({ Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5 text-[12.5px] font-medium text-slate-800">
              <Icon className="h-[18px] w-[18px] shrink-0 text-emerald-700" />
              {label}
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
