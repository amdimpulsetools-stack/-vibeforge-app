/**
 * WhatsApp brand glyph (phone-in-bubble).
 *
 * lucide no trae un icono oficial de WhatsApp, así que el path vive aquí.
 * Es el mismo trazado que ya usaba la tarjeta de la integración en
 * app/(dashboard)/settings/integraciones-tab.tsx — ahora centralizado
 * para que todos los botones que abren wa.me muestren exactamente el
 * mismo glifo.
 *
 * Color: por defecto `currentColor`, para que herede el color del botón
 * (blanco sobre bg-wa-700 en los sólidos, wa-700/wa-500 en los outline).
 * Ver la escala `wa-*` en app/globals.css: es marca de plataforma y NO
 * se temiza con el acento de la organización.
 *
 * Cuándo usarlo: SOLO cuando la acción abre o envía por WhatsApp
 * (wa.me / api.whatsapp.com / window.open a WhatsApp). Para "copiar
 * mensaje", "guardar configuración" o wizards usa un icono neutro de
 * lucide y el color de marca del tema.
 */
export function WhatsAppIcon({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="currentColor"
        d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.81 14.07c-.25.7-1.43 1.34-2.01 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.99-.32-1.7-.63-2.99-1.29-4.95-4.31-5.1-4.51-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.59-.37.79-.37.2 0 .39.01.57.01.18 0 .42-.07.66.5.25.59.84 2.05.91 2.2.07.15.12.32.02.52-.1.2-.15.32-.3.5-.15.18-.31.4-.45.54-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.05 1.13 1 2.08 1.32 2.38 1.47.3.15.47.13.65-.07.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.71.81 2 .96.3.15.49.22.56.34.07.13.07.74-.18 1.45z"
      />
    </svg>
  );
}

/**
 * Clases reutilizables para los botones cuya acción abre WhatsApp.
 * Solo color + estados; el tamaño, layout y radio los pone cada llamador
 * (los botones del scheduler van de h-11 en móvil a py-1.5 en desktop).
 *
 * - `waSolidButton`: acción primaria ("Enviar WhatsApp"). bg-wa-700 con
 *   texto blanco = 5.29:1, AA en claro y oscuro (el fondo es sólido, no
 *   depende del tema).
 * - `waOutlineButton`: acción secundaria, cuando ya hay otro primario en
 *   la fila. El borde lleva el verde del logo (wa-500) y el texto baja a
 *   wa-700 en claro para conservar contraste sobre la tarjeta blanca.
 */
export const waSolidButton =
  "bg-wa-700 text-white transition-colors hover:bg-wa-800 active:bg-wa-800 disabled:cursor-not-allowed disabled:opacity-50";

export const waOutlineButton =
  "border border-wa-500/40 text-wa-700 transition-colors hover:bg-wa-500/10 hover:border-wa-500/60 dark:text-wa-500 disabled:cursor-not-allowed disabled:opacity-50";
