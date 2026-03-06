"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Zap, Building2, Mail, CheckCircle2 } from "lucide-react";

interface InviteInfo {
  email: string;
  role: string;
  professional_title: string | null;
  organization_name: string | null;
  organization_logo: string | null;
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;
    setLoadingInvite(true);
    fetch(`/api/invite/${inviteToken}`)
      .then((res) => {
        if (!res.ok) throw new Error("invalid");
        return res.json();
      })
      .then((data: InviteInfo) => {
        setInviteInfo(data);
        setEmail(data.email);
      })
      .catch(() => {
        toast.error("La invitación no es válida o ha expirado");
      })
      .finally(() => setLoadingInvite(false));
  }, [inviteToken]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (inviteToken) {
      try {
        const res = await fetch("/api/auth/register-invited", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, fullName, inviteToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Error al crear la cuenta");
          setLoading(false);
          return;
        }
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          toast.error("Cuenta creada. Inicia sesión con tu contraseña.");
          router.push("/login");
          return;
        }
        toast.success("Bienvenido/a! Tu cuenta ha sido creada.");
        router.push("/dashboard");
      } catch {
        toast.error("Error de conexión. Intenta de nuevo.");
        setLoading(false);
      }
      return;
    }

    // Normal registration
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          org_name: orgName || "Mi Clinica",
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setEmailSent(true);
    setLoading(false);
  };

  const handleGoogleRegister = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/onboarding`,
      },
    });
    if (error) toast.error(error.message);
  };

  const roleLabels: Record<string, string> = {
    doctor: "Doctor/a",
    receptionist: "Recepcionista",
    admin: "Administrador/a",
  };

  if (loadingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Email confirmation sent screen
  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Revisa tu correo
            </h2>
            <p className="mt-3 text-muted-foreground">
              Enviamos un enlace de confirmación a{" "}
              <span className="font-semibold text-foreground">{email}</span>.
              Haz clic en el enlace para activar tu cuenta.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-start gap-3 text-left">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Si no ves el correo, revisa tu carpeta de spam. El enlace expira
                en 24 horas.
              </p>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex text-sm text-primary font-medium hover:underline"
          >
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Left: Form ── */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-md space-y-8">
          {/* Logo */}
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5 group mb-8">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary shadow-md transition-transform group-hover:scale-105">
                <Zap className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight">{APP_NAME}</span>
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {inviteInfo ? "Únete al equipo" : "Crea tu cuenta"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {inviteInfo
                ? "Crea tu cuenta para unirte a la organización"
                : "Comienza tu prueba gratuita de 14 días"}
            </p>
          </div>

          {/* Invitation banner */}
          {inviteInfo && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-3">
                {inviteInfo.organization_logo ? (
                  <img
                    src={inviteInfo.organization_logo}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {inviteInfo.organization_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Te invitaron como{" "}
                    <span className="font-medium text-primary">
                      {roleLabels[inviteInfo.role] || inviteInfo.role}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Google button (only for non-invited) */}
          {!inviteToken && (
            <>
              <button
                onClick={handleGoogleRegister}
                className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-border/60 bg-card/50 text-sm font-medium shadow-sm transition-all hover:bg-accent/50 hover:border-border"
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
                Registrarse con Google
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">
                    O con email
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-sm font-semibold">
                Nombre completo
              </label>
              <input
                id="name"
                type="text"
                placeholder="Juan Pérez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            {!inviteToken && (
              <div className="space-y-1.5">
                <label htmlFor="orgName" className="text-sm font-semibold">
                  Nombre de tu clínica
                </label>
                <input
                  id="orgName"
                  type="text"
                  placeholder="Mi Clínica"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-semibold">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => !inviteToken && setEmail(e.target.value)}
                required
                readOnly={!!inviteToken}
                className={`flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all ${
                  inviteToken ? "opacity-60 cursor-not-allowed" : ""
                }`}
              />
              {inviteToken && (
                <p className="text-xs text-muted-foreground">
                  El email está vinculado a tu invitación
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-semibold">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center rounded-xl gradient-primary text-sm font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {inviteToken ? "Crear cuenta y unirme" : "Crear cuenta"}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-primary font-medium hover:underline"
            >
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>

      {/* ── Right: Image placeholder ── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-emerald-900/30" />
        <div className="absolute inset-0 bg-[url('/register-bg.jpg')] bg-cover bg-center opacity-30" />
        <div className="relative flex flex-col items-center justify-center w-full p-12">
          <div className="glass-card rounded-2xl p-8 max-w-sm text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg gradient-glow">
              <Zap className="h-7 w-7 text-white" />
            </div>
            <h3 className="text-xl font-bold">
              14 días de prueba gratis
            </h3>
            <p className="text-sm text-muted-foreground">
              Gestiona tu consultorio sin límites. Sin tarjeta de crédito.
            </p>
            <div className="space-y-2 text-left">
              {[
                "Agenda inteligente",
                "Gestión de pacientes",
                "Reportes y estadísticas",
                "Soporte personalizado",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
