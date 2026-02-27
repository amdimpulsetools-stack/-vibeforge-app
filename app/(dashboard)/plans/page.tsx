"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePlan } from "@/hooks/use-plan";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  X,
  Crown,
  Building2,
  Users,
  Stethoscope,
  CalendarDays,
  HardDrive,
  Zap,
  Rocket,
  ArrowLeft,
  Sparkles,
  Shield,
  ChevronDown,
  ChevronUp,
  Star,
  TrendingUp,
  UserPlus,
  Plus,
  type LucideIcon,
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

/* ───── Config maps ───── */
const PLAN_META: Record<
  string,
  { icon: LucideIcon; accent: string; bg: string; badge: string; btn: string; glow: string }
> = {
  starter: {
    icon: Zap,
    accent: "text-emerald-400",
    bg: "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40",
    badge: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    btn: "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/25",
    glow: "shadow-emerald-500/10",
  },
  professional: {
    icon: Rocket,
    accent: "text-blue-400",
    bg: "bg-blue-500/5 border-blue-500/30 hover:border-blue-500/50",
    badge: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",
    btn: "bg-blue-600 hover:bg-blue-500 shadow-blue-500/25",
    glow: "shadow-blue-500/10",
  },
  enterprise: {
    icon: Crown,
    accent: "text-amber-400",
    bg: "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40",
    badge: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    btn: "bg-amber-600 hover:bg-amber-500 shadow-amber-500/25",
    glow: "shadow-amber-500/10",
  },
};

const AUDIENCE_LABELS: Record<string, string> = {
  independiente: "Doctor Independiente",
  centro_medico: "Centro Medico",
  clinica: "Clinica / Hospital",
};

const DEFAULT_META = {
  icon: Zap,
  accent: "text-primary",
  bg: "border-border bg-card",
  badge: "bg-muted text-muted-foreground",
  btn: "bg-primary hover:opacity-90",
  glow: "",
};

/* ───── Helpers ───── */
function formatLimit(val: number | null): string {
  if (val === null) return "Ilimitado";
  return val.toLocaleString();
}

function formatStorage(mb: number | null): string {
  if (mb === null) return "Ilimitado";
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

/* ───── Page ───── */
export default function PlansPage() {
  const router = useRouter();
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
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

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
      <div className="flex items-start justify-between">
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
          <p className="mt-1 text-muted-foreground">
            Elige el plan que mejor se adapte a las necesidades de tu practica.
          </p>
        </div>
      </div>

      {/* Current plan summary */}
      {currentPlan && subscription && (
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/50 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            {(() => {
              const PIcon = PLAN_META[currentPlan.slug]?.icon ?? Zap;
              return <PIcon className={cn("h-5 w-5", PLAN_META[currentPlan.slug]?.accent ?? "text-primary")} />;
            })()}
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
              {` — $${currentPlan.price_monthly}/mes`}
            </p>
          </div>
          {usage && (
            <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {usage.members}/{currentPlan.max_members ?? "\u221E"}
              </span>
              <span className="flex items-center gap-1">
                <Stethoscope className="h-3.5 w-3.5" />
                {usage.doctors}/{currentPlan.max_doctors ?? "\u221E"}
              </span>
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {usage.offices}/{currentPlan.max_offices ?? "\u221E"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const meta = PLAN_META[plan.slug] ?? DEFAULT_META;
          const PlanIcon = meta.icon;
          const isCurrent = isCurrentPlan(plan.slug);
          const action = getPlanAction(plan);
          const isPopular = plan.slug === "professional";
          const isExpanded = expandedPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 transition-all duration-300",
                meta.bg,
                isCurrent && "ring-2 ring-primary/50",
                isPopular && !isCurrent && "ring-2 ring-blue-500/30",
                `hover:shadow-xl ${meta.glow}`
              )}
            >
              {/* Badges */}
              {isPopular && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="flex items-center gap-1 rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-blue-500/30">
                    <Star className="h-3 w-3" />
                    Recomendado
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                  <span className="flex items-center gap-1 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground shadow-lg">
                    <Check className="h-3 w-3" />
                    Tu plan
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="mb-5 pt-1">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                      meta.badge
                    )}
                  >
                    <PlanIcon className="h-3.5 w-3.5" />
                    {plan.name}
                  </div>
                </div>

                {/* Audience */}
                {plan.target_audience && (
                  <p className="text-[11px] font-medium text-muted-foreground mb-2">
                    Ideal para: {AUDIENCE_LABELS[plan.target_audience] ?? plan.target_audience}
                  </p>
                )}

                {/* Price */}
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight">
                    ${plan.price_monthly}
                  </span>
                  <span className="text-sm text-muted-foreground font-medium">/mes</span>
                </div>
                {plan.price_yearly && plan.price_monthly > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    o ${plan.price_yearly}/ano (ahorra ${plan.price_monthly * 12 - plan.price_yearly})
                  </p>
                )}
                {plan.description && (
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {plan.description}
                  </p>
                )}
              </div>

              {/* Team */}
              <div className="space-y-2.5 mb-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Equipo
                </h4>
                <ResourceRow
                  icon={Users}
                  label="Miembros totales"
                  value={formatLimit(plan.max_members)}
                  current={isCurrent ? usage?.members : undefined}
                  limit={plan.max_members}
                />
                <ResourceRow
                  icon={Stethoscope}
                  label="Doctores"
                  value={formatLimit(plan.max_doctor_members ?? plan.max_doctors)}
                  current={isCurrent ? usage?.doctors : undefined}
                  limit={plan.max_doctor_members ?? plan.max_doctors}
                />
                {(plan.max_admins ?? 0) > 0 && (
                  <ResourceRow
                    icon={UserPlus}
                    label="Administradores"
                    value={formatLimit(plan.max_admins)}
                  />
                )}
              </div>

              {/* Resources */}
              <div className="space-y-2.5 mb-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Recursos
                </h4>
                <ResourceRow
                  icon={Building2}
                  label="Consultorios"
                  value={formatLimit(plan.max_offices)}
                  current={isCurrent ? usage?.offices : undefined}
                  limit={plan.max_offices}
                />
                <ResourceRow
                  icon={CalendarDays}
                  label="Citas por mes"
                  value={formatLimit(plan.max_appointments_per_month)}
                />
                <ResourceRow
                  icon={Users}
                  label="Pacientes"
                  value={formatLimit(plan.max_patients)}
                />
                <ResourceRow
                  icon={HardDrive}
                  label="Almacenamiento"
                  value={formatStorage(plan.max_storage_mb)}
                />
              </div>

              {/* Addons (expandable) */}
              {plan.addon_price_per_office && (
                <div className="mb-4 rounded-xl bg-muted/30 border border-border/40 p-3">
                  <div className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-semibold text-primary">Ampliable</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    +${plan.addon_price_per_office}/consultorio extra
                  </p>
                  {plan.addon_price_per_member && (
                    <p className="text-[11px] text-muted-foreground">
                      +${plan.addon_price_per_member}/miembro adicional
                    </p>
                  )}
                </div>
              )}

              {/* Features */}
              <div className="flex-1 space-y-2 border-t border-border/30 pt-4 mb-6">
                <FeatureCheck enabled={plan.feature_reports} label="Reportes avanzados" />
                <FeatureCheck enabled={plan.feature_export} label="Exportar datos" />
                <FeatureCheck enabled={plan.feature_ai_assistant ?? false} label="Asistente IA" />
                <FeatureCheck enabled={plan.feature_priority_support} label="Soporte prioritario" />
              </div>

              {/* CTA */}
              <button
                onClick={() => handleChangePlan(plan.id)}
                disabled={isCurrent || selecting !== null}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:cursor-not-allowed",
                  isCurrent
                    ? "border border-border/60 bg-muted/50 text-muted-foreground"
                    : cn(
                        "text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5",
                        meta.btn
                      ),
                  selecting !== null && !isCurrent && "opacity-50"
                )}
              >
                {selecting === plan.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  <Check className="h-4 w-4" />
                ) : action.type === "upgrade" ? (
                  <TrendingUp className="h-4 w-4" />
                ) : null}
                {action.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* Comparison table (expanded details) */}
      <ComparisonTable plans={plans} currentSlug={currentPlan?.slug ?? null} />

      {/* Footer notes */}
      <div className="flex items-start gap-3 rounded-2xl border border-border/40 bg-card/50 p-5">
        <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Sin compromisos</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pagos procesados de forma segura con Mercado Pago.
            Puedes cambiar o cancelar tu plan en cualquier momento sin penalizaciones.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───── Sub-components ───── */

function ResourceRow({
  icon: Icon,
  label,
  value,
  current,
  limit,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  current?: number;
  limit?: number | null;
}) {
  const showBar = current !== undefined && limit !== null && limit !== undefined;
  const pct = showBar ? Math.min((current / limit) * 100, 100) : 0;
  const isNear = showBar && pct >= 80;
  const isAt = showBar && current >= limit;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </div>
        <span className="font-semibold tabular-nums">
          {current !== undefined ? (
            <span>
              <span className={cn(isAt && "text-destructive", isNear && !isAt && "text-amber-500")}>
                {current}
              </span>
              <span className="text-muted-foreground font-normal"> / {value}</span>
            </span>
          ) : (
            value
          )}
        </span>
      </div>
      {showBar && (
        <div className="h-1 w-full rounded-full bg-muted/60 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isAt ? "bg-destructive" : isNear ? "bg-amber-500" : "bg-primary/60"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function FeatureCheck({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {enabled ? (
        <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-3 w-3 text-emerald-500" />
        </div>
      ) : (
        <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-muted">
          <X className="h-3 w-3 text-muted-foreground/40" />
        </div>
      )}
      <span className={enabled ? "text-foreground" : "text-muted-foreground/50"}>
        {label}
      </span>
    </div>
  );
}

function ComparisonTable({
  plans,
  currentSlug,
}: {
  plans: Plan[];
  currentSlug: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (plans.length === 0) return null;

  const rows: { label: string; key: string; format?: (v: Plan) => string }[] = [
    { label: "Miembros", key: "max_members", format: (p) => formatLimit(p.max_members) },
    { label: "Doctores", key: "max_doctors", format: (p) => formatLimit(p.max_doctor_members ?? p.max_doctors) },
    { label: "Consultorios", key: "max_offices", format: (p) => formatLimit(p.max_offices) },
    { label: "Pacientes", key: "max_patients", format: (p) => formatLimit(p.max_patients) },
    { label: "Citas / mes", key: "max_appointments_per_month", format: (p) => formatLimit(p.max_appointments_per_month) },
    { label: "Almacenamiento", key: "max_storage_mb", format: (p) => formatStorage(p.max_storage_mb) },
  ];

  const featureRows: { label: string; key: keyof Plan }[] = [
    { label: "Reportes", key: "feature_reports" },
    { label: "Exportar datos", key: "feature_export" },
    { label: "Asistente IA", key: "feature_ai_assistant" },
    { label: "Soporte prioritario", key: "feature_priority_support" },
  ];

  return (
    <div className="rounded-2xl border border-border/40 bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-sm font-semibold hover:bg-muted/30 transition-colors"
      >
        <span>Comparar planes en detalle</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/40 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Caracteristica
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    className={cn(
                      "px-4 py-3 text-center text-xs font-medium uppercase tracking-wider",
                      plan.slug === currentSlug
                        ? "text-primary bg-primary/5"
                        : "text-muted-foreground"
                    )}
                  >
                    {plan.name}
                    {plan.slug === currentSlug && (
                      <span className="ml-1 text-[10px] normal-case">(actual)</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border/20">
                  <td className="px-6 py-2.5 text-muted-foreground">{row.label}</td>
                  {plans.map((plan) => (
                    <td
                      key={plan.id}
                      className={cn(
                        "px-4 py-2.5 text-center font-medium tabular-nums",
                        plan.slug === currentSlug && "bg-primary/5"
                      )}
                    >
                      {row.format ? row.format(plan) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td
                  colSpan={plans.length + 1}
                  className="px-6 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/20"
                >
                  Funciones
                </td>
              </tr>
              {featureRows.map((row) => (
                <tr key={row.key} className="border-b border-border/20">
                  <td className="px-6 py-2.5 text-muted-foreground">{row.label}</td>
                  {plans.map((plan) => (
                    <td
                      key={plan.id}
                      className={cn(
                        "px-4 py-2.5 text-center",
                        plan.slug === currentSlug && "bg-primary/5"
                      )}
                    >
                      {(plan[row.key] as boolean) ? (
                        <Check className="h-4 w-4 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
