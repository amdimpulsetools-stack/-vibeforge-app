"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { KeyRound, Loader2, ArrowLeft, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ============================================================
// /auth/mfa-recover
//
// Lost-device flow. Submits email + password + 1 recovery code
// to /api/auth/mfa/recover, which validates everything, deletes
// all factors, and returns 200. We then sign the user OUT
// (the AAL1 session from the password attempt is still alive
// in some browser-states) and redirect to /login with a flash
// banner.
//
// Standalone page (not a modal) so the user can paste their
// code from a password manager cleanly.
// ============================================================

export default function MfaRecoverPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !code) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          recovery_code: code.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        if (res.status === 429) {
          toast.error("Demasiados intentos. Esperá un minuto.");
        } else if (body.error === "invalid_credentials") {
          toast.error("Email o contraseña incorrectos.");
        } else if (body.error === "invalid_recovery_code") {
          toast.error("Código de recuperación inválido o ya usado.");
        } else {
          toast.error("No pudimos recuperar tu cuenta. Contactá soporte.");
        }
        setLoading(false);
        return;
      }

      // Recovery worked. Sign out any stray session and route
      // to /login with a clear flash. Don't auto-sign-in here —
      // forcing a clean login + re-enroll prompt is the safer
      // post-recovery UX.
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // best effort
      }
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
            <ShieldOff className="h-7 w-7 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold">2FA removido</h1>
          <p className="text-sm text-muted-foreground">
            Tu autenticación de dos factores fue desactivada. Iniciá sesión normalmente
            y vamos a recordarte que la configures de nuevo desde tu perfil.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex h-11 items-center justify-center rounded-xl gradient-primary px-8 text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg"
          >
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
            <KeyRound className="h-6 w-6 text-amber-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Recuperar acceso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Usá uno de los códigos de recuperación que descargaste al activar 2FA.
            Esto va a <strong>desactivar 2FA</strong> en tu cuenta — tendrás que
            configurarlo de nuevo después.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-7 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Email</label>
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Contraseña</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Código de recuperación</label>
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="abcd-1234-ef56"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
              <p className="text-xs text-muted-foreground">
                Cada código solo se puede usar una vez.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password || !code}
              className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Recuperar acceso"
              )}
            </button>
          </form>
        </div>

        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
