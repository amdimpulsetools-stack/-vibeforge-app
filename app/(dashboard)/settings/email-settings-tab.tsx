"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { usePlan } from "@/hooks/use-plan";
import { toast } from "sonner";
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
  is_enabled: boolean;
  channel: "email" | "whatsapp" | "both";
  timing_value: number | null;
  timing_unit: string | null;
  min_plan_slug: string;
  sort_order: number;
}

type TemplateCategory = "appointments" | "patients" | "payments" | "team" | "marketing";

const CATEGORIES: TemplateCategory[] = ["appointments", "patients", "payments", "team", "marketing"];

const CATEGORY_ICONS: Record<TemplateCategory, React.ReactNode> = {
  appointments: <CalendarCheck className="h-4 w-4" />,
  patients: <UserCheck className="h-4 w-4" />,
  payments: <CreditCard className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  marketing: <Megaphone className="h-4 w-4" />,
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
  { key: "{{clinica_nombre}}", label: "Nombre de la clínica" },
  { key: "{{clinica_telefono}}", label: "Teléfono de la clínica" },
  { key: "{{link_cancelar}}", label: "Link para cancelar" },
  { key: "{{link_reagendar}}", label: "Link para reagendar" },
  { key: "{{monto_pagado}}", label: "Monto pagado" },
];

const PREVIEW_DATA: Record<string, string> = {
  "{{paciente_nombre}}": "María García",
  "{{doctor_nombre}}": "Dr. Carlos López",
  "{{fecha_cita}}": "15 de marzo, 2026",
  "{{hora_cita}}": "10:30 AM",
  "{{consultorio}}": "Consultorio 1",
  "{{servicio}}": "Consulta general",
  "{{clinica_nombre}}": "Mi Clínica",
  "{{clinica_telefono}}": "+51 999 000 000",
  "{{link_cancelar}}": "https://app.ejemplo.com/cancelar/abc123",
  "{{link_reagendar}}": "https://app.ejemplo.com/reagendar/abc123",
  "{{monto_pagado}}": "S/. 150.00",
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function EmailSettingsTab() {
  const { t } = useLanguage();
  const { organizationId, organization, isOrgAdmin } = useOrganization();
  const { plan } = usePlan();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();

    const [settingsRes, templatesRes] = await Promise.all([
      supabase
        .from("email_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .single(),
      supabase
        .from("email_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("category")
        .order("sort_order"),
    ]);

    if (settingsRes.data) {
      setSettings(settingsRes.data as EmailSettings);
    } else {
      // Create default settings
      setSettings({
        organization_id: organizationId,
        sender_name: organization?.name ?? null,
        sender_email: null,
        reply_to_email: null,
        brand_color: "#10b981",
        email_logo_url: organization?.logo_url ?? null,
      });
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
      <div className="max-w-2xl flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        isLocked={isTemplateLocked(editingTemplate)}
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
    <div className="max-w-2xl space-y-6">
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

      {/* Email templates by category */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">{t("email.templates_title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("email.templates_description")}
            </p>
          </div>
        </div>

        {CATEGORIES.map((category) => {
          const categoryTemplates = templates.filter(
            (t) => t.category === category
          );
          if (categoryTemplates.length === 0) return null;

          return (
            <TemplateCategoryGroup
              key={category}
              category={category}
              templates={categoryTemplates}
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

  const handleSave = async () => {
    if (!organizationId || !settings) return;
    setSaving(true);
    const supabase = createClient();

    const payload = {
      organization_id: organizationId,
      sender_name: settings.sender_name,
      sender_email: settings.sender_email,
      reply_to_email: settings.reply_to_email,
      brand_color: settings.brand_color,
      email_logo_url: settings.email_logo_url,
    };

    const { data, error } = await supabase
      .from("email_settings")
      .upsert(payload, { onConflict: "organization_id" })
      .select()
      .single();

    setSaving(false);

    if (error) {
      console.error("Email settings save error:", error);
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
  isTemplateLocked,
  isAdmin,
  onEdit,
  onToggle,
}: {
  category: TemplateCategory;
  templates: EmailTemplate[];
  isTemplateLocked: (t: EmailTemplate) => boolean;
  isAdmin: boolean;
  onEdit: (t: EmailTemplate) => void;
  onToggle: (t: EmailTemplate) => void;
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
              isAdmin={isAdmin}
              onEdit={() => onEdit(template)}
              onToggle={() => onToggle(template)}
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
  isAdmin,
  onEdit,
  onToggle,
}: {
  template: EmailTemplate;
  locked: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onToggle: () => void;
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

  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
        locked
          ? "border-border/40 bg-muted/30 opacity-60"
          : "border-border/60 bg-card hover:border-primary/30 hover:bg-accent/50"
      }`}
    >
      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        disabled={!isAdmin || locked}
        className="shrink-0 disabled:cursor-not-allowed"
        title={template.is_enabled ? t("email.enabled") : t("email.disabled")}
      >
        {template.is_enabled && !locked ? (
          <ToggleRight className="h-6 w-6 text-primary" />
        ) : (
          <ToggleLeft className="h-6 w-6 text-muted-foreground" />
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
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
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
  onBack,
  onSave,
}: {
  template: EmailTemplate;
  isLocked: boolean;
  onBack: () => void;
  onSave: (updated: EmailTemplate) => void;
}) {
  const { t, language } = useLanguage();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [form, setForm] = useState({
    subject: template.subject,
    body: template.body,
    is_enabled: template.is_enabled,
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

    const { error } = await supabase
      .from("email_templates")
      .update({
        subject: form.subject,
        body: form.body,
        is_enabled: form.is_enabled,
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
    onSave({ ...template, ...form });
  };

  const insertVariable = (variable: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody =
      form.body.substring(0, start) + variable + form.body.substring(end);
    setForm({ ...form, body: newBody });

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + variable.length;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const previewBody = form.body.replace(
    /\{\{[a-z_]+\}\}/g,
    (match) => PREVIEW_DATA[match] ?? match
  );

  const previewSubject = form.subject.replace(
    /\{\{[a-z_]+\}\}/g,
    (match) => PREVIEW_DATA[match] ?? match
  );

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const selectClass =
    "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  return (
    <div className="max-w-2xl space-y-4">
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

        {/* Toggle + Channel + Timing row */}
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

          {/* Channel */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("email.channel")}</label>
            <select
              value={form.channel}
              onChange={(e) =>
                setForm({
                  ...form,
                  channel: e.target.value as "email" | "whatsapp" | "both",
                })
              }
              disabled={isLocked}
              className={selectClass + " w-full"}
            >
              <option value="email">{t("email.channel_email")}</option>
              <option value="whatsapp">{t("email.channel_whatsapp")}</option>
              <option value="both">{t("email.channel_both")}</option>
            </select>
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
          <textarea
            ref={bodyRef}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            disabled={isLocked}
            rows={6}
            className={inputClass + " resize-y min-h-[120px]"}
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
              {/* Body */}
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {previewBody}
              </div>
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
                      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">${previewBody.replace(/\n/g, "<br/>")}</div>`,
                    }),
                  });
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
