"use client";

import { useState, useEffect, useCallback } from "react";

import { NumberPopIn } from "@/components/ui/number-pop-in";import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { founderFetch } from "@/lib/founder-fetch";
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
  TrendingDown,
  Activity,
  Headphones,
  CalendarDays,
  Bot,
  AlertTriangle,
  Moon,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Repeat,
  Zap,
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
  activeSubscriptions: number;
  trialingOrgs: number;
  aiQueriesThisMonth: number;
  openTickets: number;
  mrr: number;
  arr: number;
  currentMonthRevenue: number;
  prevMonthRevenue: number;
  revenueDelta: number;
  churnedThisMonth: number;
  churnRate: number;
  trialConversion: number;
  activationRate: number;
  dormantOrgs: number;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const needsSetup = searchParams.get("setup") === "true";
  const needsVerify = searchParams.get("verify") === "true";
  const [verified, setVerified] = useState(!needsSetup && !needsVerify);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(null);
  const loadStats = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await founderFetch<PlatformStats>("/api/founder/stats");
      setStats(data);
    } catch (e) {
      // Antes un !res.ok dejaba `stats` null con loading false → el guard
      // `loading || !stats` mostraba spinner INFINITO. Ahora: error visible.
      setLoadError(e instanceof Error ? e.message : "Error");
    }
    setLoading(false);
  }, []);

  // Verificado y sin puerta que mostrar → al panel CEO, que es la pantalla
  // de trabajo real. Ya no se cargan las métricas de Overview.
  useEffect(() => {
    if (verified && !needsSetup && !needsVerify) {
      router.replace("/founder-dashboard/ceo");
    }
  }, [verified, needsSetup, needsVerify, router]);

  // Esta ruta sigue existiendo SOLO como puerta del 2FA: el layout redirige
  // aquí con ?setup=true / ?verify=true. Superada la puerta, el destino es el
  // panel CEO — Overview salió de la nav porque CEO ya lo cubre y su tarjeta
  // de "revenue del mes" significaba lo contrario que la de CEO (volumen de
  // las clínicas vs. lo cobrado por Yenda), un riesgo de leer mal el negocio.
  if (needsSetup && !verified) {
    return <TOTPSetup onComplete={() => { setVerified(true); router.replace("/founder-dashboard/ceo"); }} />;
  }

  if (needsVerify && !verified) {
    return <TOTPVerify onComplete={() => { setVerified(true); router.replace("/founder-dashboard/ceo"); }} />;
  }

  if (verified && !needsSetup && !needsVerify) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-sm font-semibold text-red-500">No se pudieron cargar las métricas</p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <button onClick={() => { setLoading(true); void loadStats(); }} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Reintentar</button>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const deltaPositive = stats.revenueDelta >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Métricas SaaS en tiempo real
        </p>
      </div>

      {/* Row 1: Revenue & SaaS KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">MRR</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight"><NumberPopIn key={stats.mrr} value={`S/${stats.mrr.toLocaleString()}`} /></p>
          <p className="text-[10px] text-muted-foreground">ARR: S/{stats.arr.toLocaleString()}</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Volumen clínicas este mes (no es ingreso Yenda)</span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${deltaPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
              {deltaPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight"><NumberPopIn key={stats.currentMonthRevenue} value={`S/${stats.currentMonthRevenue.toLocaleString()}`} /></p>
          <p className={`text-[10px] font-medium ${deltaPositive ? "text-emerald-500" : "text-red-500"}`}>
            {deltaPositive ? "+" : ""}{stats.revenueDelta}% vs mes anterior
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Churn rate</span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stats.churnRate > 5 ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>
              {stats.churnRate > 5 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight"><NumberPopIn key={stats.churnRate} value={`${stats.churnRate}%`} /></p>
          <p className="text-[10px] text-muted-foreground">{stats.churnedThisMonth} churned este mes</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Trial → Paid</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Repeat className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight"><NumberPopIn key={stats.trialConversion} value={`${stats.trialConversion}%`} /></p>
          <p className="text-[10px] text-muted-foreground">{stats.trialingOrgs} en trial ahora</p>
        </div>
      </div>

      {/* Row 2: Platform scale */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizaciones" value={stats.totalOrgs} icon={Building2} color="bg-blue-500/10 text-blue-500" />
        <StatCard label="Suscripciones activas" value={stats.activeSubscriptions} icon={DollarSign} color="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="Tasa de activación" value={`${stats.activationRate}%`} icon={Zap} color="bg-amber-500/10 text-amber-500" />
        <StatCard
          label="Dormantes"
          value={stats.dormantOrgs}
          icon={Moon}
          color={stats.dormantOrgs > 0 ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}
        />
      </div>

      {/* Row 3: Operations */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pacientes totales" value={stats.totalPatients.toLocaleString()} icon={Users} color="bg-sky-500/10 text-sky-500" />
        <StatCard label="Citas este mes" value={stats.monthlyAppointments.toLocaleString()} icon={CalendarDays} color="bg-blue-500/10 text-blue-500" />
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
