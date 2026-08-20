"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { translateAuthError } from "@/lib/supabase/auth-errors";
import {
  Turnstile,
  TURNSTILE_ENABLED,
  type TurnstileHandle,
} from "@/components/auth/turnstile";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Mail } from "lucide-react";
import { YendaLogo } from "@/components/icons/yenda-logo";

const REMEMBERED_EMAIL_KEY = "vibeforge_remembered_email";

type AuthBanner = {
  title: string;
  description: string;
  canResend: boolean;
};

function parseAuthError(query: URLSearchParams, hash: URLSearchParams): AuthBanner | null {
  // Middleware sets ?reason=session_revoked when a user's session
  // was revoked from another device. Surface it as a friendly
  // banner so they know it wasn't a glitch.
  if (query.get("reason") === "session_revoked") {
    return {
      title: "Tu sesión se cerró desde otro dispositivo",
      description:
        "Alguien cerró esta sesión desde otro dispositivo conectado a tu cuenta. " +
        "Si fuiste vos, simplemente volvé a iniciar sesión. Si no, cambiá tu contraseña.",
      canResend: false,
    };
  }

  const code = query.get("error") || hash.get("error_code") || hash.get("error");
  const desc = hash.get("error_description") || query.get("error_description");
  if (!code) return null;

  if (code === "otp_expired" || code === "access_denied") {
    return {
      title: "El enlace de confirmación expiró o ya fue usado",
      description:
        "Suele pasar cuando el escáner de seguridad de tu correo abre el enlace antes que tú. " +
        "Ingresa tu email y te enviamos uno nuevo.",
      canResend: true,
    };
  }
  if (code === "exchange_failed") {
    return {
      title: "No pudimos completar el inicio de sesión",
      description: "Intenta iniciar sesión de nuevo o solicita un nuevo enlace.",
      canResend: true,
    };
  }
  if (code === "auth_failed") {
    return {
      title: "No pudimos verificar el enlace",
      description: desc
        ? decodeURIComponent(desc.replace(/\+/g, " "))
        : "El enlace no es válido. Intenta iniciar sesión o reenvía el correo de confirmación.",
      canResend: true,
    };
  }
  return {
    title: "Error de autenticación",
    description: desc
      ? decodeURIComponent(desc.replace(/\+/g, " "))
      : code,
    canResend: false,
  };
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [authBanner, setAuthBanner] = useState<AuthBanner | null>(null);
  const [resending, setResending] = useState(false);
  // 2FA step state. When the user has MFA enrolled, signInWithPassword
  // creates an AAL1 session and we hold them on this page until they
  // pass the TOTP challenge. mfaFactorId being non-null = show step 2.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const router = useRouter();

  // Load remembered email on mount
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRememberMe(true);
    }

    // Parse auth errors from both query string and hash fragment
    if (typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const banner = parseAuthError(query, hash);
      if (banner) {
        setAuthBanner(banner);
        // Clean URL (keep path only) so a refresh doesn't re-show the error
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  // Turnstile (CAPTCHA): cuando está activo en Supabase, TODA llamada de
  // auth exige token — y los tokens son de un solo uso, de ahí el reset()
  // tras cada intento.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const handleResend = async () => {
    if (!email) {
      toast.error("Ingresa tu email primero");
      return;
    }
    setResending(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
        captchaToken: captchaToken ?? undefined,
      },
    });
    turnstileRef.current?.reset();
    setResending(false);
    if (error) {
      toast.error(translateAuthError(error));
      return;
    }
    toast.success("Enlace enviado. Revisa tu correo (y spam).");
    setAuthBanner(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });

    if (error) {
      // El token ya se consumió — pedir uno fresco para el reintento.
      turnstileRef.current?.reset();
      toast.error(
        error.message === "Email not confirmed"
          ? "Tu correo aún no está confirmado. Usa el botón de reenviar el enlace."
          : translateAuthError(error)
      );
      setLoading(false);
      return;
    }

    // Save or clear remembered email
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }

    // 2FA step. If the user has a verified TOTP factor, Supabase
    // returns an AAL1 session — we hold them here until they pass
    // the challenge. listFactors works on the AAL1 session.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
    if (totp) {
      setMfaFactorId(totp.id);
      setLoading(false);
      return;
    }

    toast.success("Sesión iniciada correctamente");
    router.push("/dashboard");
    router.refresh();
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setLoading(true);
    setMfaError(null);

    const supabase = createClient();
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
      factorId: mfaFactorId,
    });
    if (chErr || !challenge) {
      setMfaError(chErr?.message ?? "No pudimos generar el desafío. Intentá de nuevo.");
      setLoading(false);
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: mfaCode.trim(),
    });
    if (verifyErr) {
      setMfaError("Código inválido. Revisá los 6 dígitos actuales de tu app.");
      setMfaCode("");
      setLoading(false);
      return;
    }

    toast.success("Sesión iniciada correctamente");
    router.push("/dashboard");
    router.refresh();
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) toast.error(translateAuthError(error));
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex justify-center">
            <YendaLogo width={160} priority />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingresa tus credenciales para continuar
          </p>
        </div>

        {/* Auth error banner */}
        {authBanner && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {authBanner.title}
                </p>
                <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                  {authBanner.description}
                </p>
                {authBanner.canResend && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                  >
                    {resending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                    Reenviar enlace de confirmación
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="glass-card rounded-2xl p-7 shadow-xl">
          {mfaFactorId ? (
            // ── Step 2: TOTP challenge ─────────────────────────
            <form onSubmit={handleMfaVerify} className="space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-1">Verificación en dos pasos</h2>
                <p className="text-sm text-muted-foreground">
                  Ingresá el código de 6 dígitos de tu app de autenticación.
                </p>
              </div>
              <div className="space-y-2">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(e) =>
                    setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  autoFocus
                  className="flex h-14 w-full rounded-xl border border-input bg-background/50 px-4 text-center text-2xl tracking-[0.4em] font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
                {mfaError && (
                  <p className="text-xs text-red-500 text-center">{mfaError}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
              </button>
              <div className="pt-2 text-center space-y-2">
                <Link
                  href="/auth/mfa-recover"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors block"
                >
                  Perdí mi dispositivo — usar código de recuperación
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    // Cancel the half-completed login. The AAL1
                    // session is left behind but is harmless —
                    // protected routes still gatekeep on AAL2.
                    setMfaFactorId(null);
                    setMfaCode("");
                    setMfaError(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Volver
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-semibold">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-semibold">
                  Contrasena
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Olvidaste tu contrasena?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-input bg-background/50 text-primary accent-primary cursor-pointer"
              />
              <span className="text-sm text-muted-foreground">Recordar mi usuario</span>
            </label>

            <Turnstile ref={turnstileRef} onToken={setCaptchaToken} />

            <button
              type="submit"
              disabled={loading || (TURNSTILE_ENABLED && !captchaToken)}
              className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Iniciar Sesion
            </button>
          </form>
          )}

          {/* Divider + Google login — hidden when in the MFA step
              to avoid confusing the user with multiple paths. */}
          {!mfaFactorId && (
          <>
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card/80 backdrop-blur-sm px-3 text-muted-foreground">
                O continuar con
              </span>
            </div>
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-border/60 bg-background/30 text-sm font-medium shadow-sm transition-all hover:bg-accent/50 hover:border-border"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continuar con Google
          </button>
          </>
          )}
        </div>

        {!mfaFactorId && (
        <p className="text-center text-sm text-muted-foreground">
          No tienes cuenta?{" "}
          <Link href="/register" className="text-primary font-medium hover:underline">
            Registrate
          </Link>
        </p>
        )}
      </div>
    </div>
  );
}
