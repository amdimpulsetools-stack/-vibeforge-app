"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { usePlan } from "@/hooks/use-plan";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { toast } from "sonner";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/rich-text-editor";
import { substituteVariables } from "@/lib/sanitize-email-html";
import {
  Mail,
  Settings2,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Lock,
  Eye,
  Send,
  Palette,
  Camera,
  X,
  Copy,
  Clock,
  ToggleLeft,
  ToggleRight,
  FileText,
  Users,
  CreditCard,
  UserCheck,
  Megaphone,
  CalendarCheck,
  MessageCircle,
  RefreshCw,
  HeartHandshake,
  AlertTriangle,
  Info,
  Smartphone,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface EmailSettings {
  id?: string;
  organization_id: string;
  sender_name: string | null;
  sender_email: string | null;
  reply_to_email: string | null;
  brand_color: string;
  email_logo_url: string | null;
  notification_emails: string | null;
}

interface EmailTemplate {
  id: string;
  organization_id: string;
  slug: string;
  category: string;
  name: string;
  description: string | null;
  subject: string;
  body: string;
  body_html: string | null;
  is_enabled: boolean;
  wa_enabled: boolean;
  channel: "email" | "whatsapp" | "both";
  timing_value: number | null;
  timing_unit: string | null;
  min_plan_slug: string;
  sort_order: number;
}

type TemplateCategory = "appointments" | "patients" | "payments" | "team" | "marketing" | "fertility";

const CATEGORIES: TemplateCategory[] = ["appointments", "patients", "payments", "team", "marketing", "fertility"];

const CATEGORY_ICONS: Record<TemplateCategory, React.ReactNode> = {
  appointments: <CalendarCheck className="h-4 w-4" />,
  patients: <UserCheck className="h-4 w-4" />,
  payments: <CreditCard className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  marketing: <Megaphone className="h-4 w-4" />,
  fertility: <HeartHandshake className="h-4 w-4" />,
};

const PLAN_HIERARCHY: Record<string, number> = {
  starter: 0,
  professional: 1,
  enterprise: 2,
};

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  starter: "Independiente",
  professional: "Centro Médico",
  enterprise: "Clínica",
};

const TEMPLATE_VARIABLES = [
  { key: "{{paciente_nombre}}", label: "Nombre del paciente" },
  { key: "{{doctor_nombre}}", label: "Nombre del doctor" },
  { key: "{{fecha_cita}}", label: "Fecha de la cita" },
  { key: "{{hora_cita}}", label: "Hora de la cita" },
  { key: "{{consultorio}}", label: "Consultorio" },
  { key: "{{servicio}}", label: "Servicio" },
  { key: "{{instrucciones_servicio}}", label: "Instrucciones del servicio" },
  { key: "{{monto_cita}}", label: "Monto de la cita" },
  { key: "{{clinica_nombre}}", label: "Nombre de la clínica" },
  { key: "{{clinica_telefono}}", label: "Teléfono de la clínica" },
  { key: "{{direccion_clinica}}", label: "Dirección de la clínica" },
  { key: "{{link_ubicacion}}", label: "Link de ubicación (Google Maps)" },
  { key: "{{link_cancelar}}", label: "Link para cancelar" },
  { key: "{{link_reagendar}}", label: "Link para reagendar" },
  { key: "{{link_reunion}}", label: "Link de reunión (Zoom)" },
  { key: "{{monto_pagado}}", label: "Monto pagado" },
  { key: "{{tratamiento}}", label: "Tratamiento (presupuestos)" },
  { key: "{{vigencia_dias}}", label: "Vigencia del presupuesto en días" },
];

const PREVIEW_DATA: Record<string, string> = {
  "{{paciente_nombre}}": "María García",
  "{{doctor_nombre}}": "Dr. Carlos López",
  "{{fecha_cita}}": "15 de marzo, 2026",
  "{{hora_cita}}": "10:30 AM",
  "{{consultorio}}": "Consultorio 1",
  "{{servicio}}": "Consulta general",
  "{{instrucciones_servicio}}": "Venir en ayunas 8 horas antes del examen",
  "{{monto_cita}}": "S/. 150.00",
  "{{clinica_nombre}}": "Mi Clínica",
  "{{clinica_telefono}}": "+51 999 000 000",
  "{{direccion_clinica}}": "Av. Javier Prado 123, San Isidro, Lima",
  "{{link_ubicacion}}": "https://maps.google.com/?q=-12.09,-77.02",
  "{{link_cancelar}}": "https://app.ejemplo.com/cancelar/abc123",
  "{{link_reagendar}}": "https://app.ejemplo.com/reagendar/abc123",
  "{{link_reunion}}": "https://zoom.us/j/1234567890",
  "{{monto_pagado}}": "S/. 150.00",
  "{{tratamiento}}": "Fecundación in Vitro (FIV)",
  "{{vigencia_dias}}": "90",
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function EmailSettingsTab() {
  const { t } = useLanguage();
  const { organizationId, organization, isOrgAdmin } = useOrganization();
  const { plan } = usePlan();
  const { hasAnyAddon } = useOrgAddons();
  const fertilityActive = hasAnyAddon(["fertility_basic", "fertility_premium"]);

  const router = useRouter();
  const searchParams = useSearchParams();
  // Cross-tab navigation: switch to "WA Business" (whatsapp-api) preserving
  // other query params. The parent settings page reads ?tab= to render the
  // active tab, so replacing the URL is enough to move the user there.
  const goToTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  // Set of email_template.id that HAVE an APPROVED WhatsApp template linked via
  // whatsapp_templates.local_template_id — same criterion the send route and
  // the reminders cron use to actually fire a WA message. If an event isn't in
  // this set, its WhatsApp channel cannot work, so the WA toggle is disabled.
  const [waApprovedByEmailId, setWaApprovedByEmailId] = useState<Set<string>>(new Set());
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [seedingTemplates, setSeedingTemplates] = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();

    const [settingsRes, templatesRes, waTemplatesRes] = await Promise.all([
      supabase
        .from("email_settings")
        .select("id, organization_id, sender_name, sender_email, reply_to_email, brand_color, email_logo_url, notification_emails")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("email_templates")
        .select("id, organization_id, slug, category, name, description, subject, body, body_html, is_enabled, wa_enabled, channel, timing_value, timing_unit, min_plan_slug, sort_order")
        .eq("organization_id", organizationId)
        .order("category")
        .order("sort_order"),
      // Which events have an APPROVED + linked WhatsApp template. Only these
      // can actually deliver on WhatsApp (send route + cron both require
      // status=APPROVED and local_template_id === email_template.id).
      supabase
        .from("whatsapp_templates")
        .select("local_template_id, status")
        .eq("organization_id", organizationId)
        .eq("status", "APPROVED")
        .not("local_template_id", "is", null),
    ]);

    if (waTemplatesRes.data) {
      setWaApprovedByEmailId(
        new Set(
          (waTemplatesRes.data as { local_template_id: string | null }[])
            .map((w) => w.local_template_id)
            .filter((id): id is string => !!id)
        )
      );
    }

    if (settingsRes.data) {
      setSettings(settingsRes.data as EmailSettings);
    } else {
      // No email_settings row exists yet — create it in DB
      const defaultSettings: EmailSettings = {
        organization_id: organizationId,
        sender_name: organization?.name ?? null,
        sender_email: null,
        reply_to_email: null,
        brand_color: "#10b981",
        email_logo_url: organization?.logo_url ?? null,
        notification_emails: null,
      };

      const { data: created } = await supabase
        .from("email_settings")
        .upsert(
          {
            organization_id: organizationId,
            sender_name: defaultSettings.sender_name,
            brand_color: defaultSettings.brand_color,
            email_logo_url: defaultSettings.email_logo_url,
          },
          { onConflict: "organization_id" }
        )
        .select()
        .maybeSingle();

      setSettings(created ? (created as EmailSettings) : defaultSettings);
    }

    if (templatesRes.data) {
      setTemplates(templatesRes.data as EmailTemplate[]);
    }

    setLoading(false);
  }, [organizationId, organization]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Check if template is locked by plan ────────────────────────────────────

  const isTemplateLocked = (template: EmailTemplate): boolean => {
    if (!plan) return false;
    const currentLevel = PLAN_HIERARCHY[plan.slug] ?? 0;
    const requiredLevel = PLAN_HIERARCHY[template.min_plan_slug] ?? 0;
    return currentLevel < requiredLevel;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        isLocked={isTemplateLocked(editingTemplate)}
        emailSettings={settings}
        clinicName={organization?.name ?? null}
        onBack={() => setEditingTemplate(null)}
        onSave={(updated) => {
          setTemplates((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t))
          );
          setEditingTemplate(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* General settings */}
      <GeneralSettings
        settings={settings}
        setSettings={setSettings}
        saving={savingSettings}
        setSaving={setSavingSettings}
        isAdmin={isOrgAdmin}
        organizationId={organizationId}
        orgLogoUrl={organization?.logo_url ?? null}
        onRefetch={fetchData}
      />

      {/* Notifications matrix (event × channel) */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">{t("email.notifications_title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("email.notifications_description")}
            </p>
          </div>
        </div>

        {/* Honesty legend — the truth we verified in /api/notifications/send
            and the reminders cron: is_enabled=false skips the WHOLE event
            (both channels), so the email toggle is the event master switch. */}
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p>{t("email.event_active_tip")}</p>
        </div>

        {(() => {
          const HIDDEN_SLUGS = new Set<string>([
            "team_new_appointment",
            "team_cancellation",
            "patient_post_consultation",
            "patient_review_request",
            "marketing_campaign",
            "payment_pending",
            ...(fertilityActive
              ? []
              : [
                  "fertility_first_consultation_lapse",
                  "fertility_second_consultation_lapse",
                  "fertility_budget_pending_acceptance",
                  "fertility_budget_to_patient",
                ]),
          ]);
          const hasAny = templates.some((tpl) => !HIDDEN_SLUGS.has(tpl.slug));
          if (hasAny) return null;
          return (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
              <Mail className="h-8 w-8 text-muted-foreground/60" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("email.no_templates_title")}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {t("email.no_templates_description")}
                </p>
              </div>
              {isOrgAdmin && (
                <button
                  type="button"
                  onClick={async () => {
                    setSeedingTemplates(true);
                    try {
                      const res = await fetch("/api/email-templates/seed", {
                        method: "POST",
                      });
                      const json = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        toast.error(json.error ?? t("email.seed_error"));
                        return;
                      }
                      toast.success(t("email.seed_success"));
                      await fetchData();
                    } catch (err) {
                      const msg =
                        err instanceof Error ? err.message : "Error";
                      toast.error(msg);
                    } finally {
                      setSeedingTemplates(false);
                    }
                  }}
                  disabled={seedingTemplates}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {seedingTemplates ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("email.seed_button")}
                </button>
              )}
            </div>
          );
        })()}

        {/* Column headers — the two channel columns of the matrix. Widths must
            match the per-row cells in TemplateRow. */}
        {templates.length > 0 && (
          <div className="flex items-center gap-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">{t("email.col_event")}</span>
            <span className="w-16 flex flex-col items-center leading-tight">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{t("email.col_email")}</span>
              <span className="text-[9px] font-normal normal-case text-muted-foreground/70">{t("email.col_email_hint")}</span>
            </span>
            <span className="w-36 flex items-center justify-center gap-1"><MessageCircle className="h-3 w-3" />{t("email.col_whatsapp")}</span>
            <span className="w-16" />
          </div>
        )}

        {CATEGORIES.map((category) => {
          // Hide unimplemented templates
          const HIDDEN_SLUGS = new Set<string>([
            "team_new_appointment",
            "team_cancellation",
            "patient_post_consultation",
            "patient_review_request",
            "marketing_campaign",
            "payment_pending",
            ...(fertilityActive
              ? []
              : [
                  "fertility_first_consultation_lapse",
                  "fertility_second_consultation_lapse",
                  "fertility_budget_pending_acceptance",
                  "fertility_budget_to_patient",
                ]),
          ]);
          const categoryTemplates = templates.filter(
            (t) => t.category === category && !HIDDEN_SLUGS.has(t.slug)
          );
          if (categoryTemplates.length === 0) return null;

          return (
            <TemplateCategoryGroup
              key={category}
              category={category}
              templates={categoryTemplates}
              waApprovedByEmailId={waApprovedByEmailId}
              onConfigureWa={() => goToTab("whatsapp-api")}
              isTemplateLocked={isTemplateLocked}
              isAdmin={isOrgAdmin}
              onEdit={setEditingTemplate}
              onToggle={async (template) => {
                if (!isOrgAdmin || isTemplateLocked(template)) return;
                const supabase = createClient();
                const { error } = await supabase
                  .from("email_templates")
                  .update({ is_enabled: !template.is_enabled })
                  .eq("id", template.id);
                if (error) {
                  toast.error(t("email.save_template_error"));
                  return;
                }
                setTemplates((prev) =>
                  prev.map((t) =>
                    t.id === template.id
                      ? { ...t, is_enabled: !t.is_enabled }
                      : t
                  )
                );
              }}
              onToggleWa={async (template) => {
                if (!isOrgAdmin || isTemplateLocked(template)) return;
                const supabase = createClient();
                const { error } = await supabase
                  .from("email_templates")
                  .update({ wa_enabled: !template.wa_enabled })
                  .eq("id", template.id);
                if (error) {
                  toast.error(t("email.save_template_error"));
                  return;
                }
                setTemplates((prev) =>
                  prev.map((t) =>
                    t.id === template.id
                      ? { ...t, wa_enabled: !t.wa_enabled }
                      : t
                  )
                );
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── General Settings Section ─────────────────────────────────────────────────

function GeneralSettings({
  settings,
  setSettings,
  saving,
  setSaving,
  isAdmin,
  organizationId,
  orgLogoUrl,
  onRefetch,
}: {
  settings: EmailSettings | null;
  setSettings: (s: EmailSettings | null) => void;
  saving: boolean;
  setSaving: (s: boolean) => void;
  isAdmin: boolean;
  organizationId: string | null;
  orgLogoUrl: string | null;
  onRefetch: () => void;
}) {
  const { t } = useLanguage();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSave = async () => {
    if (!organizationId || !settings || !isAdmin) return;

    // Validate email fields before saving
    if (settings.sender_email && !isValidEmail(settings.sender_email)) {
      toast.error(t("email.invalid_sender_email"));
      return;
    }
    if (settings.reply_to_email && !isValidEmail(settings.reply_to_email)) {
      toast.error(t("email.invalid_reply_to_email"));
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const payload = {
      organization_id: organizationId,
      sender_name: settings.sender_name,
      sender_email: settings.sender_email,
      reply_to_email: settings.reply_to_email,
      brand_color: settings.brand_color,
      email_logo_url: settings.email_logo_url,
      notification_emails: settings.notification_emails || null,
    };

    const { data, error } = await supabase
      .from("email_settings")
      .upsert(payload, { onConflict: "organization_id" })
      .select()
      .maybeSingle();

    setSaving(false);

    if (error) {
      toast.error(t("email.save_settings_error") + ": " + error.message);
      return;
    }

    if (data) {
      setSettings(data as EmailSettings);
    }

    toast.success(t("email.save_settings_success"));
    onRefetch();
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Max 2MB");
      return;
    }

    setUploadingLogo(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${organizationId}/email-logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploadingLogo(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("org-assets").getPublicUrl(path);

    const url = `${publicUrl}?t=${Date.now()}`;
    setSettings(settings ? { ...settings, email_logo_url: url } : null);
    setUploadingLogo(false);
  };

  if (!settings) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">{t("email.general_title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("email.general_description")}
          </p>
        </div>
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          {t("settings.org_admin_only")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("email.sender_name")}</label>
          <input
            type="text"
            disabled={!isAdmin}
            placeholder={t("email.sender_name_placeholder")}
            value={settings.sender_name ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, sender_name: e.target.value || null })
            }
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("email.sender_email")}</label>
          <input
            type="email"
            disabled={!isAdmin}
            placeholder={t("email.sender_email_placeholder")}
            value={settings.sender_email ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, sender_email: e.target.value || null })
            }
            className={inputClass}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("email.reply_to")}</label>
        <input
          type="email"
          disabled={!isAdmin}
          placeholder={t("email.reply_to_placeholder")}
          value={settings.reply_to_email ?? ""}
          onChange={(e) =>
            setSettings({ ...settings, reply_to_email: e.target.value || null })
          }
          className={inputClass}
        />
      </div>

      {/* Team notification emails (for daily summary, etc.) */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Correos del equipo (resumen diario)
        </label>
        <textarea
          disabled={!isAdmin}
          placeholder="admin@clinica.pe, recepcion@clinica.pe"
          value={settings.notification_emails ?? ""}
          rows={2}
          onChange={(e) =>
            setSettings({ ...settings, notification_emails: e.target.value || null })
          }
          className={`${inputClass} resize-none`}
        />
        <p className="text-xs text-muted-foreground">
          Lista de correos (separados por coma) que recibirán el resumen diario del día. Se envía cada mañana automáticamente.
        </p>
      </div>

      {/* Brand color + Logo row */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Brand color */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5" />
            {t("email.brand_color")}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              disabled={!isAdmin}
              value={settings.brand_color}
              onChange={(e) =>
                setSettings({ ...settings, brand_color: e.target.value })
              }
              className="h-10 w-10 rounded-lg border border-input cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <input
              type="text"
              disabled={!isAdmin}
              value={settings.brand_color}
              onChange={(e) =>
                setSettings({ ...settings, brand_color: e.target.value })
              }
              className={inputClass + " font-mono w-28"}
            />
          </div>
        </div>

        {/* Email logo */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            {t("email.email_logo")}
          </label>
          <div className="flex items-center gap-3">
            {settings.email_logo_url ? (
              <div className="relative group">
                <img
                  src={settings.email_logo_url}
                  alt="Email logo"
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-10 rounded-lg object-cover border border-border"
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ ...settings, email_logo_url: null })
                    }
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted border border-border">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : null}
                    {t("email.upload_logo")}
                  </button>
                  {orgLogoUrl && !settings.email_logo_url && (
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({ ...settings, email_logo_url: orgLogoUrl })
                      }
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {t("email.use_org_logo")}
                    </button>
                  )}
                </>
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? t("email.save_settings_saving") : t("email.save_settings")}
        </button>
      )}
    </div>
  );
}

// ── Template Category Group ──────────────────────────────────────────────────

function TemplateCategoryGroup({
  category,
  templates,
  waApprovedByEmailId,
  onConfigureWa,
  isTemplateLocked,
  isAdmin,
  onEdit,
  onToggle,
  onToggleWa,
}: {
  category: TemplateCategory;
  templates: EmailTemplate[];
  waApprovedByEmailId: Set<string>;
  onConfigureWa: () => void;
  isTemplateLocked: (t: EmailTemplate) => boolean;
  isAdmin: boolean;
  onEdit: (t: EmailTemplate) => void;
  onToggle: (t: EmailTemplate) => void;
  onToggleWa: (t: EmailTemplate) => void;
}) {
  const { t } = useLanguage();

  const categoryKey = `email.cat_${category}` as const;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {CATEGORY_ICONS[category]}
        {t(categoryKey)}
      </div>
      <div className="space-y-1">
        {templates.map((template) => {
          const locked = isTemplateLocked(template);
          return (
            <TemplateRow
              key={template.id}
              template={template}
              locked={locked}
              hasApprovedWa={waApprovedByEmailId.has(template.id)}
              onConfigureWa={onConfigureWa}
              isAdmin={isAdmin}
              onEdit={() => onEdit(template)}
              onToggle={() => onToggle(template)}
              onToggleWa={() => onToggleWa(template)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Template Row ─────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  locked,
  hasApprovedWa,
  onConfigureWa,
  isAdmin,
  onEdit,
  onToggle,
  onToggleWa,
}: {
  template: EmailTemplate;
  locked: boolean;
  // True when an APPROVED WhatsApp template is linked to this event
  // (whatsapp_templates.local_template_id === template.id). Same chain the
  // send route + reminders cron require to actually deliver on WhatsApp.
  hasApprovedWa: boolean;
  onConfigureWa: () => void;
  isAdmin: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onToggleWa: () => void;
}) {
  const { t } = useLanguage();

  const timingLabel = template.timing_value
    ? `${template.timing_value}${
        template.timing_unit === "hours"
          ? "h"
          : template.timing_unit === "minutes"
          ? "min"
          : "d"
      } ${t("email.timing_before")}`
    : null;

  // The event master switch: is_enabled=false skips the WHOLE event in both
  // the send route and the reminders cron (the template query filters on
  // is_enabled=true, so a disabled event never resolves a WA template either).
  const eventActive = template.is_enabled && !locked;

  // WhatsApp is only toggleable when: admin, not plan-locked, the event is
  // active (otherwise it can never fire), and there's an APPROVED linked WA
  // template. Otherwise the toggle is disabled with an explanatory tooltip.
  const waReason = !hasApprovedWa
    ? "no_template"
    : !template.is_enabled
    ? "event_off"
    : null;
  const waToggleEnabled = isAdmin && !locked && waReason === null;
  const waTooltip =
    waReason === "no_template"
      ? t("email.wa_needs_template")
      : waReason === "event_off"
      ? t("email.wa_off_event_off")
      : template.wa_enabled
      ? "WhatsApp activado"
      : "WhatsApp desactivado";

  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
        locked
          ? "border-border/40 bg-muted/30 opacity-60"
          : "border-border/60 bg-card hover:border-primary/30 hover:bg-accent/50"
      }`}
    >
      {/* ── Event (name + meta) ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{template.name}</span>
          {timingLabel && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
              <Clock className="h-3 w-3" />
              {timingLabel}
            </span>
          )}
          {locked && (
            <span className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
              <Lock className="h-3 w-3" />
              {t("email.locked_plan")} {PLAN_DISPLAY_NAMES[template.min_plan_slug]}
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {template.description}
          </p>
        )}
        {/* Master-switch honesty: when the event is off, nothing sends. */}
        {!locked && !template.is_enabled && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {t("email.event_off")}
          </p>
        )}
      </div>

      {/* ── Email column (is_enabled — event master switch) ─────────────── */}
      <div className="w-16 flex justify-center shrink-0">
        <button
          type="button"
          onClick={onToggle}
          disabled={!isAdmin || locked}
          className="disabled:cursor-not-allowed"
          title={t("email.event_active_tip")}
          aria-label={t("email.event_active")}
        >
          {eventActive ? (
            <ToggleRight className="h-6 w-6 text-primary" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* ── WhatsApp column (wa_enabled — needs approved linked template) ─ */}
      <div className="w-36 flex flex-col items-center justify-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onToggleWa}
          disabled={!waToggleEnabled}
          className="disabled:cursor-not-allowed"
          title={waTooltip}
          aria-label={waTooltip}
        >
          <MessageCircle
            className={`h-5 w-5 transition-colors ${
              template.wa_enabled && waToggleEnabled
                ? "text-emerald-500"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
        {/* When there's no approved+linked WA template, point the user to the
            place where they configure that chain — WA Business. */}
        {waReason === "no_template" && !locked && (
          <button
            type="button"
            onClick={onConfigureWa}
            className="flex items-center gap-0.5 text-[10px] text-primary hover:underline leading-tight text-center"
            title={t("email.wa_needs_template")}
          >
            <Smartphone className="h-2.5 w-2.5 shrink-0" />
            {t("email.wa_configure_link")}
          </button>
        )}
      </div>

      {/* ── Edit action ─────────────────────────────────────────────────── */}
      <div className="w-16 flex justify-end shrink-0">
        {!locked && isAdmin && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {t("common.edit")}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Template Editor ──────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  isLocked,
  emailSettings,
  clinicName,
  onBack,
  onSave,
}: {
  template: EmailTemplate;
  isLocked: boolean;
  emailSettings: EmailSettings | null;
  clinicName: string | null;
  onBack: () => void;
  onSave: (updated: EmailTemplate) => void;
}) {
  const { t, language } = useLanguage();
  const editorRef = useRef<RichTextEditorHandle>(null);

  // Pre-existing templates seeded with plain text have `body_html = null`.
  // Convert them to HTML once so the rich editor can render them and so the
  // user sees exactly what they had before.
  const initialBodyHtml = template.body_html ?? plainBodyToHtml(template.body);

  const [form, setForm] = useState({
    subject: template.subject,
    body: template.body,
    body_html: initialBodyHtml,
    is_enabled: template.is_enabled,
    wa_enabled: template.wa_enabled,
    channel: template.channel,
    timing_value: template.timing_value,
    timing_unit: template.timing_unit,
  });
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    // Keep `body` (plain) in sync with the HTML for the legacy send path
    // and for displaying in places that don't render HTML. We do this as a
    // lossy, best-effort extraction; the authoritative version is body_html.
    const plainFallback = htmlToPlainText(form.body_html);

    const { error } = await supabase
      .from("email_templates")
      .update({
        subject: form.subject,
        body: plainFallback,
        body_html: form.body_html,
        is_enabled: form.is_enabled,
        wa_enabled: form.wa_enabled,
        channel: form.channel,
        timing_value: form.timing_value,
        timing_unit: form.timing_unit,
      })
      .eq("id", template.id);

    setSaving(false);

    if (error) {
      toast.error(t("email.save_template_error"));
      return;
    }

    toast.success(t("email.save_template_success"));
    onSave({ ...template, ...form, body: plainFallback });
  };

  const insertVariable = (variable: string) => {
    editorRef.current?.insertText(variable);
  };

  const previewBodyHtml = substituteVariables(form.body_html, PREVIEW_DATA);

  const previewSubject = form.subject.replace(
    /\{\{[a-z_]+\}\}/g,
    (match) => PREVIEW_DATA[match] ?? match
  );

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const selectClass =
    "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <div className="space-y-4">
      {/* Header */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("email.back_to_list")}
      </button>

      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">{template.name}</h2>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {template.description}
            </p>
          )}
        </div>

        {/* Toggle + WA + Timing row */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Enabled toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {form.is_enabled ? t("email.enabled") : t("email.disabled")}
            </label>
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(e) =>
                    setForm({ ...form, is_enabled: e.target.checked })
                  }
                  disabled={isLocked}
                  className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </div>

          {/* WhatsApp toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </label>
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <div className="relative shrink-0">
                <input
                  type="checkbox"
                  checked={form.wa_enabled}
                  onChange={(e) =>
                    setForm({ ...form, wa_enabled: e.target.checked })
                  }
                  disabled={isLocked}
                  className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-emerald-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </div>
              <span className="text-xs text-muted-foreground">
                {form.wa_enabled ? "Activado" : "Desactivado"}
              </span>
            </label>
          </div>

          {/* Timing */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("email.timing")}</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                value={form.timing_value ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    timing_value: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
                disabled={isLocked}
                placeholder="—"
                className={inputClass + " w-20"}
              />
              <select
                value={form.timing_unit ?? "hours"}
                onChange={(e) =>
                  setForm({ ...form, timing_unit: e.target.value })
                }
                disabled={isLocked || !form.timing_value}
                className={selectClass + " flex-1"}
              >
                <option value="minutes">{t("email.timing_minutes")}</option>
                <option value="hours">{t("email.timing_hours")}</option>
                <option value="days">{t("email.timing_days")}</option>
              </select>
            </div>
            {!form.timing_value && (
              <p className="text-xs text-muted-foreground">
                {t("email.no_timing")}
              </p>
            )}
          </div>
        </div>

        {/* Subject */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("email.subject")}</label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            disabled={isLocked}
            className={inputClass}
          />
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("email.body")}</label>
          <RichTextEditor
            ref={editorRef}
            value={form.body_html}
            onChange={(html) => setForm((f) => ({ ...f, body_html: html }))}
            disabled={isLocked}
            minHeight={240}
          />
        </div>

        {/* Variables */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t("email.variables")} —{" "}
            <span className="font-normal">{t("email.variable_hint")}</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                disabled={isLocked}
                className="flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={v.label}
              >
                <Copy className="h-3 w-3" />
                {v.key}
              </button>
            ))}
          </div>
        </div>

        {/* Preview toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <Eye className="h-4 w-4" />
            {t("email.preview")}
          </button>

          {showPreview && (
            <div className="mt-3 rounded-xl border border-border bg-background p-5 space-y-3">
              {/* Simulated email header */}
              <div className="space-y-1 border-b border-border pb-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">
                    {language === "es" ? "De:" : "From:"}
                  </span>{" "}
                  {PREVIEW_DATA["{{clinica_nombre}}"]}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">
                    {language === "es" ? "Para:" : "To:"}
                  </span>{" "}
                  maria.garcia@email.com
                </p>
                <p className="text-sm font-semibold">{previewSubject}</p>
              </div>
              {/* Body (rendered HTML — already sanitized client-side and again server-side before send) */}
              <div
                className="text-sm leading-relaxed prose prose-sm max-w-none [&_p]:my-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_blockquote]:italic [&_a]:text-primary [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        {!isLocked && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving
                ? t("email.save_template_saving")
                : t("email.save_template")}
            </button>
            <button
              type="button"
              disabled={sendingTest}
              onClick={async () => {
                const testEmail = prompt(
                  language === "es"
                    ? "Ingresa el correo de destino para la prueba:"
                    : "Enter the destination email for the test:"
                );
                if (!testEmail) return;

                setSendingTest(true);
                try {
                  const res = await fetch("/api/email/send-test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to: testEmail,
                      subject: previewSubject,
                      body: htmlToPlainText(previewBodyHtml),
                      body_html: previewBodyHtml,
                      brand_color: emailSettings?.brand_color || "#10b981",
                      logo_url: emailSettings?.email_logo_url,
                      clinic_name: clinicName,
                    }),
                  });
                  const contentType = res.headers.get("content-type") || "";
                  if (!contentType.includes("application/json")) {
                    toast.error(
                      language === "es"
                        ? "Error del servidor. Revisa la configuración SMTP."
                        : "Server error. Check SMTP configuration."
                    );
                    return;
                  }
                  const data = await res.json();
                  if (!res.ok) {
                    toast.error(data.error || "Error al enviar");
                  } else {
                    toast.success(
                      language === "es"
                        ? `Correo de prueba enviado a ${testEmail}`
                        : `Test email sent to ${testEmail}`
                    );
                  }
                } catch (err) {
                  const msg =
                    err instanceof Error ? err.message : "Error desconocido";
                  toast.error(
                    (language === "es"
                      ? "Error al enviar: "
                      : "Send error: ") + msg
                  );
                } finally {
                  setSendingTest(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sendingTest ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sendingTest
                ? language === "es"
                  ? "Enviando..."
                  : "Sending..."
                : t("email.send_test")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Plain-text ⇄ HTML helpers ────────────────────────────────────────────────
// Used to keep the legacy `body` column in sync with the new rich `body_html`.
// The conversion is intentionally lossy: the `body_html` column is the
// authoritative source; `body` is a best-effort plain-text fallback.

function plainBodyToHtml(plain: string): string {
  if (!plain) return "<p></p>";
  // Split on double newlines → paragraphs; single newlines → <br>.
  const paragraphs = plain.split(/\n{2,}/).map((p) => {
    const escaped = p
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<p>${escaped.replace(/\n/g, "<br/>")}</p>`;
  });
  return paragraphs.join("");
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html; // SSR guard — not used in practice
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  // Convert <br> and block-ending tags to line breaks before extracting text
  tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  tmp.querySelectorAll("p, div, h1, h2, h3, li, blockquote").forEach((el) => {
    el.append("\n");
  });
  return (tmp.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
