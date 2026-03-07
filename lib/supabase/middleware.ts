import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Rutas públicas que no requieren auth
  const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/api", "/auth"];
  const isPublic = publicPaths.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );

  // Rutas del flujo de onboarding/plan (accesibles con auth pero sin plan)
  const isOnboardingFlow =
    pathname === "/onboarding" ||
    pathname === "/select-plan" ||
    pathname === "/waiting-for-plan";

  // Redirigir a login si no autenticado y ruta protegida
  if (!user && !isPublic && !isOnboardingFlow) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirigir a dashboard si ya autenticado e intenta ir a login/register
  if (user && ["/login", "/register"].includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // ── Onboarding + Plan check para rutas protegidas del dashboard ──
  // Solo aplica a usuarios autenticados accediendo rutas del dashboard
  if (user && !isPublic && !isOnboardingFlow) {
    // 1. Verificar si completó onboarding (tiene whatsapp_phone)
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("whatsapp_phone")
      .eq("id", user.id)
      .single();

    if (!profile?.whatsapp_phone) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return NextResponse.redirect(url);
    }

    // 2. Verificar membresía a organización
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      // Sin organización — enviar a select-plan para que se auto-cree
      const url = request.nextUrl.clone();
      url.pathname = "/select-plan";
      return NextResponse.redirect(url);
    }

    // 3. Verificar suscripción activa de la organización
    const { data: subscription } = await supabase
      .from("organization_subscriptions")
      .select("status")
      .eq("organization_id", membership.organization_id)
      .in("status", ["active", "trialing"])
      .limit(1)
      .single();

    if (!subscription) {
      // Sin plan activo — redirigir según rol
      const url = request.nextUrl.clone();
      if (membership.role === "owner") {
        url.pathname = "/select-plan";
      } else {
        url.pathname = "/waiting-for-plan";
      }
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
