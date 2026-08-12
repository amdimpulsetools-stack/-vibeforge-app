"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useOrgAddons, type Addon } from "@/hooks/use-org-addons";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrganization } from "@/components/organization-provider";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatPen, planLabel } from "@/lib/billing/module-pricing";
import {
  Loader2,
  Sparkles,
  Star,
  Lock,
  ArrowRight,
  AlertTriangle,
  CreditCard,
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

/**
 * Campos de facturación de módulos que /api/addons agrega a cada fila
 * del catálogo (mig 210). No están en el tipo `Addon` del hook porque
 * ese hook lo consumen ~10 pantallas que no saben de precios; acá se
 * ensancha localmente.
 */
type CatalogAddon = Addon & {
  monthly_price?: number | null;
  included_from_plan?: string | null;
  included_in_plan?: boolean;
  requires_payment?: boolean;
  org_plan_slug?: string | null;
};

/** Un módulo de pago que este plan NO incluye → activarlo cuesta. */
function isPaidModule(addon: Addon): boolean {
  const a = addon as CatalogAddon;
  return Boolean(a.requires_payment && a.monthly_price);
}

/** Un módulo con precio que este plan SÍ cubre → activación gratis. */
function isIncludedPaidModule(addon: Addon): boolean {
  const a = addon as CatalogAddon;
  return Boolean(a.monthly_price && a.included_in_plan);
}

function modulePrice(addon: Addon): number | null {
  return (addon as CatalogAddon).monthly_price ?? null;
}

interface PricingPreview {
  addon_name: string;
  monthly_price: number | null;
  requires_payment: boolean;
  plan_name: string | null;
  has_payment_method: boolean;
  current_monthly_total: number | null;
  new_monthly_total: number | null;
}

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
  const { addons, loading, activateAddon, deactivateAddon, refetch } =
    useOrgAddons();
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
  const [paidTarget, setPaidTarget] = useState<Addon | null>(null);
  const [configTarget, setConfigTarget] = useState<Addon | null>(null);

  /**
   * Baja de un módulo cobrado: el endpoint cancela la fila de
   * plan_addons y baja el monto del preapproval antes de apagar el
   * módulo. Se usa en vez de `deactivateAddon` del hook para poder
   * mostrar el total nuevo y el error de MP (el hook solo devuelve
   * boolean).
   */
  const deactivateModule = useCallback(
    async (addon: Addon): Promise<boolean> => {
      if (!isPaidModule(addon)) {
        return deactivateAddon(addon.key);
      }
      const res = await fetch(
        `/api/addons/${encodeURIComponent(addon.key)}/deactivate`,
        { method: "POST" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "No pudimos desactivar el modulo");
        return false;
      }
      refetch();
      const newTotal = body?.billing?.new_monthly_total;
      if (typeof newTotal === "number") {
        toast.success(
          `Cobro dado de baja. Tu suscripcion pasa a ${formatPen(newTotal)} al mes desde el proximo ciclo.`,
        );
      }
      return true;
    },
    [deactivateAddon, refetch],
  );

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
    // Los módulos con cobro pasan por el diálogo de confirmación de
    // precio ("tu suscripción pasará de S/X a S/Y") antes de tocar MP.
    if (isPaidModule(addon)) {
      setPaidTarget(addon);
      return;
    }
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

      {paidTarget && (
        <ModulePaidActivateDialog
          open={!!paidTarget}
          onOpenChange={(open) => {
            if (!open) setPaidTarget(null);
          }}
          addon={paidTarget}
          activate={activateAddon}
          onActivated={refetch}
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
          onDeactivate={async () => deactivateModule(configTarget)}
        />
      )}
    </>
  );
}

/**
 * Confirmación de cobro para módulos de pago.
 *
 * El precio y los totales NO se calculan acá: se piden a
 * /api/addons/[key]/pricing, que los resuelve desde el catálogo y la
 * suscripción real. La UI solo los muestra — activar vuelve a resolver
 * el precio en el servidor, así que nada de lo que pase en el navegador
 * cambia lo que se cobra.
 */
function ModulePaidActivateDialog({
  open,
  onOpenChange,
  addon,
  activate,
  onActivated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  addon: Addon;
  activate: ReturnType<typeof useOrgAddons>["activateAddon"];
  onActivated: () => void;
}) {
  const [pricing, setPricing] = useState<PricingPreview | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPrice(true);
    setError(null);
    fetch(`/api/addons/${encodeURIComponent(addon.key)}/pricing`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setPricing(data);
        setLoadingPrice(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingPrice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, addon.key]);

  const price = pricing?.monthly_price ?? modulePrice(addon);
  const noPaymentMethod = pricing !== null && !pricing.has_payment_method;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    const result = await activate(addon.key);
    setSubmitting(false);

    if (result.ok) {
      toast.success(`Modulo ${addon.name} activado`);
      onActivated();
      onOpenChange(false);
      return;
    }
    setError(result.error || "No pudimos activar el modulo");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold">
              Activar {addon.name}
              {price ? ` — ${formatPen(price)}/mes` : ""}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              {addon.description ??
                "Este modulo se cobra dentro de tu suscripcion mensual."}
            </DialogDescription>
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-4">
          {loadingPrice ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Calculando tu nuevo total...
            </div>
          ) : pricing?.current_monthly_total != null &&
            pricing?.new_monthly_total != null ? (
            <>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Tu suscripcion mensual
              </p>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground line-through">
                  {formatPen(pricing.current_monthly_total)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-lg font-semibold text-foreground">
                  {formatPen(pricing.new_monthly_total)}
                </span>
                <span className="text-[11px] text-muted-foreground">al mes</span>
              </div>
              {pricing.plan_name && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Plan {pricing.plan_name} + {addon.name}{" "}
                  {price ? formatPen(price) : ""}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Este modulo cuesta {price ? formatPen(price) : ""} al mes y se
              suma a tu suscripcion.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          El cambio de monto se aplica en tu proximo ciclo de facturacion —
          Mercado Pago no cobra ni devuelve la parte proporcional del ciclo en
          curso. Puedes desactivar el modulo cuando quieras y el cobro baja en
          el siguiente ciclo.
        </p>

        {noPaymentMethod && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Activa tu suscripcion primero</p>
              <p className="leading-relaxed">
                Todavia no tienes un metodo de pago activo, asi que no podemos
                sumar este modulo a tu cobro mensual.{" "}
                <Link href="/account" className="underline font-medium">
                  Ir a mi suscripcion
                </Link>
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || loadingPrice || noPaymentMethod}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Activando
              </>
            ) : (
              `Confirmar y activar${price ? ` — ${formatPen(price)}/mes` : ""}`
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
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
  const price = modulePrice(addon);
  const paid = isPaidModule(addon);
  const includedPaid = isIncludedPaidModule(addon);

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
          {/* Precio del módulo (mig 210). El precio ES la información
              útil: "Premium" no le dice a nadie cuánto cuesta. */}
          {!isActive && paid && price !== null && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
              {formatPen(price)}/mes
            </span>
          )}
          {!isActive && includedPaid && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Incluido en tu plan
            </span>
          )}
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
            {paid && price !== null ? (
              <>
                <CreditCard className="h-3.5 w-3.5" />
                {`Activar — ${formatPen(price)}/mes`}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Activar
              </>
            )}
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
        {/* Antes decía "Plan Enterprise+" / "Plan starter+": slugs
            internos que no existen de cara al cliente (los planes se
            llaman Independiente, Centro Médico y Clínica). Para los
            módulos con precio propio el requisito de plan es ruido —
            el precio ya está arriba —, así que solo se muestra en los
            addons incluidos en plan. */}
        {addon.is_premium && !isComingSoon && !paid && !includedPaid && (
          <span>Requiere plan {planLabel(addon.min_plan)} o superior</span>
        )}
        {!isActive && includedPaid && (
          <span>
            Sin costo adicional en tu plan {planLabel((addon as CatalogAddon).org_plan_slug)}
          </span>
        )}
      </div>
    </div>
  );
}
