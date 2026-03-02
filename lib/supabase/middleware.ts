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

  // Rutas públicas que no requieren auth
  const publicPaths = ["/", "/login", "/register", "/forgot-password", "/api", "/auth"];
  const isPublic = publicPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + "/")
  );

  // Redirigir a login si no autenticado y ruta protegida
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Para usuarios autenticados, verificar suscripción
  if (user) {
    const isSelectPlan = request.nextUrl.pathname === "/select-plan";
    const isAuthPage = ["/login", "/register"].includes(request.nextUrl.pathname);
    const isDashboard = request.nextUrl.pathname.startsWith("/dashboard") ||
      (!isPublic && !isSelectPlan && !isAuthPage);

    // Solo verificar suscripción si es relevante (auth pages o dashboard)
    if (isAuthPage || isDashboard) {
      const { data: subscription } = await supabase
        .from("organization_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .in("status", ["active", "trialing", "pending"])
        .limit(1)
        .maybeSingle();

      // Sin suscripción + intentando ir al dashboard → select-plan
      if (!subscription && isDashboard) {
        const url = request.nextUrl.clone();
        url.pathname = "/select-plan";
        return NextResponse.redirect(url);
      }

      // Auth pages → redirigir según suscripción
      if (isAuthPage) {
        const url = request.nextUrl.clone();
        url.pathname = subscription ? "/dashboard" : "/select-plan";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
