"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import {
  Zap,
  Check,
  Loader2,
  Crown,
  Rocket,
  Building2,
  Users,
  Stethoscope,
  CalendarDays,
  HardDrive,
  BarChart3,
  Download,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  feature_reports: boolean;
  feature_export: boolean;
  feature_priority_support: boolean;
}

const PLAN_ICONS: Record<string, typeof Zap> = {
  starter: Zap,
  professional: Rocket,
  enterprise: Crown,
};

const PLAN_COLORS: Record<string, string> = {
  starter: "border-emerald-500/50 bg-emerald-500/5",
  professional: "border-blue-500/50 bg-blue-500/5 ring-2 ring-blue-500/20",
  enterprise: "border-amber-500/50 bg-amber-500/5",
};

const PLAN_BADGE_COLORS: Record<string, string> = {
  starter: "bg-emerald-500/10 text-emerald-500",
  professional: "bg-blue-500/10 text-blue-500",
  enterprise: "bg-amber-500/10 text-amber-500",
};

const PLAN_BTN_COLORS: Record<string, string> = {
  starter: "bg-emerald-600 hover:bg-emerald-700",
  professional: "bg-blue-600 hover:bg-blue-700",
  enterprise: "bg-amber-600 hover:bg-amber-700",
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

export default function SelectPlanPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [hasSubscription, setHasSubscription] = useState(false);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();

      // Check if user is authenticated
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Check if they already have an org with subscription
      const { data: members } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      if (members && members.length > 0) {
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
      }

      // Fetch plans directly via Supabase client
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
  }, [router]);

  const handleSelect = async (planId: string) => {
    setSelecting(planId);

    const res = await fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId }),
    });

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Error al seleccionar plan");
      setSelecting(null);
      return;
    }

    const selectedPlan = plans.find((p) => p.id === planId);
    toast.success(
      `Plan ${selectedPlan?.name ?? ""} activado${selectedPlan?.slug !== "starter" ? " (14 días de prueba)" : ""}`
    );
    router.push("/dashboard");
  };

  if (loading || hasSubscription) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">{APP_NAME}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Elige tu plan
          </h1>
          <p className="mt-2 text-muted-foreground max-w-lg mx-auto">
            Selecciona el plan que mejor se adapte a tu consultorio. Puedes
            cambiar de plan en cualquier momento.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const PlanIcon = PLAN_ICONS[plan.slug] ?? Zap;
            const isPopular = plan.slug === "professional";

            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-2xl border p-6 transition-all hover:shadow-lg",
                  PLAN_COLORS[plan.slug] ?? "border-border bg-card"
                )}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white">
                      Recomendado
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium mb-3",
                      PLAN_BADGE_COLORS[plan.slug] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    <PlanIcon className="h-3.5 w-3.5" />
                    {plan.name}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      ${plan.price_monthly}
                    </span>
                    {plan.price_monthly > 0 && (
                      <span className="text-sm text-muted-foreground">/mes</span>
                    )}
                    {plan.price_monthly === 0 && (
                      <span className="text-sm text-muted-foreground">Gratis</span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </div>

                {/* Features */}
                <div className="flex-1 space-y-3 mb-6">
                  <Feature
                    icon={Users}
                    label="Miembros"
                    value={formatLimit(plan.max_members)}
                  />
                  <Feature
                    icon={Stethoscope}
                    label="Doctores"
                    value={formatLimit(plan.max_doctors)}
                  />
                  <Feature
                    icon={Building2}
                    label="Consultorios"
                    value={formatLimit(plan.max_offices)}
                  />
                  <Feature
                    icon={CalendarDays}
                    label="Citas/mes"
                    value={formatLimit(plan.max_appointments_per_month)}
                  />
                  <Feature
                    icon={HardDrive}
                    label="Almacenamiento"
                    value={formatStorage(plan.max_storage_mb)}
                  />

                  <div className="border-t border-border/50 pt-3 space-y-2">
                    <FeatureFlag
                      enabled={plan.feature_reports}
                      label="Reportes"
                    />
                    <FeatureFlag
                      enabled={plan.feature_export}
                      label="Exportar datos"
                    />
                    <FeatureFlag
                      enabled={plan.feature_priority_support}
                      label="Soporte prioritario"
                    />
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleSelect(plan.id)}
                  disabled={selecting !== null}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50",
                    PLAN_BTN_COLORS[plan.slug] ?? "bg-primary hover:opacity-90"
                  )}
                >
                  {selecting === plan.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {plan.price_monthly === 0
                    ? "Empezar gratis"
                    : "Iniciar prueba de 14 días"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Los planes de pago incluyen 14 días de prueba gratuita. No se requiere
          tarjeta de crédito. Puedes cambiar o cancelar en cualquier momento.
        </p>
      </div>
    </div>
  );
}

function Feature({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FeatureFlag({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check
        className={cn(
          "h-4 w-4",
          enabled ? "text-emerald-500" : "text-muted-foreground/30"
        )}
      />
      <span className={enabled ? "" : "text-muted-foreground/50 line-through"}>
        {label}
      </span>
    </div>
  );
}
