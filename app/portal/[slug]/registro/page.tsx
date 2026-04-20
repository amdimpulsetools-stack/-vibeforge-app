"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  User,
  Phone,
  IdCard,
  Loader2,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { motion } from "framer-motion";

interface OrgInfo {
  name: string;
  logo_url: string | null;
  accent_color: string | null;
}

export default function PortalRegistroPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [checking, setChecking] = useState(true);

  const accent = orgInfo?.accent_color || "#10b981";

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch(`/api/portal/auth/session?slug=${slug}`);
        const data = await res.json();
        if (!data.authenticated) {
          router.replace(`/portal/${slug}`);
          return;
        }
        if (!data.needs_registration) {
          router.replace(`/portal/${slug}/mis-citas`);
          return;
        }
        if (data.organization) {
          setOrgInfo({
            name: data.organization.name,
            logo_url: data.organization.logo_url,
            accent_color: data.portal_settings?.accent_color || null,
          });
        }
      } catch {
        router.replace(`/portal/${slug}`);
      } finally {
        setChecking(false);
      }
    }
    checkSession();
  }, [slug, router]);

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    dni.trim().length >= 4 &&
    phone.trim().length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dni: dni.trim(),
          phone: phone.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al registrar");
        return;
      }

      router.replace(`/portal/${slug}/mis-citas`);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
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
        {/* Header */}
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
            Completa tu registro
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Es la primera vez que accedes. Ingresa tus datos para continuar.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <User className="h-3.5 w-3.5" />
                  Nombres *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Juan"
                  required
                  autoFocus
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                  <User className="h-3.5 w-3.5" />
                  Apellidos *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Pérez"
                  required
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                <IdCard className="h-3.5 w-3.5" />
                Documento de identidad (DNI) *
              </label>
              <input
                type="text"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                placeholder="12345678"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <p className="text-xs text-zinc-500">
                Usamos tu DNI para vincular tu historial de citas
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300">
                <Phone className="h-3.5 w-3.5" />
                Teléfono *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+51 999 999 999"
                required
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: accent }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Tus datos están protegidos y solo se comparten con tu clínica
        </p>
      </motion.div>
    </div>
  );
}
