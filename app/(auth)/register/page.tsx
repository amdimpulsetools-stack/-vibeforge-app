"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { Loader2, Zap, Building2, Mail, CheckCircle2, MessageCircle, BarChart3, Shield, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ShimmerText } from "@/components/ui/shimmer-text";

const ROTATING_PHRASES = [
  ["Tu clínica organizada", "desde el día #1"],
  ["Tu agenda con IA", "para tomar mejores decisiones"],
  ["Menos estrés,", "más productividad, más citas"],
];

interface InviteInfo {
  email: string;
  role: string;
  professional_title: string | null;
  organization_name: string | null;
  organization_logo: string | null;
}

export default function RegisterPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <RegisterPage />
    </Suspense>
  );
}

function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  // Rotate phrases every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % ROTATING_PHRASES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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

      {/* ── Right: Branded panel ── */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-emerald-900/90 to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/15 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/30 to-transparent" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

        <div className="relative flex flex-col justify-between w-full p-10 xl:p-14">
          {/* Top: Hero headline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-3"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              14 días gratis · No requiere tarjeta
            </div>
            <div className="h-[6rem] xl:h-[7.5rem] relative overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phraseIndex}
                  initial={{ opacity: 0, y: 30, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -30, filter: "blur(4px)" }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                >
                  <ShimmerText
                    className="text-3xl xl:text-4xl font-extrabold tracking-tight text-emerald-400 leading-snug"
                    variant="emerald"
                    duration={2}
                    delay={0.5}
                  >
                    {ROTATING_PHRASES[phraseIndex][0]}
                    <br />
                    {ROTATING_PHRASES[phraseIndex][1]}
                  </ShimmerText>
                </motion.div>
              </AnimatePresence>
            </div>
            <p className="text-base text-emerald-100/60 max-w-sm">
              Reduce cancelaciones, llena tu agenda y ten el control total de tu consultorio.
            </p>
          </motion.div>

          {/* Middle: Feature cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="space-y-3 my-8"
          >
            {[
              {
                icon: MessageCircle,
                title: "Recordatorios por WhatsApp",
                desc: "Tus pacientes reciben confirmación automática. Menos inasistencias.",
              },
              {
                icon: Clock,
                title: "Historial clínico en 2 clics",
                desc: "Accede al expediente completo de cualquier paciente al instante.",
              },
              {
                icon: BarChart3,
                title: "Reportes que sí entiendes",
                desc: "Sabe cuánto facturaste, cuántas citas tuviste y cómo crece tu clínica.",
              },
              {
                icon: Shield,
                title: "Tus datos, siempre seguros",
                desc: "Encriptación de extremo a extremo. Backups diarios automáticos.",
              },
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.5 + i * 0.1 }}
                className="flex items-start gap-3.5 rounded-xl bg-white/[0.04] border border-white/[0.06] p-3.5 transition-colors hover:bg-white/[0.07]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                  <feature.icon className="h-4.5 w-4.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{feature.title}</p>
                  <p className="text-xs text-emerald-100/50 mt-0.5 leading-relaxed">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Bottom: Social proof */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="space-y-4"
          >
            {/* Testimonial */}
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
              <p className="text-sm text-emerald-100/70 italic leading-relaxed">
                &ldquo;Antes perdía 2 horas al día organizando citas por WhatsApp. Ahora la agenda se llena sola y mis pacientes llegan puntuales.&rdquo;
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                  DM
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Dra. María Gonzales</p>
                  <p className="text-[11px] text-emerald-100/40">Odontóloga · Lima, Perú</p>
                </div>
              </div>
            </div>

            {/* Trust bar */}
            <div className="flex items-center justify-center gap-6 text-emerald-100/30 text-[11px]">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                Datos encriptados
              </span>
              <span className="h-3 w-px bg-emerald-100/10" />
              <span>HIPAA-ready</span>
              <span className="h-3 w-px bg-emerald-100/10" />
              <span>Soporte en &lt;2h</span>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
