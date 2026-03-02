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
  const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/api", "/auth"];
  const isPublic = publicPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path + "/")
  );

  const isSelectPlan = request.nextUrl.pathname === "/select-plan";
  const isWaitingForPlan = request.nextUrl.pathname === "/waiting-for-plan";

  // Redirigir a login si no autenticado y ruta protegida
  if (!user && !isPublic && !isSelectPlan && !isWaitingForPlan) {
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
  if (user && !isPublic && !isSelectPlan && !isWaitingForPlan && !request.nextUrl.pathname.startsWith("/api")) {
    try {
      // Admins (user_profiles.role = 'admin') bypass all plan checks
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "admin") {
        return supabaseResponse;
      }

      const { data: members } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .limit(1);

      if (members && members.length > 0) {
        // Non-owner members skip plan check — plan is the owner's responsibility
        if (members[0].role !== "owner") {
          return supabaseResponse;
        }

        // Only owners need an active subscription
        const { data: subs } = await supabase
          .from("organization_subscriptions")
          .select("id")
          .eq("organization_id", members[0].organization_id)
          .in("status", ["active", "trialing"])
          .limit(1);

        if (!subs || subs.length === 0) {
          const url = request.nextUrl.clone();
          url.pathname = "/select-plan";
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // If subscription check fails, let user through to avoid blocking
    }
  }

  return supabaseResponse;
}
