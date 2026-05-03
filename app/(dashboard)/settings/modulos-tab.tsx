"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useOrgAddons, type Addon } from "@/hooks/use-org-addons";
import { useOrgRole } from "@/hooks/use-org-role";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Star,
  Lock,
  CheckCircle2,
  Scan,
  Smile,
  Apple,
  Brain,
  Baby,
  Eye,
  HeartPulse,
  HeartHandshake,
  Bone,
  Video,
  BarChart3,
  Package,
  FlaskConical,
  Settings,
  Sliders,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  Scan,
  Smile,
  Apple,
  Brain,
  Baby,
  Eye,
  HeartPulse,
  HeartHandshake,
  Bone,
  Sparkles,
  Video,
  BarChart3,
  Package,
  FlaskConical,
};

const FERTILITY_BASIC_BULLETS = [
  "Seguimientos automáticos entre 1ra y 2da consulta",
  "Atribución honesta de recuperaciones",
  "Plantillas WhatsApp y email aprobadas",
];

const FERTILITY_PREMIUM_BULLETS = [
  "Constructor de reglas custom por tipo de servicio",
  "Plantillas editables por la clínica",
  "Cascadas de canales (WhatsApp + email + SMS)",
  "Reportes de conversión por médico",
];

const CATEGORY_LABELS: Record<string, { es: string; en: string }> = {
  specialty: { es: "Especialidades Médicas", en: "Medical Specialties" },
  workflow: { es: "Flujos de Trabajo", en: "Workflows" },
  clinical: { es: "Clínico", en: "Clinical" },
};

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

export default function ModulosTab() {
  const { addons, loading, toggleAddon, activateAddon, deactivateAddon } =
    useOrgAddons();
  const { isAdmin } = useOrgRole();
  const router = useRouter();
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async (addon: Addon) => {
    if (!isAdmin) return;
    if (addon.key === "fertility_premium" && !addon.enabled) {
      toast.info(
        "Pack Fertilidad Premium aún no está disponible. Activa el pack básico para empezar."
      );
      return;
    }
    setToggling(addon.key);

    // Fertility uses the tier-aware activate/deactivate endpoints so the
    // exclusive tier_group guard runs and the wizard URL is returned.
    if (addon.key === "fertility_basic") {
      if (!addon.enabled) {
        const result = await activateAddon(addon.key);
        setToggling(null);
        if (result.ok) {
          toast.success(`${addon.name} activado`);
          if (result.warnings?.length) {
            for (const w of result.warnings) toast.warning(w);
          }
          const url =
            result.setup_url ?? "/admin/addon-config/fertility/canonical-mapping";
          router.push(url);
        } else {
          toast.error(result.error);
        }
        return;
      } else {
        const ok = await deactivateAddon(addon.key);
        setToggling(null);
        if (ok) toast.success(`${addon.name} desactivado`);
        else toast.error("Error al desactivar el módulo");
        return;
      }
    }

    const ok = await toggleAddon(addon.key, !addon.enabled);
    setToggling(null);
    if (ok) {
      toast.success(
        addon.enabled
          ? `${addon.name} desactivado`
          : `${addon.name} activado`
      );
    } else {
      toast.error("Error al cambiar el módulo");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const recommended = addons.filter((a) => a.recommended);
  const byCategory = addons.reduce(
    (acc, a) => {
      (acc[a.category] ??= []).push(a);
      return acc;
    },
    {} as Record<string, Addon[]>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Módulos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Activa herramientas especializadas para tu clínica. Los módulos recomendados
          se basan en la especialidad que elegiste durante el onboarding.
        </p>
      </div>

      {/* Recommended section */}
      {recommended.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Recomendados para tu especialidad</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((addon) => (
              <AddonCard
                key={addon.key}
                addon={addon}
                toggling={toggling === addon.key}
                isAdmin={isAdmin}
                onToggle={() => handleToggle(addon)}
                highlighted
              />
            ))}
          </div>
        </div>
      )}

      {/* All modules by category */}
      {(["specialty", "workflow", "clinical"] as const).map((cat) => {
        const items = byCategory[cat];
        if (!items?.length) return null;
        const label = CATEGORY_LABELS[cat];
        return (
          <div key={cat} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {label.es}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((addon) => (
                <AddonCard
                  key={addon.key}
                  addon={addon}
                  toggling={toggling === addon.key}
                  isAdmin={isAdmin}
                  onToggle={() => handleToggle(addon)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddonCard({
  addon,
  toggling,
  isAdmin,
  onToggle,
  highlighted,
}: {
  addon: Addon;
  toggling: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  highlighted?: boolean;
}) {
  const Icon = ICON_MAP[addon.icon ?? ""] ?? Sparkles;
  const isFertilityBasic = addon.key === "fertility_basic";
  const isFertilityPremium = addon.key === "fertility_premium";

  return (
    <div
      className={`relative rounded-2xl border p-4 transition-all ${
        addon.enabled
          ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
          : highlighted
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border/60 bg-card hover:border-border"
      }`}
    >
      {/* Top row: icon + toggle */}
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            addon.enabled
              ? "bg-primary/10 text-primary"
              : "bg-muted/60 text-muted-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>

        {/* Toggle or lock */}
        {isFertilityPremium ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 border border-violet-500/30 px-2 py-0.5 text-[10px] font-semibold text-violet-500">
            <Sparkles className="h-2.5 w-2.5" />
            Próximamente
          </span>
        ) : isAdmin ? (
          <button
            onClick={onToggle}
            disabled={toggling}
            className="relative shrink-0"
            title={addon.enabled ? "Desactivar módulo" : "Activar módulo"}
          >
            {toggling ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="relative">
                <div
                  className={`h-6 w-11 rounded-full transition-colors ${
                    addon.enabled ? "bg-primary" : "bg-muted"
                  }`}
                />
                <div
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    addon.enabled ? "translate-x-5" : ""
                  }`}
                />
              </div>
            )}
          </button>
        ) : addon.enabled ? (
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
        ) : (
          <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
        )}
      </div>

      {/* Name + badges */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold leading-tight">{addon.name}</h4>
          {addon.is_premium && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
              <Sparkles className="h-2.5 w-2.5" />
              PRO
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {addon.description}
        </p>
      </div>

      {/* Bullets for fertility addons */}
      {(isFertilityBasic || isFertilityPremium) && (
        <ul className="mt-3 space-y-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
          {(isFertilityBasic
            ? FERTILITY_BASIC_BULLETS
            : FERTILITY_PREMIUM_BULLETS
          ).map((bullet) => (
            <li key={bullet} className="flex items-start gap-1.5">
              <CheckCircle2
                className={`mt-[1px] h-3 w-3 shrink-0 ${
                  isFertilityBasic ? "text-primary" : "text-violet-500"
                }`}
              />
              <span className="leading-snug">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Settings links for activated fertility_basic */}
      {isFertilityBasic && addon.enabled && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-border/40 pt-3">
          <Link
            href="/admin/addon-config/fertility/canonical-mapping"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <Sliders className="h-3 w-3" />
            Mapear servicios
          </Link>
          <Link
            href="/admin/addon-config/fertility/settings"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <Settings className="h-3 w-3" />
            Configurar plazos y tono
          </Link>
        </div>
      )}

      {isFertilityPremium && (
        <p className="mt-3 border-t border-border/40 pt-3 text-[11px] text-muted-foreground italic">
          Disponible en próxima iteración. Activa el pack básico para empezar.
        </p>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        {addon.enabled && addon.activated_at && (
          <span className="inline-flex items-center gap-1 text-primary font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Activo
          </span>
        )}
        {addon.is_premium && !isFertilityPremium && (
          <span>
            Plan {PLAN_LABELS[addon.min_plan] ?? addon.min_plan}+
          </span>
        )}
      </div>
    </div>
  );
}
