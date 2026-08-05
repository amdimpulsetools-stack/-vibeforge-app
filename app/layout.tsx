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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://yenda.app"),
  title: {
    default: `${APP_NAME} — Gestión integral para clínicas y consultorios médicos`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Agenda inteligente, gestión de pacientes, control de equipo y asistente con IA. Desde el doctor independiente hasta la clínica con 10 consultorios. Planes desde S/129/mes.",
  openGraph: {
    title: `${APP_NAME} — Tu clínica completa en una sola plataforma`,
    description:
      "Software de gestión médica con IA incluida. Diseñado para LATAM.",
    locale: "es_PE",
    type: "website",
    siteName: APP_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — Gestión integral para clínicas`,
    description:
      "Agenda inteligente, pacientes, reportes y asistente IA. Desde doctor independiente hasta clínica grande.",
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
