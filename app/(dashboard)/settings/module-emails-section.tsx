"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useLanguage } from "@/components/language-provider";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  Mail,
  Receipt,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  MODULE_EMAIL_SETTINGS_KEY,
  adoptionTipsEnabled,
  readModuleEmailSettings,
} from "@/lib/module-email-settings";

/**
 * Correos de los módulos de pago — solo lo que la org tiene contratado.
 *
 * La sección aparece igual que la pestaña Fiscal aparece solo con
 * facturación conectada: preguntando por el addon (useOrgAddons). Una
 * clínica sin Caja no tiene por qué leer tres interruptores sobre arqueos
 * que nunca va a hacer.
 *
 * ── Dónde persiste cada cosa ─────────────────────────────────────────
 * · Los tres de Caja → `cash_settings` (mig 220), que es la fila que ya
 *   gobierna el módulo. Si esa fila NO existe, el módulo está inerte y
 *   aquí no se pinta ningún toggle: crear la fila desde Ajustes activaría
 *   Caja por la puerta de atrás, sin que nadie haya decidido cómo trabaja.
 *   En su lugar se manda a configurarla en /caja.
 * · Los consejos de uso → `organizations.settings.module_emails`, porque
 *   hablan de todos los módulos y no pueden colgar de cash_settings.
 *
 * TODOS NACEN ENCENDIDOS. Y los correos transaccionales —bienvenida al
 * activar, confirmación de baja— NO llevan interruptor: son el
 * comprobante de una decisión, como un recibo. Eso se dice en la UI.
 */

const PAID_MODULE_KEYS = ["caja", "almacen", "captacion"];

interface CashNotifySettings {
  notify_daily_exceptions: boolean;
  notify_stale_shift: boolean;
  notify_weekly_digest: boolean;
}

type CashColumn = keyof CashNotifySettings;

export default function ModuleEmailsSection() {
  const { language } = useLanguage();
  const es = language === "es";
  const { organizationId, organization, isOrgAdmin, refetchOrg } = useOrganization();
  const { hasAddon, hasAnyAddon, loading: addonsLoading } = useOrgAddons();

  const hasCaja = hasAddon("caja");
  const hasAnyPaidModule = hasAnyAddon(PAID_MODULE_KEYS);

  const [cash, setCash] = useState<CashNotifySettings | null>(null);
  const [cashLoaded, setCashLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Consejos de uso: esparso en el JSONB de la org, ausencia = encendido.
  const tipsOn = adoptionTipsEnabled(
    (organization as { settings?: unknown } | null)?.settings
  );

  useEffect(() => {
    if (!organizationId || !hasCaja) {
      setCashLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("cash_settings")
        .select("notify_daily_exceptions, notify_stale_shift, notify_weekly_digest")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (cancelled) return;
      // null = todavía no hay fila: el módulo está activo pero sin
      // configurar, que es un estado real y distinto de "sin Caja".
      setCash(
        data
          ? {
              notify_daily_exceptions: data.notify_daily_exceptions !== false,
              notify_stale_shift: data.notify_stale_shift !== false,
              notify_weekly_digest: data.notify_weekly_digest !== false,
            }
          : null
      );
      setCashLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, hasCaja]);

  const toggleCash = useCallback(
    async (column: CashColumn) => {
      if (!organizationId || !cash || savingKey) return;
      const next = !cash[column];
      const previous = cash;

      setCash({ ...cash, [column]: next });
      setSavingKey(column);

      const supabase = createClient();
      const { error } = await supabase
        .from("cash_settings")
        .update({ [column]: next } as never)
        .eq("organization_id", organizationId);

      setSavingKey(null);
      if (error) {
        setCash(previous);
        toast.error(es ? "Error al guardar" : "Error saving");
      }
    },
    [organizationId, cash, savingKey, es]
  );

  const toggleTips = useCallback(async () => {
    if (!organizationId || savingKey) return;
    const next = !tipsOn;
    setSavingKey("adoption_tips");

    // Merge sobre el settings completo: este bloque convive con
    // live_notifications y demás, y un update entero los borraría.
    const currentOrgSettings =
      ((organization as { settings?: Record<string, unknown> } | null)?.settings ??
        {}) as Record<string, unknown>;
    const block = { ...readModuleEmailSettings(currentOrgSettings) };

    // Esparso: encendido es la ausencia de la clave, no `true` guardado.
    if (next) delete block.adoption_tips;
    else block.adoption_tips = false;

    const nextSettings = { ...currentOrgSettings } as Record<string, unknown>;
    if (Object.keys(block).length === 0) delete nextSettings[MODULE_EMAIL_SETTINGS_KEY];
    else nextSettings[MODULE_EMAIL_SETTINGS_KEY] = block;

    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({ settings: nextSettings } as never)
      .eq("id", organizationId);

    setSavingKey(null);
    if (error) {
      toast.error(es ? "Error al guardar" : "Error saving");
      return;
    }
    refetchOrg();
  }, [organizationId, organization, savingKey, tipsOn, refetchOrg, es]);

  // Decisión de gestión, como el resto de esta pestaña.
  if (!isOrgAdmin) return null;
  // Sin módulos de pago no hay nada que gobernar aquí.
  if (!addonsLoading && !hasAnyPaidModule) return null;

  if (addonsLoading || !cashLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Mail className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">
            {es ? "Correos de tus módulos" : "Module emails"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {es
              ? "Los avisos por correo de los módulos que tienes activos. Solo aparecen aquí los módulos contratados."
              : "Email notices for the modules you have active. Only active modules show up here."}
          </p>
        </div>
      </div>

      {/* La nota que evita el ticket de "¿por qué recibí este correo si
          apagué todo?": lo transaccional no se apaga. */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Receipt className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p>
          {es
            ? "El correo de bienvenida al activar un módulo y el de confirmación al darlo de baja no se pueden apagar: son el comprobante de una decisión tuya, como un recibo. Aquí solo gobiernas los avisos periódicos."
            : "The welcome email when you activate a module and the confirmation when you cancel it can't be turned off: they're the receipt of a decision you made. This section only governs recurring notices."}
        </p>
      </div>

      {hasCaja && (
        <div className="space-y-1">
          <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {es ? "Caja" : "Cash register"}
          </p>

          {cash === null ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
              <p className="font-medium">
                {es
                  ? "Todavía no configuraste tu caja."
                  : "You haven't configured your cash register yet."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {es
                  ? "Hasta que guardes esa configuración el módulo no vincula nada, así que tampoco hay avisos que gobernar."
                  : "Until you save that configuration the module links nothing, so there are no notices to govern yet."}
              </p>
              <Link
                href="/caja"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {es ? "Configurar la caja" : "Configure it"}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <>
              <ToggleRow
                title={es ? "Parte del día" : "Daily report"}
                description={
                  es
                    ? "Resumen del cierre al terminar la jornada. Solo llega si hubo algo que contar: los días que todo cuadra no recibes nada."
                    : "End-of-day summary. Only sent when there's something to report."
                }
                on={cash.notify_daily_exceptions}
                saving={savingKey === "notify_daily_exceptions"}
                disabled={Boolean(savingKey)}
                onToggle={() => toggleCash("notify_daily_exceptions")}
              />
              <ToggleRow
                title={es ? "Aviso de caja sin cerrar" : "Stale shift alert"}
                description={
                  es
                    ? "Cuando un turno lleva dos días abierto. No apaga el recordatorio que le llega a quien lo dejó abierto: eso es su tarea pendiente, no un informe para ti."
                    : "When a shift has been open for two days. Doesn't silence the reminder to whoever left it open."
                }
                on={cash.notify_stale_shift}
                saving={savingKey === "notify_stale_shift"}
                disabled={Boolean(savingKey)}
                onToggle={() => toggleCash("notify_stale_shift")}
              />
              <ToggleRow
                title={es ? "Resumen semanal" : "Weekly digest"}
                description={
                  es
                    ? "Los lunes, cómo cerró la semana. Este llega cuadre o no cuadre."
                    : "Mondays: how the week closed. Sent whether it balanced or not."
                }
                on={cash.notify_weekly_digest}
                saving={savingKey === "notify_weekly_digest"}
                disabled={Boolean(savingKey)}
                onToggle={() => toggleCash("notify_weekly_digest")}
              />
            </>
          )}
        </div>
      )}

      <div className="space-y-1">
        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {es ? "Todos los módulos" : "All modules"}
        </p>
        <ToggleRow
          title={es ? "Consejos de uso" : "Usage tips"}
          description={
            es
              ? "Un correo puntual si vemos que un módulo que estás pagando no se está usando, con la forma más corta de sacarle partido. Nunca más de dos por módulo."
              : "An occasional email when a module you're paying for isn't being used. Never more than two per module."
          }
          on={tipsOn}
          saving={savingKey === "adoption_tips"}
          disabled={Boolean(savingKey)}
          onToggle={toggleTips}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  on,
  saving,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  on: boolean;
  saving: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 transition-all hover:border-primary/30 hover:bg-accent/50 ${
        saving ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{title}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        // `p-2 -m-2`: el icono mide 24px, por debajo del mínimo táctil, y
        // es LA interacción de la fila. El padding crea la hit-area de
        // 40px y el margen negativo la descuenta del layout.
        className="p-2 -m-2 shrink-0 disabled:cursor-not-allowed"
        aria-label={title}
        aria-pressed={on}
      >
        {saving ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : on ? (
          <ToggleRight className="h-6 w-6 text-primary" />
        ) : (
          <ToggleLeft className="h-6 w-6 text-muted-foreground" />
        )}
      </button>
    </div>
  );
}
