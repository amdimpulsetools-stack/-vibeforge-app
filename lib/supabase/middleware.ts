import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { TERMS_VERSION } from "@/lib/constants";
import {
  DEVICE_ID_COOKIE,
  deviceLimitsEnabled,
  getCachedSessionStatus,
  setCachedSessionStatus,
} from "@/lib/auth/session-limits";
import { isSessionRevoked, touchSessionLastSeen } from "@/lib/auth/sessions";

const isDev = process.env.NODE_ENV === "development";

const supabaseDomain = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "*.supabase.co";

// challenges.cloudflare.com = Turnstile (CAPTCHA de los formularios de
// auth): su script se carga desde ahí y el desafío corre en un iframe
// del mismo origen. Sin las dos entradas, el widget no renderiza.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
  : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://${supabaseDomain} https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.mercadopago.com`,
  "frame-src 'self' https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ") + ";";

// CSP SOLO para /pagar (página pública de cobro al paciente con Culqi
// Checkout Custom). La política global mantiene `script-src 'self'` — estos
// orígenes extra se conceden únicamente en esta ruta:
//   - script-src https://js.culqi.com      → ahí vive el script checkout-js.
//   - script-src https://checkout.culqi.com → chunks secundarios que el
//     checkout carga desde su propio host.
//   - frame-src  https://checkout.culqi.com y https://js.culqi.com → el
//     modal del checkout se renderiza en un iframe alojado por Culqi (la
//     tokenización de la tarjeta ocurre DENTRO de ese iframe, nunca en
//     nuestro origen).
//   - connect-src https://api.culqi.com, https://secure.culqi.com y
//     https://checkout.culqi.com → XHR de tokenización/antifraude que el
//     script dispara desde el contexto de la página.
// Validar en sandbox con llaves pk_test_ (ver app/pagar/[token]/
// culqi-checkout.ts); si Culqi usa un origen adicional, añadirlo AQUÍ y
// documentarlo, no en la política global.
const cspPagar = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.culqi.com https://checkout.culqi.com"
    : "script-src 'self' 'unsafe-inline' https://js.culqi.com https://checkout.culqi.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://${supabaseDomain} https://*.supabase.co wss://*.supabase.co https://api.culqi.com https://secure.culqi.com https://checkout.culqi.com`,
  "frame-src 'self' https://checkout.culqi.com https://js.culqi.com",
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

// ── Caché in-memory del RPC get_user_session_check ──────────────
// Mismo patrón (y mismo TTL) que getCachedSessionStatus en
// lib/auth/session-limits.ts. Sin esto el RPC corre una vez por
// navegación Y una vez por prefetch de <Link>: con ~20 links
// prefetcheables en el sidebar son decenas de roundtrips a la DB por
// sesión, todos devolviendo lo mismo.
//
// REGLA DE SEGURIDAD: solo se cachea el resultado cuando TODAS las
// puertas pasan (usuario onboardeado, términos al día, suscripción
// activa, sin suspensión). Un resultado que provoca redirect NO se
// cachea nunca — así, en cuanto el usuario remedia el estado (acepta
// términos, completa onboarding, contrata plan), la siguiente
// navegación consulta la DB fresca y no queda atrapado en un bucle de
// redirects durante el TTL. El coste es que una revocación/expiración
// tarda como mucho SESSION_CHECK_TTL_MS en aplicarse, igual que la
// caché de device-limits que ya está en producción.
type SessionCheck = {
  has_whatsapp: boolean;
  onboarding_completed: boolean;
  organization_id: string | null;
  role: string | null;
  is_founder: boolean;
  has_active_subscription: boolean;
  all_memberships_inactive?: boolean;
  membership_count?: number;
  accepted_terms_at?: string | null;
  accepted_terms_version?: string | null;
};

const SESSION_CHECK_TTL_MS = 30_000;
const SESSION_CHECK_MAX_ENTRIES = 500;
const sessionCheckCache = new Map<
  string,
  { session: SessionCheck; checkedAt: number }
>();

function getCachedSessionCheck(userId: string): SessionCheck | null {
  const cached = sessionCheckCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.checkedAt > SESSION_CHECK_TTL_MS) {
    sessionCheckCache.delete(userId);
    return null;
  }
  return cached.session;
}

function setCachedSessionCheck(userId: string, session: SessionCheck): void {
  // Cota simple para que la instancia no acumule usuarios indefinidamente:
  // al llegar al tope se descarta la entrada más antigua (inserción = orden
  // de iteración en Map).
  if (sessionCheckCache.size >= SESSION_CHECK_MAX_ENTRIES) {
    const oldest = sessionCheckCache.keys().next();
    if (!oldest.done) sessionCheckCache.delete(oldest.value);
  }
  sessionCheckCache.set(userId, { session, checkedAt: Date.now() });
}

function applySecurityHeaders(
  response: NextResponse,
  pathname?: string
): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  // La ruta pública de pago necesita los orígenes de Culqi (ver cspPagar).
  if (pathname === "/pagar" || pathname?.startsWith("/pagar/")) {
    response.headers.set("Content-Security-Policy", cspPagar);
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

  // ── Device-limit enforcement ────────────────────────────────────
  // If the user has a JWT but their (user, device) session was
  // revoked from another device, force them out. The check is
  // cached 30s in-memory per instance to avoid hammering the DB
  // on rapid navigation. Internal API paths and auth callbacks
  // are exempt — they don't need a session row yet (the very
  // first /api/auth/session/register call IS where the row is
  // created).
  //
  // Strict failure mode: if the cookie or device_id are missing
  // we DO NOT revoke — we let the client-side hook on the next
  // page render create the cookie + register the session. The
  // worst case is a one-page lag where revocation isn't enforced
  // yet, which is acceptable for the first navigation post-login.
  if (
    deviceLimitsEnabled() &&
    user &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/auth/")
  ) {
    const deviceId = request.cookies.get(DEVICE_ID_COOKIE)?.value;
    if (deviceId) {
      const cached = getCachedSessionStatus(user.id, deviceId);
      let revoked: boolean | null = cached;
      if (revoked === null) {
        // Cache miss — query the DB.
        //
        // CRITICAL: use isSessionRevoked, NOT isSessionActive. The
        // former returns true ONLY when the row exists with a
        // revoked_at value. The latter conflates "no row yet"
        // (lazy-create scenario) with "explicitly revoked", which
        // would lock out every authenticated user the moment the
        // feature flag flips ON for the first time (the
        // auth_sessions table starts empty). Real prod incident
        // 2026-05-15: sign-out loop for every user after the
        // env var case-insensitive fix activated the feature
        // for the first time.
        revoked = await isSessionRevoked(user.id, deviceId);
        setCachedSessionStatus(user.id, deviceId, revoked);
      }
      if (revoked) {
        // Sign out so the JWT cookies get cleared, then redirect
        // to /login with a message the page can surface.
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("reason", "session_revoked");
        return applySecurityHeaders(NextResponse.redirect(url));
      }
      // Bump last_seen_at fire-and-forget. Errors swallowed —
      // it's purely informational for /account/devices.
      // No await — must not block the request path.
      void touchSessionLastSeen(user.id, deviceId);
    }
  }

  // Rutas públicas que no requieren auth.
  // /privacy, /terms y /data-deletion DEBEN ser públicas: el App Review
  // de Meta las visita como anónimo — con redirect a login, rechazo
  // automático (auditoría 12-ago-2026; estaban fuera de esta lista y
  // producción mandaba las páginas legales al login).
  // /pagar = enlace público de cobro al paciente (Culqi): se abre desde
  // WhatsApp sin sesión; con redirect a login el paciente nunca podría pagar.
  const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/api", "/auth", "/book", "/pagar", "/portal", "/producto", "/blog", "/base-conocimientos", "/calculadora-whatsapp", "/contacto", "/socios", "/soporte", "/privacy", "/terms", "/data-deletion"];
  const isPublic = publicPaths.some((path) =>
    pathname === path || pathname.startsWith(path + "/")
  );

  // Rutas del flujo de onboarding/plan (accesibles con auth pero sin plan)
  const isOnboardingFlow =
    pathname === "/onboarding" ||
    pathname === "/onboarding/accept-terms" ||
    pathname === "/select-plan" ||
    pathname === "/waiting-for-plan" ||
    pathname === "/account-suspended";

  // Founder panel — requires auth but skips subscription check
  const isFounderPanel = pathname.startsWith("/founder-dashboard");

  // Redirigir a login si no autenticado y ruta protegida
  if (!user && !isPublic && !isOnboardingFlow) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // Redirigir a dashboard si ya autenticado e intenta ir a login/register.
  // Excepción: /register?invite=TOKEN debe ejecutarse para que el usuario
  // autenticado (vía magic link de Supabase) pueda procesar la invitación
  // pendiente. Si lo redirigimos a /dashboard, la invitación nunca se acepta
  // y el user queda como owner de su org auto-generada.
  const isInviteAcceptance =
    pathname === "/register" && request.nextUrl.searchParams.has("invite");
  if (
    user &&
    (pathname === "/login" || (pathname === "/register" && !isInviteAcceptance))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return applySecurityHeaders(NextResponse.redirect(url));
  }

  // ── Onboarding + Plan check para rutas protegidas del dashboard ──
  // Single RPC replaces 3 sequential queries (profile, membership, subscription)
  if (user && !isPublic && !isOnboardingFlow && !isFounderPanel) {
    // Caché de 30 s: solo guarda resultados que pasaron todas las puertas
    // (ver setCachedSessionCheck más abajo), así ningún redirect se sirve
    // de caché.
    let session = getCachedSessionCheck(user.id) as SessionCheck | null;
    const fromCache = session !== null;

    if (!session) {
      const { data } = await supabase.rpc("get_user_session_check", {
        p_user_id: user.id,
      });
      session = (data ?? null) as SessionCheck | null;
    }

    // No membership found → no org
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = "/select-plan";
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    const s = session;

    // 0. Suspended account — every membership is deactivated. Founders
    // skip this check (they can act as platform superuser even without
    // an active membership).
    if (s.all_memberships_inactive === true && !s.is_founder) {
      const url = request.nextUrl.clone();
      url.pathname = "/account-suspended";
      return applySecurityHeaders(NextResponse.redirect(url));
    }

    // 0b. Terms acceptance gate (Ley 29733). Pre-existing users created
    // before migration 116 have NULL accepted_terms_at; new users who
    // accepted an older TERMS_VERSION must re-accept after a bump.
    const onAcceptTermsPage = pathname === "/onboarding/accept-terms";
    const termsOutdated =
      !s.accepted_terms_at ||
      (s.accepted_terms_version != null && s.accepted_terms_version !== TERMS_VERSION);
    if (termsOutdated && !onAcceptTermsPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/accept-terms";
      url.searchParams.set("next", pathname);
      return applySecurityHeaders(NextResponse.redirect(url));
    }

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

    // Llegamos aquí ⇒ todas las puertas pasaron. Solo este estado se
    // cachea (ver comentario del bloque de caché arriba).
    if (!fromCache) setCachedSessionCheck(user.id, s);
  }

  return applySecurityHeaders(supabaseResponse, pathname);
}
