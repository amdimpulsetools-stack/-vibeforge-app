"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mail,
  Loader2,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Calendar,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface OrgInfo {
  name: string;
  logo_url: string | null;
  accent_color: string | null;
}

export default function PortalLoginPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const accent = orgInfo?.accent_color || "#10b981";

  useEffect(() => {
    async function checkExisting() {
      try {
        const res = await fetch(`/api/portal/auth/session?slug=${slug}`);
        const data = await res.json();
        if (data.authenticated) {
          if (data.needs_registration) {
            router.replace(`/portal/${slug}/registro`);
          } else {
            router.replace(`/portal/${slug}/mis-citas`);
          }
          return;
        }
        if (data.organization) {
          setOrgInfo(data.organization);
        }
      } catch {
        // ignore
      } finally {
        setCheckingSession(false);
      }
    }

    async function fetchOrg() {
      try {
        const res = await fetch(`/api/book/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setOrgInfo({
            name: data.organization?.name || "",
            logo_url: data.organization?.logo_url || null,
            accent_color: data.booking_settings?.accent_color || null,
          });
        }
      } catch {
        // ignore
      }
    }

    checkExisting();
    fetchOrg();
  }, [slug, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), slug }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al enviar");
        return;
      }

      setSent(true);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Logo / Org header */}
        <div className="mb-8 text-center">
          {orgInfo?.logo_url ? (
            <img
              src={orgInfo.logo_url}
              alt={orgInfo.name}
              className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover"
            />
          ) : (
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: accent + "20" }}
            >
              <Calendar className="h-8 w-8" style={{ color: accent }} />
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            Portal del Paciente
          </h1>
          {orgInfo?.name && (
            <p className="mt-1 text-sm text-zinc-400">{orgInfo.name}</p>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 backdrop-blur-sm">
          <AnimatePresence mode="wait">
            {sent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4 text-center"
              >
                <div
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: accent + "20" }}
                >
                  <CheckCircle2
                    className="h-7 w-7"
                    style={{ color: accent }}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Revisa tu correo</h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Enviamos un enlace de acceso a{" "}
                    <span className="font-medium text-white">{email}</span>.
                    <br />
                    El enlace expira en 15 minutos.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  ¿No recibiste el correo? Intentar de nuevo
                </button>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                    <Mail className="h-3.5 w-3.5" />
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    required
                    autoFocus
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={
                      {
                        "--tw-ring-color": accent,
                      } as React.CSSProperties
                    }
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 text-center">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ backgroundColor: accent }}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Acceder al portal
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <ShieldCheck className="h-3 w-3" />
                  Te enviaremos un enlace seguro, sin contraseña
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-600">
          Portal seguro · {orgInfo?.name || ""}
        </p>
      </motion.div>
    </div>
  );
}
