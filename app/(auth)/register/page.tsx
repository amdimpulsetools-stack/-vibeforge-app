"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Zap, Building2 } from "lucide-react";

interface InviteInfo {
  email: string;
  role: string;
  professional_title: string | null;
  organization_name: string | null;
  organization_logo: string | null;
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
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
      // Invited users: use server API to auto-confirm + accept invitation
      try {
        const res = await fetch("/api/auth/register-invited", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            fullName,
            inviteToken,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || "Error al crear la cuenta");
          setLoading(false);
          return;
        }

        // Account created and confirmed — sign in directly
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

    // Normal registration (non-invited): use standard signUp flow
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          org_name: orgName || "Mi Clinica",
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Revisa tu email para confirmar tu cuenta");
    router.push("/login");
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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-lg gradient-glow">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {inviteInfo
              ? "Crea tu cuenta para unirte"
              : "Crea tu cuenta para comenzar"}
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

        <div className="glass-card rounded-2xl p-7 shadow-xl">
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-semibold">
                Nombre completo
              </label>
              <input
                id="name"
                type="text"
                placeholder="Juan Perez"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
            </div>

            {/* Only show org name when NOT an invitation */}
            {!inviteToken && (
              <div className="space-y-2">
                <label htmlFor="orgName" className="text-sm font-semibold">
                  Nombre de tu clinica
                </label>
                <input
                  id="orgName"
                  type="text"
                  placeholder="Mi Clinica"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-background/50 px-4 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
              </div>
            )}

            <div className="space-y-2">
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

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-semibold">
                Contrasena
              </label>
              <input
                id="password"
                type="password"
                placeholder="Minimo 6 caracteres"
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
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Ya tienes cuenta?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  );
}
