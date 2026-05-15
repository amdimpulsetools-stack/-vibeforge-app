"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ============================================================
// /auth/mfa-challenge
//
// Step 2 of any non-password auth flow (OAuth, magic link)
// when the user has a verified TOTP factor. The /api/auth/callback
// redirects here with ?next=<final-destination>.
//
// The flow is identical to the step-2 form embedded in /login,
// but extracted to its own page because the callback returns a
// server redirect (it can't render an interstitial form itself).
//
// Behavior:
//   - On mount: look up the user's verified factor
//   - If no factor → AAL is already OK (or no MFA enrolled),
//     redirect immediately to `next`. Defends against people
//     hitting the URL directly after disabling MFA.
//   - Otherwise: render TOTP input, run challenge/verify on
//     submit, then redirect to `next`.
// ============================================================

function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Block protocol-relative and absolute URLs — anti open-redirect.
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

// useSearchParams suspends during static-rendering, so the page
// component must be wrapped in a <Suspense> boundary. We split
// the page into an outer shell + inner client component so the
// build doesn't error during prerender.
export default function MfaChallengePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <MfaChallengeInner />
    </Suspense>
  );
}

function MfaChallengeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Resolve the user's TOTP factor on mount. If there isn't one,
  // we're not in a state that requires the challenge — bounce.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;

      if (listErr) {
        // Most likely the user isn't authenticated at all.
        router.replace("/login");
        return;
      }
      const totp = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (!totp) {
        // No factor → no challenge needed. Go straight to next.
        router.replace(next);
        return;
      }
      setFactorId(totp.id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (chErr || !challenge) {
      setError(chErr?.message ?? "No pudimos generar el desafío. Intentá de nuevo.");
      setSubmitting(false);
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verifyErr) {
      setError("Código inválido. Revisá los 6 dígitos actuales de tu app.");
      setCode("");
      setSubmitting(false);
      return;
    }

    // AAL2 issued. Hand off to the original destination.
    router.replace(next);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
            <ShieldCheck className="h-6 w-6 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Verificación en dos pasos</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingresá el código de 6 dígitos de tu app de autenticación.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-7 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              className="flex h-14 w-full rounded-xl border border-input bg-background/50 px-4 text-center text-2xl tracking-[0.4em] font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
            />
            {error && (
              <p className="flex items-center justify-center gap-2 text-xs text-red-500">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
            </button>
          </form>
        </div>

        <div className="text-center space-y-2">
          <Link
            href="/auth/mfa-recover"
            className="text-xs text-muted-foreground hover:text-primary transition-colors block"
          >
            Perdí mi dispositivo — usar código de recuperación
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-primary transition-colors block"
          >
            Cancelar y volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
