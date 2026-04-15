import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV === "development";

const supabaseDomain = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co";

const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://${supabaseDomain} https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.mercadopago.com`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ") + ";";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": csp,
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
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
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
  const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/api", "/auth", "/book", "/producto", "/blog", "/base-conocimientos", "/calculadora-whatsapp", "/contacto", "/socios", "/soporte"];
  const isPublic = publicPaths.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );

  // Rutas del flujo de onboarding/plan (accesibles con auth pero sin plan)
  const isOnboardingFlow =
    pathname === "/onboarding" ||
    pathname === "/select-plan" ||
    pathname === "/waiting-for-plan";

  // Founder panel — requires auth but skips subscription check
  const isFounderPanel = pathname.startsWith("/founder-dashboard");

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
  if (user && !isPublic && !isOnboardingFlow && !isFounderPanel) {
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
      onboarding_completed: boolean;
      organization_id: string | null;
      role: string | null;
      is_founder: boolean;
      has_active_subscription: boolean;
    };

    // 1. Onboarding incomplete — only for owners/admins (invited members skip this)
    // Uses org-level `onboarding_completed_at` flag (migration 085). Falls back to
    // `has_whatsapp` so deploys before the migration lands don't break the gate.
    const onboardingDone = s.onboarding_completed ?? s.has_whatsapp;
    if (!onboardingDone && (s.role === "owner" || s.role === "admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    // 2. No active subscription (trial expired or no plan)
    if (!s.has_active_subscription) {
      const url = request.nextUrl.clone();
      // Owner/admin → select-plan (they manage billing)
      // Members (doctor/receptionist) → waiting-for-plan (can't manage billing)
      const canManageBilling = s.is_founder || s.role === "owner" || s.role === "admin";
      if (canManageBilling) {
        url.pathname = "/select-plan";
        url.searchParams.set("reason", "trial_expired");
      } else {
        url.pathname = "/waiting-for-plan";
      }
      return applySecurityHeaders(NextResponse.redirect(url));
    }
  }

  return applySecurityHeaders(supabaseResponse);
}
