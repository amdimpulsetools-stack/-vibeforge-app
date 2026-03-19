"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
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

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
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

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

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
                language={language}
                isAdmin={isOrgAdmin}
                onEdit={() => setEditingTemplate(template)}
                onDelete={async () => {
                  if (!confirm(es ? "¿Eliminar esta plantilla?" : "Delete this template?")) return;
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
                    toast.error(es ? "Error al sincronizar" : "Sync error");
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
  language,
  isAdmin,
  onEdit,
  onDelete,
  onSync,
  onSubmit,
}: {
  template: WhatsAppTemplate;
  language: string;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
  onSubmit: () => void;
}) {
  const es = language === "es";

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
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
  onBack,
  onSaved,
  language,
}: {
  template: WhatsAppTemplate | null;
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
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => insertVariable(n)}
                    disabled={!canEdit}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-xs font-mono text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                  >
                    {`{{${n}}}`}
                  </button>
                ))}
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
                placeholder={es ? "VibeForge - No responder a este mensaje" : "VibeForge - Do not reply to this message"}
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
                  <div key={num} className="grid grid-cols-[80px,1fr,1fr] gap-3 items-center">
                    <span className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {`{{${num}}}`}
                    </span>
                    <select
                      value={form.variable_mapping[num] || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          variable_mapping: { ...form.variable_mapping, [num]: e.target.value },
                        })
                      }
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
                      className={inputClass + " text-xs"}
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
