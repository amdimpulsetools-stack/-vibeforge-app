"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useLanguage } from "@/components/language-provider";
import { useFertilityAddon } from "@/hooks/use-fertility-addon";
import { toast } from "sonner";
import { Bell, Info, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import {
  AUDIENCES,
  AUDIENCE_HINTS,
  AUDIENCE_LABELS,
  LIVE_NOTIFICATION_EVENTS,
  readLiveNotificationSettings,
  resolveAudiences,
  type Audience,
  type LiveNotificationEvent,
  type LiveNotificationSettings,
} from "@/lib/live-notifications/catalog";

/**
 * Matriz evento × rol de la campanita (notificaciones en vivo).
 *
 * Mismo molde visual que la matriz evento × canal de correos/WhatsApp que ya
 * vive en esta pestaña: tarjeta `rounded-2xl`, cabecera con icono `primary`,
 * leyenda, fila de cabeceras de columna y una fila por evento con toggles.
 *
 * ── Persistencia sparse ───────────────────────────────────────────────
 * Se guarda en `organizations.settings.live_notifications` SÓLO lo que se
 * desvía del catálogo. Si el usuario deja un evento igual que sus defaults,
 * la clave se BORRA en vez de guardarse: así una org sin tocar nada tiene el
 * JSONB limpio, y cambiar un default en el catálogo alcanza a todas las
 * clínicas que no lo hayan personalizado — que es justo lo que se quiere de
 * un default.
 *
 * Un array vacío SÍ se guarda: "nadie recibe esto" es una decisión explícita
 * distinta de "no lo he configurado".
 */
export default function LiveNotificationsSection() {
  const { language } = useLanguage();
  const es = language === "es";
  const { organizationId, organization, isOrgAdmin, refetchOrg } = useOrganization();
  const { active: fertilityActive } = useFertilityAddon();

  const [settings, setSettings] = useState<LiveNotificationSettings>({});
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    setSettings(
      readLiveNotificationSettings(
        (organization as { settings?: unknown }).settings
      )
    );
    setLoaded(true);
  }, [organization]);

  // La asesora de fertilidad sólo tiene sentido como columna si el addon está
  // activo; en una clínica sin fertility nadie lleva ese flag.
  const columns = useMemo<Audience[]>(
    () => AUDIENCES.filter((a) => a !== "advisor" || fertilityActive),
    [fertilityActive]
  );

  const events = useMemo(
    () =>
      LIVE_NOTIFICATION_EVENTS.filter(
        // Un evento cuya única audiencia elegible es la asesora no pinta nada
        // en una org sin el addon. Hoy no hay ninguno, pero el catálogo crece.
        (e) => e.eligibleAudiences.some((a) => columns.includes(a))
      ),
    [columns]
  );

  const persist = async (next: LiveNotificationSettings, eventKey: string) => {
    if (!organizationId) return;
    const previous = settings;
    setSettings(next);
    setSavingKey(eventKey);

    // Merge sobre el settings completo: este bloque convive con
    // `restrict_doctor_patients` y demás, y un update entero lo borraría.
    const currentOrgSettings =
      ((organization as { settings?: Record<string, unknown> } | null)?.settings ??
        {}) as Record<string, unknown>;

    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        settings: { ...currentOrgSettings, live_notifications: next },
      } as never)
      .eq("id", organizationId);

    setSavingKey(null);

    if (error) {
      setSettings(previous);
      toast.error(es ? "Error al guardar" : "Error saving");
      return;
    }

    refetchOrg();
  };

  const toggle = (event: LiveNotificationEvent, audience: Audience) => {
    if (!isOrgAdmin || savingKey) return;

    const current = resolveAudiences(event, settings);
    const next = current.includes(audience)
      ? current.filter((a) => a !== audience)
      : [...current, audience];

    // ¿Volvió a coincidir con los defaults? Entonces se quita el override.
    const sameAsDefault =
      next.length === event.defaultAudiences.length &&
      next.every((a) => event.defaultAudiences.includes(a));

    const nextSettings: LiveNotificationSettings = { ...settings };
    if (sameAsDefault) {
      delete nextSettings[event.key];
    } else {
      nextSettings[event.key] = { audiences: next };
    }

    persist(nextSettings, event.key);
  };

  // Sección sólo para dirección: quién recibe qué es una decisión de gestión.
  if (!isOrgAdmin) return null;

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">
            {es ? "Notificaciones en vivo" : "Live notifications"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {es
              ? "Quién recibe cada aviso en la campanita del panel. No afecta a los correos ni a WhatsApp."
              : "Who gets each alert in the dashboard bell. Does not affect email or WhatsApp."}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <p>
          {es
            ? "Cada aviso llega solo a quien marques aquí. En los eventos de agenda, el doctor recibe únicamente los de SUS citas. Apagar todas las columnas desactiva el aviso para toda la clínica."
            : "Each alert only reaches the roles you check here. For scheduling events, doctors only get alerts for THEIR appointments. Turning every column off disables the alert for the whole clinic."}
        </p>
      </div>

      {/* A 390px cuatro columnas de toggles no caben junto al nombre del
          evento. El scroll se contiene AQUÍ (no en el body de la página) y el
          min-width garantiza que las celdas sigan alineadas con su cabecera. */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="min-w-[520px] space-y-1">
          <div className="flex items-center gap-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">{es ? "Evento" : "Event"}</span>
            {columns.map((audience) => (
              <span
                key={audience}
                className="w-20 flex flex-col items-center leading-tight text-center"
              >
                <span>{AUDIENCE_LABELS[audience][es ? "es" : "en"]}</span>
                <span className="text-[9px] font-normal normal-case text-muted-foreground/70">
                  {AUDIENCE_HINTS[audience][es ? "es" : "en"]}
                </span>
              </span>
            ))}
          </div>

          {events.map((event) => {
            const active = resolveAudiences(event, settings);
            const isOff = active.length === 0;
            const saving = savingKey === event.key;

            return (
              <div
                key={event.key}
                className={`group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 transition-all hover:border-primary/30 hover:bg-accent/50 ${
                  saving ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {event.label[es ? "es" : "en"]}
                    </span>
                    {event.doctorScope === "own" && (
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                        {es ? "doctor: solo sus citas" : "doctor: own only"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {event.description[es ? "es" : "en"]}
                  </p>
                  {isOff && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      {es
                        ? "Nadie recibe este aviso."
                        : "Nobody receives this alert."}
                    </p>
                  )}
                </div>

                {columns.map((audience) => {
                  const eligible = event.eligibleAudiences.includes(audience);
                  const on = active.includes(audience);
                  const label = AUDIENCE_LABELS[audience][es ? "es" : "en"];

                  return (
                    <div
                      key={audience}
                      className="w-20 flex justify-center shrink-0"
                    >
                      {eligible ? (
                        <button
                          type="button"
                          onClick={() => toggle(event, audience)}
                          disabled={saving}
                          // `p-2 -m-2`: el icono mide 24px, por debajo del
                          // mínimo táctil, y es LA interacción de la
                          // sección. El padding crea la hit-area de 40px y
                          // el margen negativo la descuenta del layout.
                          className="p-2 -m-2 disabled:cursor-not-allowed"
                          title={`${label} — ${
                            on ? (es ? "recibe" : "receives") : es ? "no recibe" : "does not receive"
                          }`}
                          aria-label={label}
                          aria-pressed={on}
                        >
                          {on ? (
                            <ToggleRight className="h-6 w-6 text-primary" />
                          ) : (
                            <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        <span
                          className="text-muted-foreground/30 text-xs select-none"
                          title={
                            es
                              ? "Este rol no aplica para este evento"
                              : "This role does not apply to this event"
                          }
                        >
                          —
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
