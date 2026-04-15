"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Mail, Zap } from "lucide-react";

const REMEMBERED_EMAIL_KEY = "vibeforge_remembered_email";

type AuthBanner = {
  title: string;
  description: string;
  canResend: boolean;
};

function parseAuthError(query: URLSearchParams, hash: URLSearchParams): AuthBanner | null {
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
      },
    });
    setResending(false);
    if (error) {
      toast.error(error.message);
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
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Save or clear remembered email
    if (rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
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
    if (error) toast.error(error.message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg gradient-glow">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{APP_NAME}</h1>
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

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Iniciar Sesion
            </button>
          </form>

          {/* Divider */}
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
        </div>

        <p className="text-center text-sm text-muted-foreground">
          No tienes cuenta?{" "}
          <Link href="/register" className="text-primary font-medium hover:underline">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  );
}
