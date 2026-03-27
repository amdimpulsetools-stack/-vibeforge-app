"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  Shield,
  Loader2,
  QrCode,
  KeyRound,
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Activity,
  Headphones,
  CalendarDays,
  Bot,
} from "lucide-react";

// ─── 2FA Gate Component ────────────────────────────────────

function TOTPSetup({ onComplete }: { onComplete: () => void }) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/founder/totp/setup", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setQrCode(data.qrCode);
        setSecret(data.secret);
      });
  }, []);

  const handleVerify = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/founder/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      onComplete();
    } else {
      setError("Código inválido. Intenta de nuevo.");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/60 bg-card p-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <QrCode className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold">Configurar 2FA</h1>
          <p className="text-sm text-muted-foreground">
            Escanea este código QR con Google Authenticator o Authy
          </p>
        </div>

        {qrCode ? (
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-xl border border-border bg-white p-3">
              <img src={qrCode} alt="QR Code" className="h-48 w-48" />
            </div>
            {secret && (
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">O ingresa este código manualmente:</p>
                <code className="mt-1 block rounded bg-muted px-3 py-1.5 text-xs font-mono select-all">
                  {secret}
                </code>
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-medium">Código de verificación</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
          />
          {error && <p className="text-xs text-destructive text-center">{error}</p>}
          <button
            onClick={handleVerify}
            disabled={code.length !== 6 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verificar y activar
          </button>
        </div>
      </div>
    </div>
  );
}

function TOTPVerify({ onComplete }: { onComplete: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/founder/totp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      onComplete();
    } else {
      setError("Código inválido. Intenta de nuevo.");
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border/60 bg-card p-8">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <KeyRound className="h-7 w-7 text-amber-500" />
          </div>
          <h1 className="text-xl font-bold">Verificación 2FA</h1>
          <p className="text-sm text-muted-foreground">
            Ingresa el código de tu app authenticator
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            autoFocus
            className="w-full rounded-lg border border-input bg-background px-4 py-3 text-center text-2xl font-mono tracking-[0.5em] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && handleVerify()}
          />
          {error && <p className="text-xs text-destructive text-center">{error}</p>}
          <button
            onClick={handleVerify}
            disabled={code.length !== 6 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verificar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Dashboard ────────────────────────────────────

interface PlatformStats {
  totalOrgs: number;
  activeOrgs: number;
  totalUsers: number;
  totalDoctors: number;
  totalPatients: number;
  totalAppointments: number;
  monthlyAppointments: number;
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  trialingOrgs: number;
  aiQueriesThisMonth: number;
  openTickets: number;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  suffix,
}: {
  label: string;
  value: string | number;
  icon: typeof Building2;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

function FounderDashboardContent() {
  const searchParams = useSearchParams();
  const needsSetup = searchParams.get("setup") === "true";
  const needsVerify = searchParams.get("verify") === "true";
  const [verified, setVerified] = useState(!needsSetup && !needsVerify);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/founder/stats");
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (verified) loadStats();
  }, [verified, loadStats]);

  if (needsSetup && !verified) {
    return <TOTPSetup onComplete={() => { setVerified(true); window.history.replaceState({}, "", "/founder-dashboard"); }} />;
  }

  if (needsVerify && !verified) {
    return <TOTPVerify onComplete={() => { setVerified(true); window.history.replaceState({}, "", "/founder-dashboard"); }} />;
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Métricas en tiempo real de toda la plataforma
        </p>
      </div>

      {/* Row 1: Core metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizaciones" value={stats.totalOrgs} icon={Building2} color="bg-blue-500/10 text-blue-500" />
        <StatCard label="Orgs activas" value={stats.activeOrgs} icon={Activity} color="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="Usuarios totales" value={stats.totalUsers} icon={Users} color="bg-purple-500/10 text-purple-500" />
        <StatCard label="Doctores" value={stats.totalDoctors} icon={Users} color="bg-amber-500/10 text-amber-500" />
      </div>

      {/* Row 2: Business metrics */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pacientes totales" value={stats.totalPatients.toLocaleString()} icon={Users} color="bg-sky-500/10 text-sky-500" />
        <StatCard label="Citas totales" value={stats.totalAppointments.toLocaleString()} icon={CalendarDays} color="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="Citas este mes" value={stats.monthlyAppointments.toLocaleString()} icon={CalendarDays} color="bg-blue-500/10 text-blue-500" />
        <StatCard label="Revenue total" value={`S/${stats.totalRevenue.toLocaleString()}`} icon={DollarSign} color="bg-emerald-500/10 text-emerald-500" />
      </div>

      {/* Row 3: Subscriptions + Support */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Suscripciones activas" value={stats.activeSubscriptions} icon={DollarSign} color="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="En trial" value={stats.trialingOrgs} icon={TrendingUp} color="bg-amber-500/10 text-amber-500" />
        <StatCard label="Queries IA (mes)" value={stats.aiQueriesThisMonth} icon={Bot} color="bg-purple-500/10 text-purple-500" />
        <StatCard label="Tickets abiertos" value={stats.openTickets} icon={Headphones} color="bg-red-500/10 text-red-500" />
      </div>
    </div>
  );
}

export default function FounderDashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <FounderDashboardContent />
    </Suspense>
  );
}
