"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePlan } from "@/hooks/use-plan";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Check,
  Sparkles,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

/* ───── Types ───── */
interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
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

/* ───── Helpers ───── */
const PLAN_ANCHORS: Record<string, string> = {
  starter: "Menos de lo que cobras por una consulta",
  professional: "Menos de S/6 al día por tener tu centro organizado",
  enterprise: "Divide entre tus doctores y sale menos de S/60 c/u",
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

/* ───── Page ───── */
export default function PlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <PlansContent />
    </Suspense>
  );
}

function PlansContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const {
    plan: currentPlan,
    subscription,
    usage,
    loading: planLoading,
    refetch,
  } = usePlan();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  // Handle payment callback from Mercado Pago
  useEffect(() => {
    const payment = searchParams.get("payment");
    if (payment === "success") {
      toast.success("Pago procesado correctamente. Tu plan se activara en breve.");
      refetch();
      // Clean up URL
      router.replace("/dashboard/plans", { scroll: false });
    } else if (payment === "failure" || payment === "pending") {
      toast.info(
        payment === "failure"
          ? "El pago no pudo completarse. Intenta de nuevo."
          : "Tu pago esta pendiente de confirmacion."
      );
      router.replace("/dashboard/plans", { scroll: false });
    }
  }, [searchParams, refetch, router]);

  useEffect(() => {
    const fetchPlans = async () => {
      const res = await fetch("/api/plans");
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      }
      setLoading(false);
    };
    fetchPlans();
  }, []);

  const handleChangePlan = async (planId: string) => {
    if (!currentPlan || planId === currentPlan.id) return;

    const target = plans.find((p) => p.id === planId);
    if (!target) return;

    setSelecting(planId);

    try {
      // Use Mercado Pago checkout for plan changes
      const res = await fetch("/api/mercadopago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, billing_cycle: "monthly" }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al cambiar de plan");
        setSelecting(null);
        return;
      }

      const data = await res.json();

      if (data.init_point) {
        toast.success(`Redirigiendo a Mercado Pago para Plan ${target.name}...`);
        window.location.href = data.init_point;
      } else {
        toast.success(`Plan cambiado a ${target.name}`);
        refetch();
        setSelecting(null);
      }
    } catch {
      toast.error("Error de conexion al procesar el pago");
      setSelecting(null);
    }
  };

  const isCurrentPlan = (planSlug: string) => currentPlan?.slug === planSlug;

  const getPlanAction = (plan: Plan) => {
    if (!currentPlan) return { label: "Seleccionar", type: "select" as const };
    if (isCurrentPlan(plan.slug)) return { label: "Plan actual", type: "current" as const };

    const currentIdx = plans.findIndex((p) => p.id === currentPlan.id);
    const targetIdx = plans.findIndex((p) => p.id === plan.id);

    if (targetIdx > currentIdx) return { label: "Mejorar plan", type: "upgrade" as const };
    return { label: "Cambiar plan", type: "downgrade" as const };
  };

  if (loading || planLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/account")}
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a mi cuenta
        </button>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Planes y precios
        </h1>
        <p className="mt-2 text-base text-muted-foreground max-w-xl">
          Elige el plan que mejor se adapte a tu realidad.
          Sin contratos, sin sorpresas. IA incluida en todos.
        </p>
      </div>

      {/* Current plan summary */}
      {currentPlan && subscription && (
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/50 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Check className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">
              Tu plan actual: <span className="text-primary">{currentPlan.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {subscription.status === "trialing"
                ? "Periodo de prueba activo"
                : subscription.status === "active"
                  ? "Suscripcion activa"
                  : subscription.status}
              {` — S/${currentPlan.price_monthly}/mes`}
            </p>
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {plans.map((plan) => {
          const isCurrent = isCurrentPlan(plan.slug);
          const action = getPlanAction(plan);
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
                  : "border-border bg-card shadow-sm hover:shadow-md",
                isCurrent && "ring-2 ring-primary/50"
              )}
            >
              {/* Badge */}
              {isPopular && !isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  Recomendado
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Tu plan
                </span>
              )}

              <h3 className="text-lg font-bold">{plan.name}</h3>

              {/* Price */}
              <div className="mt-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-muted-foreground">S/</span>
                  <span className="text-4xl font-extrabold tabular-nums">
                    {plan.price_monthly}
                  </span>
                  <span className="text-sm text-muted-foreground">/mes</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {anchor}
                </p>
              </div>

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

              {/* CTA button */}
              <div className="mt-6">
                <button
                  onClick={() => handleChangePlan(plan.id)}
                  disabled={isCurrent || selecting !== null}
                  className={cn(
                    "flex w-full h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                    isCurrent
                      ? "border border-border bg-card text-muted-foreground"
                      : isPopular
                        ? "gradient-primary text-white shadow-md hover:opacity-90 hover:shadow-lg"
                        : "border border-border bg-card text-foreground hover:bg-accent/50 hover:border-emerald-300 dark:hover:border-emerald-500/40"
                  )}
                >
                  {selecting === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    <Check className="h-4 w-4" />
                  ) : null}
                  {action.label}
                  {!isCurrent && ` — S/${plan.price_monthly}/mes`}
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
  );
}
