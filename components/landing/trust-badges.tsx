import type { ComponentType } from "react";
import { Receipt, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";

/**
 * Credenciales REALES, con el estado real de cada una (brief ítem 4 + los
 * ajustes acordados en la cabecera del brief):
 *  - Google: la integración de Calendar pasó la verificación de Google.
 *    No decimos "oficial" ni "partner": no lo somos.
 *  - Meta: somos proveedor tecnológico verificado en WhatsApp Business
 *    Platform. NUNCA "Meta Business Partner" (es otro programa) ni
 *    "aprobado": el App Review sigue pendiente.
 *  - SUNAT: boletas y facturas electrónicas, esto sí está en producción.
 *  - Ley 29733: cumplimos la ley de protección de datos. La inscripción del
 *    banco en el RNPDP está pendiente, así que no se menciona el registro.
 */

interface BadgeIconProps {
  className?: string;
}

/** Marca de Google Calendar: marco de 4 colores en inglete + centro blanco. */
function GoogleCalendarIcon({ className }: BadgeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id="yenda-gcal-clip">
          <rect x="3" y="3" width="18" height="18" rx="2.5" />
        </clipPath>
      </defs>
      <g clipPath="url(#yenda-gcal-clip)">
        <rect x="3" y="3" width="18" height="18" fill="#ffffff" />
        {/* arriba */}
        <path d="M3 3h18l-4 4H7L3 3Z" fill="#EA4335" />
        {/* derecha */}
        <path d="M21 3v18l-4-4V7l4-4Z" fill="#FBBC04" />
        {/* abajo */}
        <path d="M21 21H3l4-4h10l4 4Z" fill="#34A853" />
        {/* izquierda */}
        <path d="M3 21V3l4 4v10l-4 4Z" fill="#4285F4" />
      </g>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2.5"
        fill="none"
        stroke="rgba(15,23,42,0.12)"
      />
    </svg>
  );
}

/** Marca de WhatsApp en su verde oficial. */
function WhatsAppIcon({ className }: BadgeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="#25D366"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

const badges: { Icon: ComponentType<BadgeIconProps>; label: string }[] = [
  { Icon: GoogleCalendarIcon, label: "Integración verificada por Google" },
  { Icon: WhatsAppIcon, label: "Proveedor tecnológico verificado por Meta" },
  {
    Icon: ({ className }) => (
      <Receipt className={className} strokeWidth={2} aria-hidden />
    ),
    label: "Boletas y facturas SUNAT",
  },
  {
    Icon: ({ className }) => (
      <ShieldCheck className={className} strokeWidth={2} aria-hidden />
    ),
    label: "Protección de datos · Ley 29733",
  },
];

export function TrustBadges() {
  return (
    <section className="relative border-y border-slate-100 bg-slate-50/50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* 2×2 en móvil (los textos son largos: en una fila de 4 se cortaban),
            fila corrida desde sm. */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-6">
          {badges.map((b, i) => (
            <Reveal
              key={b.label}
              delay={i * 60}
              className="flex h-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:rounded-full sm:px-4 sm:py-2"
            >
              <b.Icon className="h-[18px] w-[18px] shrink-0 text-emerald-700" />
              <span className="text-xs font-medium leading-snug text-slate-700 sm:text-sm">
                {b.label}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
