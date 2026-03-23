import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.mercadopago.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
} as const;

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

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
  const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/api", "/auth", "/book"];
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
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // Redirigir a dashboard si ya autenticado e intenta ir a login/register
  if (user && ["/login", "/register"].includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // ── Onboarding + Plan check para rutas protegidas del dashboard ──
  // Single RPC replaces 3 sequential queries (profile, membership, subscription)
  if (user && !isPublic && !isOnboardingFlow) {
    const { data: session } = await supabase.rpc("get_user_session_check", {
      p_user_id: user.id,
    });

    // No membership found → no org
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/select-plan";
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    const s = session as {
      has_whatsapp: boolean;
      organization_id: string | null;
      role: string | null;
      is_founder: boolean;
      has_active_subscription: boolean;
    };

    // 1. Onboarding incomplete
    if (!s.has_whatsapp) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    // 2. No active subscription (trial expired or no plan)
    if (!s.has_active_subscription) {
      const url = request.nextUrl.clone();
      url.pathname = "/select-plan";
      url.searchParams.set("reason", "trial_expired");
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  return applySecurityHeaders(supabaseResponse);
}
