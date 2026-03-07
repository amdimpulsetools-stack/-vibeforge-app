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
  Building2,
  Users,
  Stethoscope,
  CalendarDays,
  HardDrive,
  Plus,
  UserPlus,
  type LucideIcon,
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

const PLAN_ICONS: Record<string, LucideIcon> = {
  starter: Stethoscope,
  professional: Building2,
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

const AUDIENCE_LABELS: Record<string, string> = {
  independiente: "Doctor Independiente",
  centro_medico: "Centro Médico",
  clinica: "Clínica",
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
        await supabase.rpc("ensure_user_has_org");
        const { data: newMembers } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1);
        members = newMembers;
      }

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
  }, [router]);

  const handleStartTrial = async (planId: string) => {
    setSelecting(planId);
    try {
      const res = await fetch("/api/plans/start-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al iniciar la prueba");
        setSelecting(null);
        return;
      }

      toast.success("¡Prueba de 14 días activada!");
      router.push("/dashboard");
    } catch {
      toast.error("Error de conexión");
      setSelecting(null);
    }
  };

  const handleSelect = async (planId: string) => {
    setSelecting(planId);
    const selectedPlan = plans.find((p) => p.id === planId);

    // All plans go through Mercado Pago checkout
    try {
      const res = await fetch("/api/mercadopago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, billing_cycle: "monthly" }),
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
      toast.error("Error de conexión al procesar el pago");
      setSelecting(null);
    }
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
            Selecciona el plan que mejor se adapte a tu realidad.
            Puedes cambiar de plan en cualquier momento.
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

                  {/* Target audience badge */}
                  {plan.target_audience && (
                    <p className="text-[11px] font-medium text-muted-foreground mb-2">
                      {AUDIENCE_LABELS[plan.target_audience] ?? plan.target_audience}
                    </p>
                  )}

                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      ${plan.price_monthly}
                    </span>
                    <span className="text-sm text-muted-foreground">/mes</span>
                  </div>
                  {plan.description && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                </div>

                {/* Team composition */}
                <div className="space-y-2 mb-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Equipo incluido
                  </h4>
                  <Feature
                    icon={Users}
                    label="Miembros totales"
                    value={formatLimit(plan.max_members)}
                  />
                  {(plan.max_admins ?? 0) > 0 && (
                    <Feature
                      icon={UserPlus}
                      label="Administradores"
                      value={formatLimit(plan.max_admins)}
                    />
                  )}
                  {(plan.max_receptionists ?? 0) > 0 && (
                    <Feature
                      icon={UserPlus}
                      label="Recepcionistas"
                      value={formatLimit(plan.max_receptionists)}
                    />
                  )}
                  <Feature
                    icon={Stethoscope}
                    label="Doctores"
                    value={formatLimit(plan.max_doctor_members ?? plan.max_doctors)}
                  />
                </div>

                {/* Resources */}
                <div className="space-y-2 mb-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Recursos
                  </h4>
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
                    icon={Users}
                    label="Pacientes"
                    value={formatLimit(plan.max_patients)}
                  />
                  <Feature
                    icon={HardDrive}
                    label="Almacenamiento"
                    value={formatStorage(plan.max_storage_mb)}
                  />
                </div>

                {/* Expandable info */}
                {plan.addon_price_per_office && (
                  <div className="mb-4 rounded-lg bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Plus className="h-3 w-3 text-primary" />
                      <span className="text-[11px] font-bold text-primary">
                        Ampliable
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      +${plan.addon_price_per_office}/consultorio extra
                    </p>
                    {plan.addon_price_per_member && (
                      <p className="text-[11px] text-muted-foreground">
                        +${plan.addon_price_per_member}/miembro adicional
                      </p>
                    )}
                  </div>
                )}

                {/* Feature flags */}
                <div className="flex-1 border-t border-border/50 pt-3 space-y-2 mb-6">
                  <FeatureFlag
                    enabled={plan.feature_reports}
                    label="Reportes"
                  />
                  <FeatureFlag
                    enabled={plan.feature_export}
                    label="Exportar datos"
                  />
                  <FeatureFlag
                    enabled={plan.feature_ai_assistant ?? false}
                    label="Asistente IA"
                  />
                  <FeatureFlag
                    enabled={plan.feature_priority_support}
                    label="Soporte prioritario"
                  />
                </div>

                {/* CTA */}
                <div className="space-y-2">
                  <button
                    onClick={() => handleStartTrial(plan.id)}
                    disabled={selecting !== null}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50",
                      PLAN_BTN_COLORS[plan.slug] ?? "bg-primary hover:opacity-90"
                    )}
                  >
                    {selecting === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Iniciar prueba de 14 días
                  </button>
                  <button
                    onClick={() => handleSelect(plan.id)}
                    disabled={selecting !== null}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/50 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent/50 hover:text-foreground disabled:opacity-50"
                  >
                    Pagar suscripción — S/{plan.price_monthly}/mes
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Pagos procesados de forma segura con Mercado Pago.
          Puedes cambiar o cancelar tu plan en cualquier momento.
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
