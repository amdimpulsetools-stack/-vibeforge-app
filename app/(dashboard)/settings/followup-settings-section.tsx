"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useOrganization } from "@/components/organization-provider";
import type { OrganizationFollowupSettings } from "@/types/followups";

interface FollowupSettingsResponse {
  /**
   * `false` = la org NO tiene fila en `organization_followup_settings`.
   * La mig 185 no hace backfill a propósito y los triggers leen con
   * `COALESCE(flag, false)`, así que "sin fila" ES el estado apagado —
   * no un "aún sin decidir" que luego caiga en los DEFAULT de la tabla.
   */
  configured: boolean;
  settings: OrganizationFollowupSettings;
}

const MIN_DELAY_DAYS = 1;
const MAX_DELAY_DAYS = 30;

/**
 * Settings → Agenda → "Seguimientos automáticos".
 *
 * Solo expone el automatismo que HOY existe: sesión de plan de tratamiento
 * marcada como perdida → seguimiento en Agenda → Seguimientos (mig 187).
 * Los otros dos campos de la mig 185 están declarados en la tabla pero
 * inertes en el código, así que no tienen control aquí.
 */
export default function FollowupSettingsSection({
  language,
}: {
  language: "es" | "en";
}) {
  const es = language === "es";
  const { organizationId } = useOrganization();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [delayDays, setDelayDays] = useState(3);
  // Texto crudo del input: permite borrarlo para teclear otro número sin
  // que un "" se convierta en 0 y dispare el error de rango.
  const [delayText, setDelayText] = useState("3");

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/organization-followup-settings?org_id=${encodeURIComponent(organizationId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("fetch_failed");
        const json = (await res.json()) as FollowupSettingsResponse;
        if (cancelled) return;
        setConfigured(json.configured);
        setEnabled(json.settings.missed_session_followup);
        setDelayDays(json.settings.missed_session_delay_days);
        setDelayText(String(json.settings.missed_session_delay_days));
      } catch {
        if (!cancelled) {
          toast.error(
            es
              ? "No se pudieron cargar los ajustes de seguimientos"
              : "Could not load follow-up settings"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, es]);

  const save = async () => {
    if (!organizationId) return;
    if (delayDays < MIN_DELAY_DAYS || delayDays > MAX_DELAY_DAYS) {
      toast.error(
        es
          ? `Los días de espera deben estar entre ${MIN_DELAY_DAYS} y ${MAX_DELAY_DAYS}`
          : `Waiting days must be between ${MIN_DELAY_DAYS} and ${MAX_DELAY_DAYS}`
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/organization-followup-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          missed_session_followup: enabled,
          missed_session_delay_days: delayDays,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "save_failed");
      }
      setConfigured(true);
      toast.success(es ? "Ajustes guardados" : "Settings saved");
    } catch (err) {
      const forbidden = err instanceof Error && err.message === "forbidden";
      toast.error(
        forbidden
          ? es
            ? "Solo el propietario o un administrador puede cambiar esto"
            : "Only the owner or an admin can change this"
          : es
            ? "No se pudieron guardar los ajustes"
            : "Could not save settings"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {es ? "Seguimientos automáticos" : "Automatic follow-ups"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {es
              ? "Qué situaciones crean solas un seguimiento en la bandeja."
              : "Which situations create a follow-up in the tray on their own."}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-4 rounded-xl border border-border/50 p-4">
            <label className="flex items-start justify-between gap-4 select-none cursor-pointer">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {es
                    ? "Crear seguimiento cuando se pierde una sesión de plan de tratamiento"
                    : "Create a follow-up when a treatment plan session is missed"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {es
                    ? "Al marcar una sesión como perdida se crea un seguimiento para volver a coordinarla con el paciente."
                    : "Marking a session as missed creates a follow-up to reschedule it with the patient."}
                </p>
              </div>
              <div className="relative ml-4 shrink-0">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </div>
            </label>

            {enabled && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border/40 pt-4">
                <label className="text-sm" htmlFor="missed-session-delay">
                  {es ? "Días de espera" : "Waiting days"}
                </label>
                <input
                  id="missed-session-delay"
                  type="number"
                  min={MIN_DELAY_DAYS}
                  max={MAX_DELAY_DAYS}
                  value={delayText}
                  onChange={(e) => {
                    setDelayText(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isInteger(n)) setDelayDays(n);
                  }}
                  onBlur={() => setDelayText(String(delayDays))}
                  className="w-20 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
                <p className="text-xs text-muted-foreground">
                  {es
                    ? `Entre ${MIN_DELAY_DAYS} y ${MAX_DELAY_DAYS}. El seguimiento vence ese número de días después de la sesión perdida.`
                    : `Between ${MIN_DELAY_DAYS} and ${MAX_DELAY_DAYS}. The follow-up is due that many days after the missed session.`}
                </p>
              </div>
            )}
          </div>

          {!configured && (
            <p className="rounded-xl border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground">
              {es ? (
                <>
                  Ahora mismo está apagado para tu clínica. Al activarlo, las
                  sesiones de plan de tratamiento marcadas como perdidas
                  crearán un seguimiento automático en{" "}
                  <Link
                    href="/scheduler/follow-ups"
                    className="font-medium text-primary hover:underline"
                  >
                    Agenda → Seguimientos
                  </Link>
                  .
                </>
              ) : (
                <>
                  It is currently off for your clinic. Once you turn it on,
                  treatment plan sessions marked as missed will create an
                  automatic follow-up in{" "}
                  <Link
                    href="/scheduler/follow-ups"
                    className="font-medium text-primary hover:underline"
                  >
                    Scheduler → Follow-ups
                  </Link>
                  .
                </>
              )}
            </p>
          )}

          <div className="flex justify-end border-t border-border/40 pt-4">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {es ? "Guardar" : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
