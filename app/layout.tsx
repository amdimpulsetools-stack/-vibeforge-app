import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import { QueryProvider } from "@/components/query-provider";
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
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: "Generado con VibeForge",
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
              {children}
            </LanguageProvider>
          </ThemeProvider>
        </QueryProvider>
        <Toaster
          richColors
          position="top-right"
          gap={8}
          visibleToasts={4}
          closeButton
          toastOptions={{
            duration: 4000,
          }}
        />
      </body>
    </html>
  );
}
