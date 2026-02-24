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

  const isSelectPlan = request.nextUrl.pathname === "/select-plan";

  // Redirigir a login si no autenticado y ruta protegida
  if (!user && !isPublic && !isSelectPlan) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Redirigir a dashboard si ya autenticado e intenta ir a auth pages (except select-plan)
  if (user && ["/login", "/register"].includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Check if authenticated user accessing dashboard needs a plan
  if (user && !isPublic && !isSelectPlan && !request.nextUrl.pathname.startsWith("/api")) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (membership) {
      const { data: sub } = await supabase
        .from("organization_subscriptions")
        .select("id")
        .eq("organization_id", membership.organization_id)
        .in("status", ["active", "trialing"])
        .limit(1)
        .single();

      if (!sub) {
        const url = request.nextUrl.clone();
        url.pathname = "/select-plan";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
