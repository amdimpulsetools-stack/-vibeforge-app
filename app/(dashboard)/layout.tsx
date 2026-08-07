import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AiAssistantPanelLazy } from "@/components/ai-assistant-panel-lazy";
import { OrganizationProvider } from "@/components/organization-provider";
import { PlanLimitWarner } from "@/components/plan-limit-warner";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
import { TourProvider } from "@/components/onboarding/tour-provider";
import { TourAutostart } from "@/components/onboarding/tour-autostart";
import { SessionRegister } from "@/components/auth/session-register";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  ACCENT_CSS,
  DEFAULT_ACCENT_THEME,
  resolveAccentTheme,
  type AccentThemeKey,
} from "@/lib/theme/accent-themes";

/**
 * Acento de marca de la org activa del usuario (mig 190).
 *
 * Va envuelto en `cache()` porque el layout es un Server Component que
 * se re-ejecuta en cada navegación server-side: sin esto sumaríamos una
 * query por render, y con esto se colapsa a una por request.
 *
 * La membresía se resuelve como en el resto del backend
 * (lib/followups/org-scope.ts): `is_active = true` + `limit(1)`. El
 * `order("created_at")` fija la elección para usuarios con varias
 * clínicas — sin ORDER BY, Postgres puede devolver una distinta en cada
 * request y el dashboard cambiaría de color al navegar.
 */
const getAccentTheme = cache(async (userId: string): Promise<AccentThemeKey> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("organizations(accent_theme)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // El select anidado llega tipado como objeto o array según la relación;
  // los types generados no conocen todavía `accent_theme` (mig 190 no se
  // ha regenerado), así que se normaliza a mano. Cualquier forma
  // inesperada cae a esmeralda vía resolveAccentTheme().
  const org = data?.organizations as unknown;
  const row = Array.isArray(org) ? org[0] : org;
  return resolveAccentTheme(
    (row as { accent_theme?: unknown } | null | undefined)?.accent_theme
  );
});

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side auth check — defense-in-depth alongside middleware
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // MFA gate — defense in depth against any auth flow that
  // forgets to route through /auth/mfa-challenge (OAuth used to
  // do this before the 2026-05-14 callback fix). If the user has
  // enrolled MFA but their session is still AAL1, force them to
  // complete the challenge before serving any dashboard page.
  //
  // getAuthenticatorAssuranceLevel returns { currentLevel,
  // nextLevel }. When nextLevel > currentLevel, a step-up is
  // pending. Specifically: aal2 needed, aal1 active.
  const { data: aal } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (
    aal &&
    aal.currentLevel === "aal1" &&
    aal.nextLevel === "aal2"
  ) {
    redirect("/auth/mfa-challenge?next=/dashboard");
  }

  // Acento de marca de la organización. Server-rendered ⇒ sin flash: el
  // HTML ya llega con el <style> correcto. Sólo se emite cuando el tema
  // NO es el default, así que la inmensa mayoría de las orgs no paga ni
  // un byte. El contenido viene de un mapa estático de strings literales
  // (lib/theme/accent-themes.ts) — jamás se interpola dato de usuario.
  const accent = await getAccentTheme(user.id);
  const accentCss = accent !== DEFAULT_ACCENT_THEME ? ACCENT_CSS[accent] : "";

  return (
    <OrganizationProvider>
      <MobileNavProvider>
        <TourProvider>
          {accentCss && (
            <style
              data-accent-theme={accent}
              dangerouslySetInnerHTML={{ __html: accentCss }}
            />
          )}
          <PlanLimitWarner />
          <TourAutostart />
          <SessionRegister />
          {/* dvh y no h-screen: en iOS Safari 100vh incluye la barra de
              URL colapsable, así que el shell medía más que la pantalla y
              el pie de las páginas quedaba debajo del chrome del
              navegador. En escritorio dvh == vh. */}
          <div className="flex h-[100dvh] overflow-hidden">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Topbar />
              {/* El gutter de página vive en un div interno, NO en el
                  scroller. Un scroll container añade su propio padding
                  del lado final al área desplazable, así que con `p-4`
                  aquí las páginas full-bleed (que cancelan ese gutter
                  con `-mx-4`) dejaban su borde derecho justo en el borde
                  del scrollport y esos 16px se convertían en scroll
                  horizontal de TODA la página: la franja vacía a la
                  derecha que se veía en móvil. Con el padding en un
                  bloque normal el ancho cuadra exacto y no sobra nada.
                  `overflow-x-hidden` queda solo como red de seguridad —
                  los scrolls laterales legítimos (tab-lists, tablas
                  anchas) viven en sus propios contenedores internos. */}
              <main className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="p-4 md:p-7">{children}</div>
              </main>
            </div>
            <AiAssistantPanelLazy />
          </div>
        </TourProvider>
      </MobileNavProvider>
    </OrganizationProvider>
  );
}
