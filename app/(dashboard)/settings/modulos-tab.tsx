"use client";

import { useState } from "react";
import { useOrgAddons, type Addon } from "@/hooks/use-org-addons";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrganization } from "@/components/organization-provider";
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
  Settings as SettingsIcon,
  Layers,
  Stethoscope,
} from "lucide-react";
import {
  ModuleActivateDialog,
} from "@/components/modules/module-activate-dialog";
import {
  ModuleConfigDialog,
  type ConfigLink,
} from "@/components/modules/module-config-dialog";

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
  "Seguimientos automaticos entre 1ra y 2da consulta",
  "Atribucion honesta de recuperaciones",
  "Plantillas WhatsApp y email aprobadas",
];

const FERTILITY_PREMIUM_BULLETS = [
  "Constructor de reglas custom por tipo de servicio",
  "Plantillas editables por la clinica",
  "Cascadas de canales (WhatsApp + email + SMS)",
  "Reportes de conversion por medico",
];

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

interface AddonMetadata {
  features: string[];
  setupUrl?: string;
  configLinks: ConfigLink[];
  iconTone: "emerald" | "violet" | "sky" | "amber" | "rose";
}

function getAddonMetadata(addon: Addon): AddonMetadata {
  if (addon.key === "fertility_basic") {
    return {
      features: FERTILITY_BASIC_BULLETS,
      setupUrl: "/admin/addon-config/fertility/canonical-mapping",
      configLinks: [
        {
          label: "Mapear servicios",
          description:
            "Conecta los nombres de tus servicios con las categorias canonicas del addon.",
          href: "/admin/addon-config/fertility/canonical-mapping",
        },
        {
          label: "Configurar plazos y tono",
          description:
            "Ajusta el timing y la voz de los seguimientos automaticos.",
          href: "/admin/addon-config/fertility/settings",
        },
      ],
      iconTone: "emerald",
    };
  }

  if (addon.key === "fertility_premium") {
    return {
      features: FERTILITY_PREMIUM_BULLETS,
      configLinks: [],
      iconTone: "violet",
    };
  }

  const tone: AddonMetadata["iconTone"] =
    addon.category === "workflow"
      ? "sky"
      : addon.category === "clinical"
        ? "amber"
        : "emerald";

  return {
    features: [],
    configLinks: [],
    iconTone: tone,
  };
}

const TONE_CLASSES: Record<AddonMetadata["iconTone"], string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

export default function ModulosTab() {
  const { addons, loading, activateAddon, deactivateAddon } = useOrgAddons();
  const { isAdmin } = useOrgRole();
  const { organization } = useOrganization();
  // Si la org tiene specialty principal (típico tras onboarding), oculto la
  // sección "Otras especialidades disponibles" — un consultorio de fertilidad
  // no necesita ver oftalmología/odontología en su listado de módulos. Cuando
  // la org no tiene specialty seteada (caso edge: legacy o sin onboarding),
  // se muestran todas como fallback informativo.
  const hasOrgSpecialty = Boolean(
    (organization as { primary_specialty_id?: string | null } | null)?.primary_specialty_id
  );

  const [activateTarget, setActivateTarget] = useState<Addon | null>(null);
  const [configTarget, setConfigTarget] = useState<Addon | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = addons.filter((a) => a.enabled);
  const activeKeys = new Set(active.map((a) => a.key));

  const inactive = addons.filter((a) => !activeKeys.has(a.key));

  const recommended = inactive.filter(
    (a) => a.recommended && !a.is_premium && a.category === "specialty"
  );
  const recommendedKeys = new Set(recommended.map((a) => a.key));

  const otherSpecialties = inactive.filter(
    (a) => a.category === "specialty" && !recommendedKeys.has(a.key)
  );

  const additional = inactive.filter((a) => a.category !== "specialty");

  const sections: Array<{
    key: string;
    title: string;
    subtitle?: string;
    icon: React.ElementType;
    iconClassName: string;
    items: Addon[];
  }> = [];

  if (active.length > 0) {
    sections.push({
      key: "active",
      title: "Mis activos",
      subtitle: "Modulos activos en tu clinica",
      icon: CheckCircle2,
      iconClassName: "text-primary",
      items: active,
    });
  }

  if (recommended.length > 0) {
    sections.push({
      key: "recommended",
      title: "Recomendados para tu especialidad",
      subtitle:
        "Sugeridos en base a la especialidad principal que elegiste durante el onboarding",
      icon: Star,
      iconClassName: "text-emerald-500",
      items: recommended,
    });
  }

  // Solo mostrar "Otras especialidades disponibles" si la org NO tiene
  // specialty principal seteada — para consultorios verticales (fertilidad,
  // dermatología, etc.) es ruido confuso ver oftalmología u odontología.
  if (!hasOrgSpecialty && otherSpecialties.length > 0) {
    sections.push({
      key: "specialty",
      title: "Otras especialidades disponibles",
      icon: Stethoscope,
      iconClassName: "text-muted-foreground",
      items: otherSpecialties,
    });
  }

  if (additional.length > 0) {
    sections.push({
      key: "additional",
      title: "Herramientas adicionales",
      subtitle: "Workflow y herramientas clinicas",
      icon: Layers,
      iconClassName: "text-muted-foreground",
      items: additional,
    });
  }

  const handleActivateClick = (addon: Addon) => {
    if (!isAdmin) return;
    setActivateTarget(addon);
  };

  const handleConfigureClick = (addon: Addon) => {
    if (!isAdmin) return;
    setConfigTarget(addon);
  };

  const activateMeta = activateTarget ? getAddonMetadata(activateTarget) : null;
  const configMeta = configTarget ? getAddonMetadata(configTarget) : null;

  return (
    <>
      <div className="space-y-8">
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Modulos</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Activa herramientas especializadas para tu clinica. Los modulos
                recomendados se basan en la especialidad que elegiste durante
                el onboarding.
              </p>
            </div>
          </div>
        </div>

        {sections.map((section) => {
          const SectionIcon = section.icon;
          return (
            <section key={section.key} className="space-y-3">
              <div className="flex items-start gap-2">
                <SectionIcon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${section.iconClassName}`}
                />
                <div>
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  {section.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {section.subtitle}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((addon) => (
                  <AddonCard
                    key={addon.key}
                    addon={addon}
                    isAdmin={isAdmin}
                    onActivate={() => handleActivateClick(addon)}
                    onConfigure={() => handleConfigureClick(addon)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {sections.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
            <p className="text-sm font-medium">
              No hay modulos disponibles para tu plan actual.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Escribenos a soporte@yenda.app si quieres ver mas opciones.
            </p>
          </div>
        )}
      </div>

      {activateTarget && activateMeta && (
        <ModuleActivateDialog
          open={!!activateTarget}
          onOpenChange={(open) => {
            if (!open) setActivateTarget(null);
          }}
          addonKey={activateTarget.key}
          addonName={activateTarget.name}
          addonDescription={activateTarget.description}
          addonFeatures={activateMeta.features}
          setupUrl={activateMeta.setupUrl}
          activate={activateAddon}
        />
      )}

      {configTarget && configMeta && (
        <ModuleConfigDialog
          open={!!configTarget}
          onOpenChange={(open) => {
            if (!open) setConfigTarget(null);
          }}
          addonKey={configTarget.key}
          addonName={configTarget.name}
          configLinks={configMeta.configLinks}
          onDeactivate={async () => deactivateAddon(configTarget.key)}
        />
      )}
    </>
  );
}

interface AddonCardProps {
  addon: Addon;
  isAdmin: boolean;
  onActivate: () => void;
  onConfigure: () => void;
}

function AddonCard({
  addon,
  isAdmin,
  onActivate,
  onConfigure,
}: AddonCardProps) {
  const Icon = ICON_MAP[addon.icon ?? ""] ?? Sparkles;
  const meta = getAddonMetadata(addon);
  const isComingSoon = addon.key === "fertility_premium";

  const isActive = addon.enabled;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-card p-6 transition-all ${
        isActive
          ? "border-primary/40 ring-1 ring-primary/20"
          : isComingSoon
            ? "border-border/40 opacity-90"
            : "border-border/60 hover:border-primary/40 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            TONE_CLASSES[meta.iconTone]
          }`}
        >
          <Icon className="h-6 w-6" />
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Activo
            </span>
          )}
          {isComingSoon && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              <Sparkles className="h-2.5 w-2.5" />
              Proximamente
            </span>
          )}
          {isActive && isAdmin && (
            <button
              type="button"
              onClick={onConfigure}
              title="Configurar modulo"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <h3 className="text-sm font-semibold leading-tight mb-1.5">
        {addon.name}
      </h3>

      {addon.description && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-3 min-h-[3rem]">
          {addon.description}
        </p>
      )}

      {meta.features.length > 0 && !isActive && (
        <ul className="space-y-1.5 border-t border-border/40 pt-3 mb-3 text-[11px] text-muted-foreground">
          {meta.features.map((bullet) => (
            <li key={bullet} className="flex items-start gap-1.5">
              <CheckCircle2
                className={`mt-[1px] h-3 w-3 shrink-0 ${
                  isComingSoon ? "text-violet-500" : "text-primary"
                }`}
              />
              <span className="leading-snug">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {isActive && addon.activated_at && (
        <p className="text-[11px] text-muted-foreground border-t border-border/40 pt-3 mb-3">
          Activado el{" "}
          {new Date(addon.activated_at).toLocaleDateString("es-PE", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}

      <div className="mt-auto pt-2">
        {isActive ? (
          <button
            type="button"
            onClick={onConfigure}
            disabled={!isAdmin}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            Configurar
          </button>
        ) : isComingSoon ? (
          <button
            type="button"
            disabled
            title="Disponible proximamente"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/40 px-3 py-2 text-xs font-medium text-muted-foreground/60 cursor-not-allowed"
          >
            <Lock className="h-3.5 w-3.5" />
            Notificame
          </button>
        ) : isAdmin ? (
          <button
            type="button"
            onClick={onActivate}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Activar
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Solo administradores pueden activar modulos"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/40 px-3 py-2 text-xs font-medium text-muted-foreground/60 cursor-not-allowed"
          >
            <Lock className="h-3.5 w-3.5" />
            Solo admins
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        {addon.is_premium && !isComingSoon && (
          <span>Plan {PLAN_LABELS[addon.min_plan] ?? addon.min_plan}+</span>
        )}
      </div>
    </div>
  );
}
