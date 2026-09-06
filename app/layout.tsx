import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { QueryProvider } from "@/components/query-provider";
import { InviteTokenHandler } from "@/components/invite-token-handler";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const plusJakarta = localFont({
  src: [
    { path: "./fonts/PlusJakartaSans-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/PlusJakartaSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/PlusJakartaSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/PlusJakartaSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/PlusJakartaSans-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/PlusJakartaSans-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const outfit = localFont({
  src: [
    { path: "./fonts/Outfit-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Outfit-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Outfit-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Outfit-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Outfit-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/JetBrainsMono-Regular.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
});

// Un solo par título/descripción para OG y Twitter, alineado con el H1 nuevo
// del hero. Sin "la contacta automáticamente" (el envío automático está
// pausado) ni promesas de facturación atribuida.
const OG_TITLE = `${APP_NAME} — Los demás sistemas guardan citas. Yenda trae de vuelta a las pacientes que dejaron de venir.`;
const OG_DESCRIPTION =
  "Los demás sistemas guardan citas. Yenda detecta a la paciente que dejó de venir, te avisa para contactarla por WhatsApp y junta agenda, historia clínica, caja y boletas SUNAT. Desde S/129 al mes, 14 días gratis sin tarjeta.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://yenda.app"),
  title: {
    default: `${APP_NAME} — Software para clínicas y consultorios en Perú | Desde S/129 al mes`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Agenda, historia clínica, cobros y boletas SUNAT en una sola pantalla, con recordatorios automáticos por WhatsApp. Hecho en Perú. Prueba 14 días gratis, sin tarjeta.",
  openGraph: {
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    locale: "es_PE",
    type: "website",
    siteName: APP_NAME,
  },
  // Twitter = OG (brief ítem 6). Tenerlos distintos significaba que la
  // tarjeta de X/Twitter prometía otra cosa que la de LinkedIn y WhatsApp,
  // que son los canales que realmente traen tráfico.
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

/**
 * Next 15 ya inyecta `width=device-width, initial-scale=1`, pero faltaba
 * `viewportFit: "cover"`: sin él `env(safe-area-inset-*)` vale siempre 0 y
 * los contenedores fixed (sidebar drawer, sheets, footer del modal de cita)
 * no pueden esquivar el notch ni el home indicator del iPhone.
 * No se fija `maximumScale`/`userScalable`: bloquear el zoom es un fallo de
 * accesibilidad; el zoom involuntario de iOS se ataca con font-size 16 px
 * en los campos (ver globals.css).
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0f" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${plusJakarta.variable} ${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased grain`}

      >
        <QueryProvider>
          <ThemeProvider>
            <LanguageProvider>
              <ConfirmDialogProvider>
                <InviteTokenHandler />
                {children}
              </ConfirmDialogProvider>
            </LanguageProvider>
          </ThemeProvider>
        </QueryProvider>
        {/* En móvil los toasts top-right tapaban el topbar y el header del
            scheduler justo donde la usuaria acaba de tocar. `mobileOffset`
            los centra con margen a ambos lados (sonner cambia a ancho
            completo bajo 600 px) y respeta la safe-area del notch.
            La posición se mantiene top-right en escritorio. */}
        <Toaster
          richColors
          position="top-right"
          gap={8}
          visibleToasts={4}
          closeButton
          mobileOffset={{
            top: "calc(env(safe-area-inset-top) + 12px)",
            left: "12px",
            right: "12px",
            bottom: "12px",
          }}
          toastOptions={{
            duration: 4000,
          }}
        />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
