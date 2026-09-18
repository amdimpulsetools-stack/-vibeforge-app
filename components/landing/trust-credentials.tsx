import { Plus } from "lucide-react";

/**
 * Credenciales del hero (founder, 16-sep-2026). REGLA de la landing
 * (auditoría 21-ago): solo afirmaciones verificables. Ambas lo son:
 *  - Google: verificación OAuth aprobada el 28-ago-2026 (scope
 *    calendar.events). No decimos "oficial" ni "partner".
 *  - Meta: Yenda registrada como Proveedor de tecnología de WhatsApp
 *    Business Platform con App Review aprobado el 15-sep-2026. NUNCA el
 *    badge "Meta Business Partner": es otro programa y no estamos en él.
 *
 * Marcas: los logos indican integración/credencial, no respaldo. Van como
 * SVG inline (la CSP de la landing solo permite img-src self/data/blob/
 * supabase, y así no dependemos de ningún CDN). Colores oficiales, sin
 * recolorear ni deformar. Usamos el glifo de WhatsApp (lo que la clínica
 * reconoce) y nombramos a Meta en texto.
 */

interface LogoProps {
  className?: string;
}

/** "G" multicolor de Google: paths oficiales, colores oficiales. */
export function GoogleGLogo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Glifo de WhatsApp en su verde oficial. */
export function WhatsAppLogo({ className }: LogoProps) {
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

const CREDENTIALS = [
  {
    eyebrow: "App verificada por",
    Logo: GoogleGLogo,
    name: "Google",
    detail: "Verificación OAuth aprobada",
  },
  {
    eyebrow: "Proveedor de tecnología",
    Logo: WhatsAppLogo,
    name: "WhatsApp Business Platform",
    detail: "Registro aprobado por Meta",
  },
] as const;

/** Marcas "+" decorativas en las cuatro esquinas del marco (estilo logo
 *  cloud de 21st.dev). Por eso el marco exterior es de esquinas rectas:
 *  un "+" sobre una esquina redondeada queda flotando. */
const CORNERS = [
  "-top-2 -left-2",
  "-top-2 -right-2",
  "-bottom-2 -left-2",
  "-bottom-2 -right-2",
] as const;

interface TrustCredentialsProps {
  className?: string;
}

export function TrustCredentials({ className = "" }: TrustCredentialsProps) {
  return (
    <div className={`relative mx-auto w-full max-w-xl ${className}`}>
      {CORNERS.map((pos) => (
        <Plus
          key={pos}
          aria-hidden
          strokeWidth={1.5}
          className={`pointer-events-none absolute z-10 h-4 w-4 text-slate-300 ${pos}`}
        />
      ))}
      {/* Dos credenciales de peso idéntico: misma tarjeta, sin fondo
          alterno (con dos celdas, alternar se lee como "una destacada").
          Lado a lado desde sm (640px). Por debajo, apiladas y alineadas a
          la izquierda: a 390px dos columnas parten "WhatsApp Business
          Platform" en tres líneas. */}
      <ul
        aria-label="Credenciales verificadas"
        className="grid grid-cols-1 divide-y divide-slate-200 border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0"
      >
        {CREDENTIALS.map(({ eyebrow, Logo, name, detail }) => (
          <li
            key={name}
            className="flex flex-col items-start justify-center gap-1 px-4 py-3 text-left sm:items-center sm:gap-1.5 sm:px-3 sm:py-5 sm:text-center"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {eyebrow}
            </span>
            <span className="inline-flex items-center gap-2">
              <Logo className="h-5 w-5 shrink-0" />
              <span className="text-sm font-semibold leading-tight text-slate-900">
                {name}
              </span>
            </span>
            <span className="text-xs text-slate-500">{detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
