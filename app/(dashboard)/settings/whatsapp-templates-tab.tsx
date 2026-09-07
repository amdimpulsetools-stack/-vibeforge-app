"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  ArrowLeft,
  Trash2,
  Send,
  RefreshCw,
  FileText,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  PauseCircle,
  Ban,
  Pencil,
  Eye,
  ChevronDown,
  ChevronUp,
  Smartphone,
  Zap,
} from "lucide-react";
import type {
  WhatsAppTemplate,
  WhatsAppTemplateButton,
  WhatsAppTemplateCategory,
  WhatsAppTemplateStatus,
  WhatsAppHeaderType,
} from "@/lib/whatsapp/types";
import {
  WHATSAPP_VARIABLE_OPTIONS,
  WHATSAPP_LANGUAGES,
} from "@/lib/whatsapp/types";
import { toMetaTemplateName } from "@/lib/whatsapp/templates";

// ── Status Badge ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  WhatsAppTemplateStatus,
  { color: string; icon: React.ReactNode; label: string; labelEn: string }
> = {
  DRAFT: {
    color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
    icon: <Pencil className="h-3 w-3" />,
    label: "Borrador",
    labelEn: "Draft",
  },
  PENDING: {
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    icon: <Clock className="h-3 w-3" />,
    label: "En revisión",
    labelEn: "Pending",
  },
  APPROVED: {
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: <CheckCircle2 className="h-3 w-3" />,
    label: "Aprobada",
    labelEn: "Approved",
  },
  REJECTED: {
    color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
    icon: <XCircle className="h-3 w-3" />,
    label: "Rechazada",
    labelEn: "Rejected",
  },
  PAUSED: {
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
    icon: <PauseCircle className="h-3 w-3" />,
    label: "Pausada",
    labelEn: "Paused",
  },
  DISABLED: {
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30",
    icon: <Ban className="h-3 w-3" />,
    label: "Deshabilitada",
    labelEn: "Disabled",
  },
};

// ── Automation link (email template) ────────────────────────────────────────

/**
 * A local email template linked to a WA template via `local_template_id`
 * turns on automatic sending: the cron (reminders) and /api/notifications/send
 * match `whatsapp_templates.local_template_id === email_templates.id`.
 *
 * Only these slugs are actually driven by the automatic pipeline
 * (/api/notifications/send call-sites + cron windows), so we restrict the
 * selector to them. Others (welcome, birthday, marketing…) never trigger a WA
 * send and would be misleading here.
 */
const AUTOMATABLE_EMAIL_SLUGS = [
  "appointment_confirmation",
  "appointment_confirmation_virtual",
  "appointment_reminder_24h",
  "appointment_reminder_2h",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_meeting_link_changed",
  "payment_receipt",
  "payment_invoice",
] as const;

/** Ejemplos realistas por variable — se autollenan al mapear si el campo
 *  de ejemplo está vacío. Meta EXIGE ejemplos para aprobar plantillas con
 *  variables; dejarlos en blanco era la causa #1 del "Invalid parameter". */
const SAMPLE_VALUE_DEFAULTS: Record<string, string> = {
  paciente_nombre: "María López",
  paciente_dni: "45678912",
  paciente_telefono: "+51 987 654 321",
  fecha_cita: "23/07/2026",
  hora_cita: "9:00 am",
  servicio: "Consulta general",
  doctor_nombre: "Dra. García",
  clinica_nombre: "Clínica Bienestar",
  clinica_telefono: "+51 912 345 678",
  monto_pagado: "S/ 200.00",
};

interface EmailTemplateOption {
  id: string;
  slug: string;
  name: string;
  // Channel state of the linked event — used to warn when a WA template is
  // approved + linked but the WhatsApp channel of that event is switched off.
  is_enabled: boolean;
  wa_enabled: boolean;
}

function StatusBadge({ status, language }: { status: WhatsAppTemplateStatus; language: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {language === "es" ? cfg.label : cfg.labelEn}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function WhatsAppTemplatesTab() {
  const { language } = useLanguage();
  const { organizationId, isOrgAdmin } = useOrganization();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Jump to the "Notificaciones" tab (internal key stays "correos"), where the
  // WhatsApp channel of each event is toggled.
  const goToNotifications = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "correos");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateOption[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<WhatsAppTemplate | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WhatsAppTemplateStatus | "ALL">("ALL");

  const es = language === "es";

  const fetchTemplates = useCallback(async () => {
    if (!organizationId) return;
    const res = await fetch("/api/whatsapp/templates");
    if (res.ok) {
      const data = await res.json();
      setTemplates(data || []);
    }
    setLoading(false);
  }, [organizationId]);

  const fetchEmailTemplates = useCallback(async () => {
    if (!organizationId) return;
    // RLS lets org members read their own email_templates. We only keep the
    // slugs the automatic pipeline can actually trigger.
    const supabase = createClient();
    const { data } = await supabase
      .from("email_templates")
      .select("id, slug, name, is_enabled, wa_enabled")
      .eq("organization_id", organizationId)
      .in("slug", [...AUTOMATABLE_EMAIL_SLUGS])
      .order("sort_order", { ascending: true });
    setEmailTemplates((data as EmailTemplateOption[]) || []);
  }, [organizationId]);

  useEffect(() => {
    fetchTemplates();
    fetchEmailTemplates();
  }, [fetchTemplates, fetchEmailTemplates]);

  const filteredTemplates =
    statusFilter === "ALL"
      ? templates
      : templates.filter((t) => t.status === statusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (editingTemplate || creatingNew) {
    return (
      <TemplateEditor
        template={editingTemplate}
        emailTemplates={emailTemplates}
        onBack={() => {
          setEditingTemplate(null);
          setCreatingNew(false);
        }}
        onSaved={() => {
          setEditingTemplate(null);
          setCreatingNew(false);
          fetchTemplates();
        }}
        language={language}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">
                {es ? "Plantillas de WhatsApp" : "WhatsApp Templates"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {es
                  ? "Crea y gestiona plantillas para envío automático vía WhatsApp Business API"
                  : "Create and manage templates for automated sending via WhatsApp Business API"}
              </p>
            </div>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={() => setCreatingNew(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              {es ? "Nueva plantilla" : "New template"}
            </button>
          )}
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap gap-2">
          {(["ALL", "DRAFT", "PENDING", "APPROVED", "REJECTED"] as const).map((status) => {
            const count = status === "ALL" ? templates.length : templates.filter((t) => t.status === status).length;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                  statusFilter === status
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {status === "ALL"
                  ? (es ? "Todas" : "All")
                  : (es ? STATUS_CONFIG[status].label : STATUS_CONFIG[status].labelEn)}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Template list */}
        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              {es ? "No hay plantillas creadas" : "No templates created"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {es
                ? "Crea tu primera plantilla para enviar mensajes vía WhatsApp"
                : "Create your first template to send messages via WhatsApp"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTemplates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                emailTemplates={emailTemplates}
                language={language}
                isAdmin={isOrgAdmin}
                onGoToNotifications={goToNotifications}
                onEdit={() => setEditingTemplate(template)}
                onDelete={async () => {
                  const ok = await confirm({
                    title: es ? "¿Eliminar esta plantilla?" : "Delete this template?",
                    confirmText: es ? "Eliminar" : "Delete",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  const res = await fetch(`/api/whatsapp/templates/${template.id}`, { method: "DELETE" });
                  if (res.ok) {
                    toast.success(es ? "Plantilla eliminada" : "Template deleted");
                    fetchTemplates();
                  } else {
                    toast.error(es ? "Error al eliminar" : "Delete error");
                  }
                }}
                onSync={async () => {
                  const res = await fetch(`/api/whatsapp/templates/${template.id}/sync`, { method: "POST" });
                  if (res.ok) {
                    const data = await res.json();
                    toast.success(es ? `Estado: ${data.status}` : `Status: ${data.status}`);
                    fetchTemplates();
                  } else {
                    // El servidor manda el motivo real (token caducado,
                    // plantilla borrada en Meta…): mostrarlo, no ocultarlo.
                    const data = await res.json().catch(() => null);
                    toast.error(es ? "Error al sincronizar" : "Sync error", {
                      description: data?.error,
                    });
                  }
                }}
                onSubmit={async () => {
                  const res = await fetch(`/api/whatsapp/templates/${template.id}/submit`, { method: "POST" });
                  if (res.ok) {
                    toast.success(es ? "Plantilla enviada a revisión" : "Template submitted for review");
                    fetchTemplates();
                  } else {
                    const data = await res.json();
                    toast.error(data.error || (es ? "Error al enviar" : "Submit error"));
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template Row ────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  emailTemplates,
  language,
  isAdmin,
  onGoToNotifications,
  onEdit,
  onDelete,
  onSync,
  onSubmit,
}: {
  template: WhatsAppTemplate;
  emailTemplates: EmailTemplateOption[];
  language: string;
  isAdmin: boolean;
  onGoToNotifications: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
  onSubmit: () => void;
}) {
  const es = language === "es";

  const linkedEmail = template.local_template_id
    ? emailTemplates.find((t) => t.id === template.local_template_id)
    : null;

  // Broken-chain warning: template is APPROVED and linked to an event, but the
  // event's WhatsApp channel (or the whole event) is off — so this approved
  // template will never actually send. The fix lives in "Notificaciones".
  const linkedEventName = linkedEmail?.name || linkedEmail?.slug || null;
  const chainBroken =
    template.status === "APPROVED" &&
    !!template.local_template_id &&
    !!linkedEmail &&
    (!linkedEmail.wa_enabled || !linkedEmail.is_enabled);
  const chainBrokenReason =
    chainBroken && linkedEmail && !linkedEmail.is_enabled ? "event_off" : "wa_off";

  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 transition-all hover:border-primary/30 hover:bg-accent/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate font-mono">
            {template.meta_template_name}
          </span>
          <StatusBadge status={template.status} language={language} />
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
            {template.category}
          </span>
          <span className="text-xs text-muted-foreground">
            {template.language}
          </span>
          {template.local_template_id && (
            <span
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
              title={es ? "Envío automático vinculado" : "Linked for automatic sending"}
            >
              <Zap className="h-2.5 w-2.5" />
              {es ? "Auto: " : "Auto: "}
              {linkedEmail?.name || linkedEmail?.slug || (es ? "vinculada" : "linked")}
            </span>
          )}
        </div>
        {template.body_text && (
          <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-md">
            {template.body_text.slice(0, 80)}
            {template.body_text.length > 80 ? "..." : ""}
          </p>
        )}
        {template.rejection_reason && (
          <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {template.rejection_reason}
          </p>
        )}
        {chainBroken && (
          <button
            type="button"
            onClick={onGoToNotifications}
            className="mt-1.5 flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-left text-[11px] text-amber-700 dark:text-amber-400 hover:bg-amber-500/15 transition-colors"
          >
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              {es ? (
                <>
                  Aprobada y vinculada, pero el canal WhatsApp de{" "}
                  <span className="font-semibold">
                    &ldquo;{linkedEventName}&rdquo;
                  </span>{" "}
                  {chainBrokenReason === "event_off"
                    ? "está desactivado (evento apagado)"
                    : "está desactivado"}{" "}
                  — actívalo en Notificaciones.
                </>
              ) : (
                <>
                  Approved and linked, but the WhatsApp channel of{" "}
                  <span className="font-semibold">
                    &ldquo;{linkedEventName}&rdquo;
                  </span>{" "}
                  {chainBrokenReason === "event_off"
                    ? "is off (event disabled)"
                    : "is off"}{" "}
                  — turn it on in Notifications.
                </>
              )}
            </span>
          </button>
        )}
      </div>

      {/* Actions */}
      {/* En touch no hay hover: con `opacity-0 group-hover` las acciones de
          cada plantilla (Enviar / Sincronizar / Editar / Eliminar) eran
          literalmente invisibles en el teléfono y no había forma de
          descubrirlas. Visibles por defecto; desde md vuelve el
          comportamiento hover de siempre. */}
      {isAdmin && (
        <div className="flex items-center gap-1 opacity-100 transition-opacity shrink-0 md:opacity-0 md:group-hover:opacity-100">
          {["DRAFT", "REJECTED"].includes(template.status) && (
            <button
              type="button"
              onClick={onSubmit}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title={es ? "Enviar a revisión" : "Submit for review"}
            >
              <Send className="h-3.5 w-3.5" />
              {es ? "Enviar" : "Submit"}
            </button>
          )}
          {template.status === "PENDING" && (
            <button
              type="button"
              onClick={onSync}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title={es ? "Sincronizar estado" : "Sync status"}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {es ? "Sincronizar" : "Sync"}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {es ? "Editar" : "Edit"}
          </button>
          {["DRAFT", "REJECTED"].includes(template.status) && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Template Editor ─────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  emailTemplates,
  onBack,
  onSaved,
  language,
}: {
  template: WhatsAppTemplate | null;
  emailTemplates: EmailTemplateOption[];
  onBack: () => void;
  onSaved: () => void;
  language: string;
}) {
  const es = language === "es";
  const isNew = !template;

  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [form, setForm] = useState({
    meta_template_name: template?.meta_template_name || "",
    category: (template?.category || "UTILITY") as WhatsAppTemplateCategory,
    language: template?.language || "es",
    header_type: (template?.header_type || "NONE") as WhatsAppHeaderType,
    header_content: template?.header_content || "",
    body_text: template?.body_text || "",
    footer_text: template?.footer_text || "",
    buttons: (template?.buttons || []) as WhatsAppTemplateButton[],
    variable_mapping: (template?.variable_mapping || {}) as Record<string, string>,
    sample_values: (template?.sample_values || {}) as Record<string, string>,
    local_template_id: (template?.local_template_id || "") as string,
  });

  // Extract variable count from body
  const variableCount = (form.body_text.match(/\{\{\d+\}\}/g) || []).length;
  const variableNumbers = Array.from(
    new Set((form.body_text.match(/\{\{(\d+)\}\}/g) || []).map((m) => m.replace(/\{|\}/g, "")))
  ).sort((a, b) => Number(a) - Number(b));

  const handleSave = async () => {
    if (!form.meta_template_name.trim()) {
      toast.error(es ? "Nombre de plantilla requerido" : "Template name required");
      return;
    }

    setSaving(true);

    const url = isNew
      ? "/api/whatsapp/templates"
      : `/api/whatsapp/templates/${template.id}`;
    const method = isNew ? "POST" : "PUT";

    const payload = {
      ...form,
      meta_template_name: isNew
        ? toMetaTemplateName(form.meta_template_name)
        : form.meta_template_name,
      // The API expects a uuid or null — an empty string would fail validation.
      local_template_id: form.local_template_id || null,
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || (es ? "Error al guardar" : "Save error"));
      return;
    }

    toast.success(es ? "Plantilla guardada" : "Template saved");
    onSaved();
  };

  const insertVariable = (position: number) => {
    setForm({ ...form, body_text: form.body_text + `{{${position}}}` });
  };

  const addButton = () => {
    if (form.buttons.length >= 3) return;
    setForm({
      ...form,
      buttons: [...form.buttons, { type: "QUICK_REPLY", text: "" }],
    });
  };

  const updateButton = (index: number, updates: Partial<WhatsAppTemplateButton>) => {
    const newButtons = [...form.buttons];
    newButtons[index] = { ...newButtons[index], ...updates };
    setForm({ ...form, buttons: newButtons });
  };

  const removeButton = (index: number) => {
    setForm({ ...form, buttons: form.buttons.filter((_, i) => i !== index) });
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";
  const selectClass =
    "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  const canEdit = isNew || ["DRAFT", "REJECTED"].includes(template?.status || "");

  // Build preview
  const previewBody = form.body_text.replace(
    /\{\{(\d+)\}\}/g,
    (_, num) => form.sample_values[num] || `[variable ${num}]`
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {es ? "Volver a la lista" : "Back to list"}
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        {/* Editor */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <h2 className="text-lg font-semibold">
              {isNew ? (es ? "Nueva plantilla" : "New template") : template.meta_template_name}
            </h2>

            {/* Name, Category, Language row */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {es ? "Nombre (Meta)" : "Name (Meta)"}
                </label>
                <input
                  type="text"
                  value={form.meta_template_name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      meta_template_name: isNew
                        ? e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_")
                        : e.target.value,
                    })
                  }
                  disabled={!canEdit}
                  placeholder="confirmacion_cita"
                  className={inputClass + " font-mono"}
                />
                <p className="text-xs text-muted-foreground">
                  {es ? "Solo minúsculas y guiones bajos" : "Lowercase and underscores only"}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {es ? "Categoría" : "Category"}
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as WhatsAppTemplateCategory })}
                  disabled={!canEdit}
                  className={selectClass + " w-full"}
                >
                  <option value="UTILITY">{es ? "Utilidad (transaccional)" : "Utility (transactional)"}</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="AUTHENTICATION">{es ? "Autenticación" : "Authentication"}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {es ? "Idioma" : "Language"}
                </label>
                <select
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                  disabled={!canEdit}
                  className={selectClass + " w-full"}
                >
                  {WHATSAPP_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Automation link — maps this WA template to an email template
                slug so the cron / notifications pipeline sends it automatically */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
                {es ? "Usar para (automático)" : "Use for (automatic)"}
              </label>
              <select
                value={form.local_template_id}
                onChange={(e) => setForm({ ...form, local_template_id: e.target.value })}
                disabled={!canEdit}
                className={selectClass + " w-full"}
              >
                <option value="">
                  {es ? "Ninguna (solo envío manual)" : "None (manual sending only)"}
                </option>
                {emailTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name || t.slug}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {es
                  ? "Vincula esta plantilla a un evento para que se envíe automáticamente (ej. confirmación o recordatorio de cita). Requiere que la plantilla esté aprobada por Meta y que WhatsApp esté activado en ese email."
                  : "Link this template to an event so it is sent automatically (e.g. appointment confirmation or reminder). Requires Meta approval and WhatsApp enabled on that email template."}
              </p>
            </div>

            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Header</label>
                <select
                  value={form.header_type}
                  onChange={(e) => setForm({ ...form, header_type: e.target.value as WhatsAppHeaderType })}
                  disabled={!canEdit}
                  className={selectClass + " text-xs"}
                >
                  <option value="NONE">{es ? "Sin header" : "No header"}</option>
                  <option value="TEXT">{es ? "Texto" : "Text"}</option>
                  <option value="IMAGE">{es ? "Imagen" : "Image"}</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">{es ? "Documento" : "Document"}</option>
                </select>
              </div>
              {form.header_type !== "NONE" && (
                <input
                  type="text"
                  value={form.header_content}
                  onChange={(e) => setForm({ ...form, header_content: e.target.value })}
                  disabled={!canEdit}
                  placeholder={
                    form.header_type === "TEXT"
                      ? (es ? "Texto del header" : "Header text")
                      : "https://ejemplo.com/imagen.jpg"
                  }
                  className={inputClass}
                />
              )}
            </div>

            {/* Body */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {es ? "Cuerpo del mensaje" : "Message body"}
              </label>
              <textarea
                value={form.body_text}
                onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                disabled={!canEdit}
                rows={5}
                placeholder={es
                  ? "Hola {{1}}, tu cita es el {{2}} a las {{3}} con {{4}}."
                  : "Hello {{1}}, your appointment is on {{2}} at {{3}} with {{4}}."}
                className={inputClass + " resize-y min-h-[100px]"}
              />
              {/* Los chips muestran EN VIVO el significado que cada número
                  tiene según el "Mapeo de variables" de más abajo — pedido
                  del founder: sin leyenda, los números obligan a memorizar. */}
              <p className="text-xs text-muted-foreground">
                {es
                  ? "Haz clic para insertar una variable. Meta solo entiende números — su significado se asigna abajo en \"Mapeo de variables\" y se refleja aquí:"
                  : "Click to insert a variable. Meta only understands numbers — assign each one's meaning below in \"Variable mapping\" and it shows here:"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                  const mapped = form.variable_mapping[String(n)];
                  const mappedLabel = mapped
                    ? WHATSAPP_VARIABLE_OPTIONS.find((o) => o.value === mapped)?.label ?? mapped
                    : null;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => insertVariable(n)}
                      disabled={!canEdit}
                      title={
                        mappedLabel ??
                        (es ? "Sin significado asignado aún" : "No meaning assigned yet")
                      }
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                    >
                      <span className="font-mono">{`{{${n}}}`}</span>
                      {mappedLabel && (
                        <span className="font-normal text-emerald-600/80 dark:text-emerald-400/70">
                          · {mappedLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Footer <span className="text-muted-foreground font-normal">({es ? "opcional" : "optional"})</span>
              </label>
              <input
                type="text"
                value={form.footer_text}
                onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                disabled={!canEdit}
                placeholder={es ? "Yenda - No responder a este mensaje" : "Yenda - Do not reply to this message"}
                className={inputClass}
              />
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  {es ? "Botones" : "Buttons"} ({form.buttons.length}/3)
                </label>
                {canEdit && form.buttons.length < 3 && (
                  <button
                    type="button"
                    onClick={addButton}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    {es ? "Agregar botón" : "Add button"}
                  </button>
                )}
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-border p-3">
                  <select
                    value={btn.type}
                    onChange={(e) => updateButton(i, { type: e.target.value as WhatsAppTemplateButton["type"] })}
                    disabled={!canEdit}
                    className={selectClass + " text-xs w-32 shrink-0"}
                  >
                    <option value="QUICK_REPLY">{es ? "Respuesta rápida" : "Quick Reply"}</option>
                    <option value="URL">URL</option>
                    <option value="PHONE_NUMBER">{es ? "Llamar" : "Call"}</option>
                  </select>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={btn.text}
                      onChange={(e) => updateButton(i, { text: e.target.value })}
                      disabled={!canEdit}
                      placeholder={es ? "Texto del botón" : "Button text"}
                      className={inputClass}
                    />
                    {btn.type === "URL" && (
                      <input
                        type="text"
                        value={btn.url || ""}
                        onChange={(e) => updateButton(i, { url: e.target.value })}
                        disabled={!canEdit}
                        placeholder="https://ejemplo.com/{{1}}"
                        className={inputClass}
                      />
                    )}
                    {btn.type === "PHONE_NUMBER" && (
                      <input
                        type="text"
                        value={btn.phone_number || ""}
                        onChange={(e) => updateButton(i, { phone_number: e.target.value })}
                        disabled={!canEdit}
                        placeholder="+51999000000"
                        className={inputClass}
                      />
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeButton(i)}
                      className="text-destructive hover:bg-destructive/10 rounded p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Variable Mapping */}
          {variableNumbers.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
              <h3 className="text-sm font-semibold">
                {es ? "Mapeo de variables" : "Variable Mapping"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {es
                  ? "Asigna cada variable de Meta a un dato de tu sistema"
                  : "Map each Meta variable to a data field in your system"}
              </p>

              <div className="space-y-3">
                {variableNumbers.map((num) => (
                  // A 390px las tres columnas dejaban ~103px al select y al
                  // ejemplo, ilegibles. En móvil se parte en dos filas
                  // (variable + select arriba, ejemplo a lo ancho debajo);
                  // desde sm vuelve la rejilla de tres columnas de siempre.
                  <div key={num} className="grid grid-cols-[56px,1fr] gap-3 items-center sm:grid-cols-[80px,1fr,1fr]">
                    <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {`{{${num}}}`}
                    </span>
                    <select
                      value={form.variable_mapping[num] || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Al mapear una variable, si el ejemplo está vacío se
                        // autollena con un valor realista según el tipo —
                        // Meta EXIGE ejemplos y dejarlos en blanco era la
                        // causa #1 del "Invalid parameter" al someter.
                        const currentSample = (form.sample_values[num] || "").trim();
                        const autoSample =
                          !currentSample && value
                            ? SAMPLE_VALUE_DEFAULTS[value] ?? ""
                            : null;
                        setForm({
                          ...form,
                          variable_mapping: { ...form.variable_mapping, [num]: value },
                          ...(autoSample
                            ? {
                                sample_values: {
                                  ...form.sample_values,
                                  [num]: autoSample,
                                },
                              }
                            : {}),
                        });
                      }}
                      className={selectClass + " w-full text-xs"}
                    >
                      <option value="">{es ? "— Seleccionar —" : "— Select —"}</option>
                      {WHATSAPP_VARIABLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={form.sample_values[num] || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          sample_values: { ...form.sample_values, [num]: e.target.value },
                        })
                      }
                      placeholder={es ? "Valor de ejemplo" : "Sample value"}
                      className={inputClass + " col-span-2 text-xs sm:col-span-1"}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {canEdit && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving
                  ? (es ? "Guardando..." : "Saving...")
                  : (es ? "Guardar borrador" : "Save draft")}
              </button>
            </div>
          )}
        </div>

        {/* Preview panel */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3 sticky top-4">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">
                {es ? "Vista previa" : "Preview"}
              </h3>
            </div>

            {/* WhatsApp-style preview */}
            <div className="rounded-xl bg-[#0b141a] p-4 min-h-[300px]">
              {/* WhatsApp chat bubble */}
              <div className="max-w-[280px]">
                {/* Header */}
                {form.header_type === "TEXT" && form.header_content && (
                  <div className="rounded-t-lg bg-[#005c4b] px-3 py-2">
                    <p className="text-sm font-bold text-white">{form.header_content}</p>
                  </div>
                )}
                {form.header_type === "IMAGE" && (
                  <div className="rounded-t-lg bg-[#005c4b] p-1">
                    <div className="h-32 rounded bg-[#1a2e35] flex items-center justify-center">
                      <FileText className="h-8 w-8 text-[#374f56]" />
                    </div>
                  </div>
                )}

                {/* Body */}
                <div
                  className={`bg-[#005c4b] px-3 py-2 ${
                    form.header_type === "NONE" ? "rounded-t-lg" : ""
                  } ${!form.footer_text && form.buttons.length === 0 ? "rounded-b-lg" : ""}`}
                >
                  <p className="text-[13px] text-white leading-relaxed whitespace-pre-wrap">
                    {previewBody || (es ? "Escribe el cuerpo del mensaje..." : "Type the message body...")}
                  </p>
                </div>

                {/* Footer */}
                {form.footer_text && (
                  <div className={`bg-[#005c4b] px-3 pb-2 ${form.buttons.length === 0 ? "rounded-b-lg" : ""}`}>
                    <p className="text-[11px] text-white/60">{form.footer_text}</p>
                  </div>
                )}

                {/* Buttons */}
                {form.buttons.length > 0 && (
                  <div className="rounded-b-lg bg-[#005c4b] px-2 pb-2 space-y-1">
                    {form.buttons.map((btn, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#00413a] py-2 text-xs text-[#53bdeb]"
                      >
                        {btn.text || (es ? "Botón" : "Button")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Variable count info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                {es ? "Variables detectadas:" : "Variables detected:"}{" "}
                <span className="font-medium text-foreground">{variableCount}</span>
              </p>
              {variableNumbers.map((num) => {
                const mapping = form.variable_mapping[num];
                return (
                  <p key={num} className="font-mono">
                    {`{{${num}}}`} → {mapping || (es ? "(sin mapear)" : "(unmapped)")}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
