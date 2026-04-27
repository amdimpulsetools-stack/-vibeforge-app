"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import {
  Zap,
  Check,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_semiannual: number | null;
  price_yearly: number | null;
  max_members: number | null;
  max_doctors: number | null;
  max_offices: number | null;
  max_patients: number | null;
  max_appointments_per_month: number | null;
  max_storage_mb: number | null;
  max_admins: number | null;
  max_receptionists: number | null;
  max_doctor_members: number | null;
  addon_price_per_office: number | null;
  addon_price_per_member: number | null;
  target_audience: string | null;
  feature_reports: boolean;
  feature_export: boolean;
  feature_priority_support: boolean;
  feature_ai_assistant: boolean;
}

const PLAN_ANCHORS: Record<string, string> = {
  starter: "Menos de S/5 al día por tener tu consultorio inteligente",
  professional: "Menos de 3 consultas al mes y la herramienta se paga sola",
  enterprise: "Con un tratamiento mediano al mes, ya pagaste tu suscripción",
};

function formatLimit(val: number | null): string {
  if (val === null) return "Ilimitado";
  return val.toLocaleString();
}

function formatStorage(mb: number | null): string {
  if (mb === null) return "Ilimitado";
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

function buildFeatures(plan: Plan): string[] {
  const features: string[] = [];
  const docs = plan.max_doctor_members ?? plan.max_doctors;
  features.push(docs === null ? "Doctores ilimitados" : `${docs} ${docs === 1 ? "doctor" : "doctores"}`);
  features.push(plan.max_patients === null ? "Pacientes ilimitados" : `${formatLimit(plan.max_patients)} pacientes`);
  features.push(plan.max_appointments_per_month === null ? "Citas ilimitadas" : `${formatLimit(plan.max_appointments_per_month)} citas/mes`);
  features.push(plan.max_offices === null ? "Consultorios ilimitados" : `${plan.max_offices} ${plan.max_offices === 1 ? "consultorio" : "consultorios"}`);
  features.push(plan.max_members === null ? "Miembros ilimitados" : `Hasta ${plan.max_members} ${plan.max_members === 1 ? "miembro" : "miembros"}`);
  features.push(`${formatStorage(plan.max_storage_mb)} almacenamiento`);
  if (plan.feature_reports) features.push("Reportes avanzados");
  if (plan.feature_export) features.push("Exportar datos");
  if (plan.feature_priority_support) features.push("Soporte prioritario");
  if (plan.addon_price_per_office) features.push("Addons disponibles");
  return features;
}

export default function SelectPlanPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <SelectPlanPage />
    </Suspense>
  );
}

function SelectPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  // Billing cadence selected by the user. Defaults to monthly so a fresh
  // visitor sees the lowest sticker price.
  const [cadence, setCadence] = useState<"monthly" | "semiannual" | "annual">("monthly");

  const paymentStatus = searchParams.get("payment");
  const reason = searchParams.get("reason");

  // Poll for subscription activation after payment
  const pollSubscription = useCallback(async (orgId: string) => {
    const supabase = createClient();
    const maxAttempts = 20; // ~40 seconds
    for (let i = 0; i < maxAttempts; i++) {
      const { data: subs } = await supabase
        .from("organization_subscriptions")
        .select("id, status")
        .eq("organization_id", orgId)
        .in("status", ["active", "trialing"])
        .limit(1);

      if (subs && subs.length > 0) {
        toast.success("¡Pago confirmado! Bienvenido a VibeForge");
        router.push("/dashboard");
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    // After polling, subscription still not active — may need manual check
    toast.info("Tu pago está siendo procesado. Puede tardar unos minutos.");
    setWaitingForPayment(false);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Check if they already have an org with subscription
      let { data: members } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      // Self-heal: if no org found, call ensure_user_has_org() to create one
      if (!members || members.length === 0) {
        const { data: rpcResult, error: rpcError } = await supabase.rpc("ensure_user_has_org");
        if (rpcError) {
          // Silent fail — self-heal attempt
        }
        const { data: newMembers } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1);
        members = newMembers;
      }

      if (members && members.length > 0) {
        // Check for active/trialing subscription
        const { data: subs } = await supabase
          .from("organization_subscriptions")
          .select("id, status")
          .eq("organization_id", members[0].organization_id)
          .in("status", ["active", "trialing"])
          .limit(1);

        if (subs && subs.length > 0) {
          setHasSubscription(true);
          router.push("/dashboard");
          return;
        }

        // If returning from payment, poll for subscription activation
        if (paymentStatus === "success") {
          setWaitingForPayment(true);
          pollSubscription(members[0].organization_id);
          return;
        }
      }

      // Fetch plans
      const { data: plansData } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (plansData) {
        setPlans(plansData);
      }
      setLoading(false);
    };

    init();
  }, [router, paymentStatus, pollSubscription]);

  const handleStartTrial = async (planId: string) => {
    setSelecting(planId);
    try {
      const res = await fetch("/api/plans/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });

      // Try JSON first; fall back to raw text so HTML error pages surface too
      const raw = await res.text();
      let data: { error?: string; detail?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Non-JSON response (e.g. HTML error page) — keep raw text
        data = { error: raw.slice(0, 200) };
      }

      if (!res.ok) {
        toast.error(data.detail || data.error || `Error al iniciar la prueba (${res.status})`);
        setSelecting(null);
        return;
      }

      toast.success("¡Prueba de 14 días activada!");
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sin conexión. Revisa tu internet e intenta otra vez.";
      toast.error(msg);
      setSelecting(null);
    }
  };

  const handleSelect = async (planId: string) => {
    setSelecting(planId);
    const selectedPlan = plans.find((p) => p.id === planId);

    // All plans go through Mercado Pago checkout
    try {
      const apiCycle =
        cadence === "annual"
          ? "yearly"
          : cadence === "semiannual"
          ? "semiannual"
          : "monthly";
      const res = await fetch("/api/mercadopago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, billing_cycle: apiCycle }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al iniciar el pago");
        setSelecting(null);
        return;
      }

      const data = await res.json();

      if (data.init_point) {
        toast.success(
          `Redirigiendo a Mercado Pago para activar Plan ${selectedPlan?.name ?? ""}...`
        );
        window.location.href = data.init_point;
      } else {
        toast.success(
          `Plan ${selectedPlan?.name ?? ""} activado`
        );
        router.push("/dashboard");
      }
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez. al procesar el pago");
      setSelecting(null);
    }
  };

  if (loading || hasSubscription || waitingForPayment) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        {waitingForPayment && (
          <div className="text-center max-w-sm">
            <p className="text-lg font-semibold">Procesando tu pago...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Confirmando con Mercado Pago. Esto puede tardar unos segundos.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">{APP_NAME}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Elige tu plan
          </h1>
          <p className="mt-3 text-base text-muted-foreground max-w-xl mx-auto">
            Selecciona el plan que mejor se adapte a tu realidad.
            Sin contratos, sin sorpresas. IA incluida en todos.
          </p>

          {/* Billing cadence toggle — 3 options with progressive discount */}
          <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-muted p-1">
            <button
              type="button"
              onClick={() => setCadence("monthly")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                cadence === "monthly"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setCadence("semiannual")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                cadence === "semiannual"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Semestral
              <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                ½ mes gratis
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCadence("annual")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                cadence === "annual"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                2 meses gratis
              </span>
            </button>
          </div>
        </div>

        {/* Trial expired banner */}
        {reason === "trial_expired" && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-200">
                Tu período de prueba ha finalizado
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Selecciona un plan para continuar usando la plataforma.
                No perderás ningún dato — todo está guardado.
              </p>
            </div>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => {
            const isPopular = plan.slug === "professional";
            const features = buildFeatures(plan);
            const anchor = PLAN_ANCHORS[plan.slug] ?? plan.description ?? "";

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all",
                  isPopular
                    ? "border-emerald-300 dark:border-emerald-500/40 bg-card shadow-xl shadow-emerald-100/40 dark:shadow-emerald-900/20 md:scale-105 md:-my-2 z-10"
                    : "border-border bg-card shadow-sm hover:shadow-md"
                )}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    Recomendado
                  </span>
                )}

                <h3 className="text-lg font-bold">{plan.name}</h3>

                {/* Price — reflects the selected cadence. Per-month figure
                     for semiannual/annual is computed from the upfront price
                     so the user can compare cleanly against monthly. */}
                {(() => {
                  const monthly = Number(plan.price_monthly);
                  const semi = plan.price_semiannual != null ? Number(plan.price_semiannual) : null;
                  const annual = plan.price_yearly != null ? Number(plan.price_yearly) : null;
                  const perMonth =
                    cadence === "annual" && annual != null
                      ? annual / 12
                      : cadence === "semiannual" && semi != null
                      ? semi / 6
                      : monthly;
                  const upfront =
                    cadence === "annual" && annual != null
                      ? annual
                      : cadence === "semiannual" && semi != null
                      ? semi
                      : null;
                  return (
                    <div className="mt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-muted-foreground">S/</span>
                        <span className="text-4xl font-extrabold tabular-nums">
                          {perMonth.toFixed(perMonth % 1 === 0 ? 0 : 2)}
                        </span>
                        <span className="text-sm text-muted-foreground">/mes</span>
                      </div>
                      {cadence !== "monthly" && upfront != null && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Cobro único de S/{upfront.toLocaleString("es-PE")} cada{" "}
                          {cadence === "annual" ? "12 meses" : "6 meses"}
                          <span className="text-muted-foreground/60 line-through ml-1.5">
                            S/{monthly}/mes
                          </span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">{anchor}</p>
                    </div>
                  );
                })()}

                {/* IA badge */}
                {plan.feature_ai_assistant && (
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <Sparkles className="h-3 w-3" />
                    IA incluida
                  </div>
                )}

                {/* Feature list */}
                <ul className="mt-5 space-y-2.5 flex-1">
                  {features.map((feat) => (
                    <li key={feat} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>

                {/* CTA buttons */}
                {/* Trial deactivated for Clinica (enterprise). Other plans
                     keep the 14-day trial as before. */}
                <div className="mt-6 space-y-2">
                  {plan.slug !== "enterprise" && (
                    <button
                      onClick={() => handleStartTrial(plan.id)}
                      disabled={selecting !== null}
                      className={cn(
                        "flex w-full h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50",
                        isPopular
                          ? "gradient-primary text-white shadow-md hover:opacity-90 hover:shadow-lg"
                          : "border border-border bg-card text-foreground hover:bg-accent/50 hover:border-emerald-300 dark:hover:border-emerald-500/40"
                      )}
                    >
                      {selecting === plan.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Iniciar prueba de 14 días
                    </button>
                  )}
                  <button
                    onClick={() => handleSelect(plan.id)}
                    disabled={selecting !== null}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl transition-all disabled:opacity-50",
                      plan.slug === "enterprise"
                        ? "h-11 gradient-primary text-sm font-semibold text-white shadow-md hover:opacity-90 hover:shadow-lg"
                        : "h-10 border border-border bg-card/50 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    {(() => {
                      const upfrontLabel =
                        cadence === "annual" && plan.price_yearly != null
                          ? `S/${Number(plan.price_yearly).toLocaleString("es-PE")}/año`
                          : cadence === "semiannual" && plan.price_semiannual != null
                          ? `S/${Number(plan.price_semiannual).toLocaleString("es-PE")}/semestre`
                          : `S/${plan.price_monthly}/mes`;
                      return plan.slug === "enterprise"
                        ? `Contratar Clínica — ${upfrontLabel}`
                        : `Pagar suscripción — ${upfrontLabel}`;
                    })()}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-xl mx-auto">
          ¿Necesitas algo entre planes? Todos incluyen{" "}
          <span className="font-medium text-foreground">addons flexibles</span>:
          agrega doctores, consultorios o miembros de equipo adicionales sin cambiar de plan.
        </p>
      </div>
    </div>
  );
}
