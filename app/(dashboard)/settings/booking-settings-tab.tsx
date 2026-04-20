"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import {
  Globe2,
  Loader2,
  Copy,
  ExternalLink,
  Check,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BookingSettings {
  id: string;
  is_enabled: boolean;
  max_advance_days: number;
  min_lead_hours: number;
  welcome_message: string | null;
  require_email: boolean;
  require_phone: boolean;
  require_dni: boolean;
  accent_color: string | null;
  portal_enabled: boolean;
  portal_allow_cancel: boolean;
  portal_allow_reschedule: boolean;
  portal_min_cancel_hours: number;
  portal_welcome_message: string | null;
}

export default function BookingSettingsTab() {
  const { organizationId, organization } = useOrganization();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);

  const slug = organization?.slug;
  const bookingUrl =
    typeof window !== "undefined" && slug
      ? `${window.location.origin}/book/${slug}`
      : "";
  const portalUrl =
    typeof window !== "undefined" && slug
      ? `${window.location.origin}/portal/${slug}`
      : "";

  useEffect(() => {
    if (!organizationId) return;

    async function fetchSettings() {
      const supabase = createClient();
      const { data } = await supabase
        .from("booking_settings")
        .select("id, is_enabled, max_advance_days, min_lead_hours, welcome_message, require_email, require_phone, require_dni, accent_color, portal_enabled, portal_allow_cancel, portal_allow_reschedule, portal_min_cancel_hours, portal_welcome_message")
        .eq("organization_id", organizationId)
        .single();

      if (data) {
        setSettings(data as BookingSettings);
      } else {
        // Create default settings
        const { data: created } = await supabase
          .from("booking_settings")
          .insert({ organization_id: organizationId })
          .select()
          .single();

        if (created) setSettings(created as BookingSettings);
      }
      setLoading(false);
    }

    fetchSettings();
  }, [organizationId]);

  const handleSave = async () => {
    if (!settings || !organizationId) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("booking_settings")
      .update({
        is_enabled: settings.is_enabled,
        max_advance_days: settings.max_advance_days,
        min_lead_hours: settings.min_lead_hours,
        welcome_message: settings.welcome_message,
        require_email: settings.require_email,
        require_phone: settings.require_phone,
        require_dni: settings.require_dni,
        accent_color: settings.accent_color || null,
        portal_enabled: settings.portal_enabled,
        portal_allow_cancel: settings.portal_allow_cancel,
        portal_allow_reschedule: settings.portal_allow_reschedule,
        portal_min_cancel_hours: settings.portal_min_cancel_hours,
        portal_welcome_message: settings.portal_welcome_message || null,
      })
      .eq("organization_id", organizationId);

    setSaving(false);

    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }

    toast.success("Configuración de reserva guardada");
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("URL copiada al portapapeles");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Enable/Disable */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {language === "es" ? "Reserva en línea" : "Online Booking"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {language === "es"
                ? "Permite que los pacientes agenden citas desde una página pública"
                : "Allow patients to book appointments from a public page"}
            </p>
          </div>
        </div>

        {/* Toggle */}
        <label className="flex items-center justify-between select-none cursor-pointer">
          <div>
            <p className="text-sm font-semibold">
              {language === "es" ? "Activar página de reserva" : "Enable booking page"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {language === "es"
                ? "Los pacientes podrán reservar citas sin necesidad de cuenta"
                : "Patients will be able to book appointments without an account"}
            </p>
          </div>
          <div className="relative ml-4 shrink-0">
            <div
              onClick={() =>
                setSettings({ ...settings, is_enabled: !settings.is_enabled })
              }
              className={cn(
                "h-6 w-11 rounded-full transition-colors cursor-pointer",
                settings.is_enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <div
                className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  settings.is_enabled && "translate-x-5"
                )}
              />
            </div>
          </div>
        </label>

        {/* Booking URL */}
        {settings.is_enabled && bookingUrl && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {language === "es" ? "URL de tu página de reserva:" : "Your booking page URL:"}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono text-foreground break-all">
                {bookingUrl}
              </code>
              <button
                type="button"
                onClick={copyUrl}
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Configuration */}
      {settings.is_enabled && (
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
          <h3 className="text-sm font-semibold">
            {language === "es" ? "Configuración" : "Configuration"}
          </h3>

          {/* Welcome message */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {language === "es" ? "Mensaje de bienvenida" : "Welcome message"}
            </label>
            <textarea
              value={settings.welcome_message || ""}
              onChange={(e) =>
                setSettings({ ...settings, welcome_message: e.target.value })
              }
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              placeholder="Agenda tu cita en línea de forma rápida y sencilla."
            />
          </div>

          {/* Max advance days & Min lead hours */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {language === "es"
                  ? "Máx. días de anticipación"
                  : "Max advance days"}
              </label>
              <select
                value={settings.max_advance_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_advance_days: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {[7, 14, 21, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} {language === "es" ? "días" : "days"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {language === "es"
                  ? "Mín. horas de anticipación"
                  : "Min lead hours"}
              </label>
              <select
                value={settings.min_lead_hours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    min_lead_hours: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {[1, 2, 4, 6, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h} {language === "es" ? "horas" : "hours"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Required fields */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              {language === "es" ? "Campos obligatorios" : "Required fields"}
            </h4>
            <div className="space-y-2">
              {[
                {
                  key: "require_email" as const,
                  label: language === "es" ? "Email del paciente" : "Patient email",
                },
                {
                  key: "require_phone" as const,
                  label: language === "es" ? "Teléfono del paciente" : "Patient phone",
                },
                {
                  key: "require_dni" as const,
                  label: language === "es" ? "Documento de identidad" : "ID document",
                },
              ].map((field) => (
                <label
                  key={field.key}
                  className="flex items-center justify-between select-none cursor-pointer rounded-lg border border-border/60 px-4 py-3"
                >
                  <span className="text-sm">{field.label}</span>
                  <div className="relative shrink-0">
                    <div
                      onClick={() =>
                        setSettings({
                          ...settings,
                          [field.key]: !settings[field.key],
                        })
                      }
                      className={cn(
                        "h-5 w-9 rounded-full transition-colors cursor-pointer",
                        settings[field.key] ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                          settings[field.key] && "translate-x-4"
                        )}
                      />
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Accent color */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {language === "es" ? "Color de acento (opcional)" : "Accent color (optional)"}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accent_color || "#10b981"}
                onChange={(e) =>
                  setSettings({ ...settings, accent_color: e.target.value })
                }
                className="h-9 w-9 cursor-pointer rounded-lg border border-input"
              />
              <input
                type="text"
                value={settings.accent_color || ""}
                onChange={(e) =>
                  setSettings({ ...settings, accent_color: e.target.value })
                }
                placeholder="#10b981 (emerald por defecto)"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {settings.accent_color && (
                <button
                  type="button"
                  onClick={() =>
                    setSettings({ ...settings, accent_color: null })
                  }
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Portal del Paciente */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <UserCircle className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {language === "es" ? "Portal del Paciente" : "Patient Portal"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {language === "es"
                ? "Permite que los pacientes accedan a su historial de citas"
                : "Allow patients to access their appointment history"}
            </p>
          </div>
        </div>

        <label className="flex items-center justify-between select-none cursor-pointer">
          <div>
            <p className="text-sm font-semibold">
              {language === "es" ? "Activar portal" : "Enable portal"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {language === "es"
                ? "Los pacientes podrán ver sus citas con un enlace mágico por email"
                : "Patients can view their appointments via magic link"}
            </p>
          </div>
          <div className="relative ml-4 shrink-0">
            <div
              onClick={() =>
                setSettings({ ...settings, portal_enabled: !settings.portal_enabled })
              }
              className={cn(
                "h-6 w-11 rounded-full transition-colors cursor-pointer",
                settings.portal_enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <div
                className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  settings.portal_enabled && "translate-x-5"
                )}
              />
            </div>
          </div>
        </label>

        {settings.portal_enabled && portalUrl && (
          <>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {language === "es" ? "URL del portal:" : "Portal URL:"}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono text-foreground break-all">
                  {portalUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(portalUrl);
                    setPortalCopied(true);
                    setTimeout(() => setPortalCopied(false), 2000);
                    toast.success("URL del portal copiada");
                  }}
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  {portalCopied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Portal config */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {language === "es" ? "Mensaje de bienvenida del portal" : "Portal welcome message"}
              </label>
              <textarea
                value={settings.portal_welcome_message || ""}
                onChange={(e) =>
                  setSettings({ ...settings, portal_welcome_message: e.target.value })
                }
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                placeholder="Bienvenido a tu portal de paciente..."
              />
            </div>

            <div className="space-y-2">
              {[
                {
                  key: "portal_allow_cancel" as const,
                  label: language === "es" ? "Permitir cancelar citas" : "Allow cancel",
                },
                {
                  key: "portal_allow_reschedule" as const,
                  label: language === "es" ? "Permitir reagendar citas" : "Allow reschedule",
                },
              ].map((field) => (
                <label
                  key={field.key}
                  className="flex items-center justify-between select-none cursor-pointer rounded-lg border border-border/60 px-4 py-3"
                >
                  <span className="text-sm">{field.label}</span>
                  <div className="relative shrink-0">
                    <div
                      onClick={() =>
                        setSettings({
                          ...settings,
                          [field.key]: !settings[field.key],
                        })
                      }
                      className={cn(
                        "h-5 w-9 rounded-full transition-colors cursor-pointer",
                        settings[field.key] ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                          settings[field.key] && "translate-x-4"
                        )}
                      />
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {language === "es"
                  ? "Mín. horas para cancelar"
                  : "Min hours to cancel"}
              </label>
              <select
                value={settings.portal_min_cancel_hours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    portal_min_cancel_hours: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {[2, 4, 6, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h} {language === "es" ? "horas" : "hours"}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving
          ? language === "es"
            ? "Guardando..."
            : "Saving..."
          : language === "es"
          ? "Guardar"
          : "Save"}
      </button>
    </div>
  );
}
