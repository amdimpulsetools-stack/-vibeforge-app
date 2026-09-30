"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bold,
  Italic,
  Loader2,
  MessageSquare,
  RotateCcw,
  Save,
  Smile,
  Strikethrough,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CLIPBOARD_TEMPLATE_KINDS,
  ClipboardTemplateSaveError,
  DEFAULT_TEMPLATES,
  MIG_274_CLIPBOARD_KINDS,
  TEMPLATE_VARIABLES,
  buildMessage,
  loadAllTemplatesFromDb,
  loadWaClipboardConfig,
  saveTemplateToDb,
  saveWaClipboardConfig,
  type ClipboardTemplateKind,
} from "@/lib/whatsapp-clipboard-config";

// ─────────────────────────────────────────────────────────────────────
// Curated emoji palette
// ─────────────────────────────────────────────────────────────────────
const EMOJIS = [
  "✅",
  "❌",
  "📅",
  "⏰",
  "📍",
  "💚",
  "🩺",
  "💊",
  "🧪",
  "🤰",
  "👶",
  "🎯",
  "⚠️",
  "📝",
  "🔔",
  "☝️",
  "🙌",
  "👋",
  "✨",
  "🤝",
  "💬",
  "📞",
  "📲",
  "🏥",
  "❤️",
];

// ─────────────────────────────────────────────────────────────────────
// WhatsApp → HTML formatting (escape first, then apply)
// ─────────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function whatsappToHtml(raw: string): string {
  const escaped = escapeHtml(raw);
  // Order: bold (*) → italic (_) → strike (~). Greedy-but-bounded by same char.
  return escaped
    .replace(/\*([^\n*]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^\n_]+)_/g, "<em>$1</em>")
    .replace(/~([^\n~]+)~/g, "<s>$1</s>");
}

// ─────────────────────────────────────────────────────────────────────
// Tab labels
// ─────────────────────────────────────────────────────────────────────
const TAB_LABELS: Record<
  ClipboardTemplateKind,
  { es: string; en: string }
> = {
  post_appointment: { es: "Post-cita", en: "Post-appointment" },
  second_consultation_followup: {
    es: "Seguimiento 2da consulta",
    en: "2nd consultation follow-up",
  },
  budget_followup: {
    es: "Seguimiento presupuesto",
    en: "Budget follow-up",
  },
  reschedule_notice: {
    es: "Aviso al cancelar para reprogramar",
    en: "Cancellation notice (reschedule)",
  },
  reschedule_coordinate: {
    es: "Coordinar reprogramación (bandeja)",
    en: "Coordinate reschedule (inbox)",
  },
  prereserva: {
    es: "Pre-reserva de horario",
    en: "Slot pre-booking",
  },
};

/**
 * Ayuda de las plantillas de la mig 274 (dónde se usa cada una). Las
 * existentes no llevan texto de ayuda — se quedan como estaban.
 */
const KIND_HELP: Partial<
  Record<ClipboardTemplateKind, { es: string; en: string }>
> = {
  reschedule_notice: {
    es: "Se usa en el botón «Avisar por WhatsApp» al cancelar una cita como «Reprogramará». Si falta el servicio o la hora, esa parte se omite sola.",
    en: "Used by the “Notify via WhatsApp” button when an appointment is cancelled as “Will reschedule”. Missing service or time is left out automatically.",
  },
  reschedule_coordinate: {
    es: "Se usa en el WhatsApp de las tarjetas «Por reprogramar» de la bandeja de seguimientos, para coordinar la nueva fecha.",
    en: "Used by the WhatsApp button on “To reschedule” cards in the follow-up inbox, to agree on a new date.",
  },
  prereserva: {
    es: "Se usa al pre-reservar un horario mientras la paciente paga. {{VENCE}} es la hora límite de la pre-reserva y {{MONTO}} el total a pagar; si el monto o el servicio vienen vacíos, esa parte se omite sola.",
    en: "Used when a slot is pre-booked while the patient pays. {{VENCE}} is the hold deadline and {{MONTO}} the amount due; empty amount or service is left out automatically.",
  },
};

const MIG_274_KIND_SET = new Set<ClipboardTemplateKind>(MIG_274_CLIPBOARD_KINDS);

export default function WhatsAppClipboardTab() {
  const { language } = useLanguage();
  const { organization } = useOrganization();
  const { hasAddon, loading: addonsLoading } = useOrgAddons();

  // ── per-device "enabled" toggle (localStorage) ─────────────────────
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setEnabled(loadWaClipboardConfig().enabled);
  }, []);

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    saveWaClipboardConfig({ enabled: next });
    toast.success(
      next
        ? language === "es"
          ? "Modal de WhatsApp activado"
          : "WhatsApp modal enabled"
        : language === "es"
          ? "Modal de WhatsApp desactivado"
          : "WhatsApp modal disabled"
    );
  };

  // ── visible kinds (gated by addons) ────────────────────────────────
  const fertilityEnabled =
    hasAddon("fertility_basic") || hasAddon("fertility_premium");

  const visibleKinds = useMemo<ClipboardTemplateKind[]>(() => {
    return CLIPBOARD_TEMPLATE_KINDS.filter((k) => {
      if (k === "post_appointment") return true;
      // Plantillas de agenda (mig 274): para todas las orgs.
      if (MIG_274_KIND_SET.has(k)) return true;
      return fertilityEnabled;
    });
  }, [fertilityEnabled]);

  // ── templates state (per-kind) ─────────────────────────────────────
  const [templates, setTemplates] = useState<
    Record<ClipboardTemplateKind, string>
  >({ ...DEFAULT_TEMPLATES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ClipboardTemplateKind | null>(null);
  // Kinds cuyo guardado devolvió 409 (la base aún no tiene la mig 274).
  const [needsMigration, setNeedsMigration] = useState<
    Set<ClipboardTemplateKind>
  >(() => new Set());
  const [activeTab, setActiveTab] = useState<ClipboardTemplateKind>(
    "post_appointment"
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Una sola petición: la API devuelve todos los kinds (antes eran
        // N GET idénticos, uno por kind). Mismo fallback: default si falla.
        const all = await loadAllTemplatesFromDb();
        if (cancelled) return;
        setTemplates((prev) => ({ ...prev, ...all }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the user loses the addon while on a hidden tab, snap back.
  useEffect(() => {
    if (!visibleKinds.includes(activeTab)) {
      setActiveTab("post_appointment");
    }
  }, [visibleKinds, activeTab]);

  // ── textarea refs (per kind) for cursor-aware insertion ───────────
  const textareaRefs = useRef<
    Record<ClipboardTemplateKind, HTMLTextAreaElement | null>
  >({
    post_appointment: null,
    second_consultation_followup: null,
    budget_followup: null,
    reschedule_notice: null,
    reschedule_coordinate: null,
    prereserva: null,
  });

  const setTemplateForKind = useCallback(
    (kind: ClipboardTemplateKind, value: string) => {
      setTemplates((prev) => ({ ...prev, [kind]: value }));
    },
    []
  );

  /**
   * Insert `text` at the current cursor position of the given kind's
   * textarea. Falls back to appending if the textarea is unmounted.
   */
  const insertAtCursor = useCallback(
    (kind: ClipboardTemplateKind, text: string) => {
      const el = textareaRefs.current[kind];
      const current = templates[kind];
      if (!el) {
        setTemplateForKind(kind, current + text);
        return;
      }
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const next = current.slice(0, start) + text + current.slice(end);
      setTemplateForKind(kind, next);
      // Restore cursor after React commits the new value.
      requestAnimationFrame(() => {
        const node = textareaRefs.current[kind];
        if (!node) return;
        const pos = start + text.length;
        node.focus();
        node.setSelectionRange(pos, pos);
      });
    },
    [templates, setTemplateForKind]
  );

  /**
   * Wrap the current textarea selection with the given marker (e.g. "*").
   * If nothing is selected, inserts the markers and places the caret
   * between them.
   */
  const wrapSelection = useCallback(
    (kind: ClipboardTemplateKind, marker: string) => {
      const el = textareaRefs.current[kind];
      const current = templates[kind];
      if (!el) {
        setTemplateForKind(kind, current + marker + marker);
        return;
      }
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const selected = current.slice(start, end);
      const before = current.slice(0, start);
      const after = current.slice(end);
      const next = before + marker + selected + marker + after;
      setTemplateForKind(kind, next);
      requestAnimationFrame(() => {
        const node = textareaRefs.current[kind];
        if (!node) return;
        node.focus();
        if (selected.length === 0) {
          const pos = start + marker.length;
          node.setSelectionRange(pos, pos);
        } else {
          node.setSelectionRange(
            start + marker.length,
            end + marker.length
          );
        }
      });
    },
    [templates, setTemplateForKind]
  );

  // ── save / reset ───────────────────────────────────────────────────
  const handleSave = async (kind: ClipboardTemplateKind) => {
    setSaving(kind);
    try {
      await saveTemplateToDb(kind, templates[kind]);
      setNeedsMigration((prev) => {
        if (!prev.has(kind)) return prev;
        const next = new Set(prev);
        next.delete(kind);
        return next;
      });
      toast.success(
        language === "es"
          ? "Plantilla guardada"
          : "Template saved"
      );
    } catch (err) {
      if (err instanceof ClipboardTemplateSaveError && err.status === 409) {
        setNeedsMigration((prev) => new Set(prev).add(kind));
      }
      toast.error(
        err instanceof Error
          ? err.message
          : language === "es"
            ? "No se pudo guardar la plantilla"
            : "Could not save the template"
      );
    } finally {
      setSaving(null);
    }
  };

  const handleReset = (kind: ClipboardTemplateKind) => {
    setTemplateForKind(kind, DEFAULT_TEMPLATES[kind]);
    toast.success(
      language === "es" ? "Plantilla restaurada" : "Template restored"
    );
  };

  // ── preview rendering ──────────────────────────────────────────────
  const previewHtml = (kind: ClipboardTemplateKind): string => {
    const tpl = templates[kind];
    const clinicName = organization?.name || "Mi Clínica";
    const clinicAddress = organization?.address || "Av. Principal 123";
    let raw = "";
    switch (kind) {
      case "post_appointment":
        raw = buildMessage("post_appointment", tpl, {
          patientName: "María García",
          date: "20/03/2026",
          time: "10:30",
          doctorName: "Dr. López",
          serviceName: "Consulta general",
          clinicName,
          clinicAddress,
        });
        break;
      case "second_consultation_followup":
        raw = buildMessage("second_consultation_followup", tpl, {
          patientName: "María García",
          clinicName,
          doctorName: "Dr. López",
        });
        break;
      case "budget_followup":
        raw = buildMessage("budget_followup", tpl, {
          patientName: "María García",
          clinicName,
          treatmentType: "FIV",
        });
        break;
      case "reschedule_notice":
      case "reschedule_coordinate":
        raw = buildMessage(kind, tpl, {
          NOMBRE: "María García",
          CLINICA: clinicName,
          SERVICIO: "Consulta general",
          FECHA: "20/03",
          HORA: "10:30",
        });
        break;
      case "prereserva":
        raw = buildMessage("prereserva", tpl, {
          NOMBRE: "María García",
          CLINICA: clinicName,
          SERVICIO: "Consulta general",
          DOCTOR: "Dr. López",
          FECHA: "jueves 20/03",
          HORA: "10:30",
          VENCE: "15:30",
          MONTO: "S/ 150.00",
        });
        break;
    }
    return whatsappToHtml(raw);
  };

  // ── rendering helpers ──────────────────────────────────────────────
  const showLoadingSkeleton = loading || addonsLoading;

  const renderEditor = (kind: ClipboardTemplateKind) => {
    const vars = TEMPLATE_VARIABLES[kind];
    const isSaving = saving === kind;
    const help = KIND_HELP[kind];

    return (
      <div className="space-y-6">
        {help && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {language === "es" ? help.es : help.en}
            </p>
          </div>
        )}
        {needsMigration.has(kind) && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              {language === "es"
                ? "Actualiza la base (mig 274) para editar esta plantilla. Mientras tanto se usa el texto de fábrica."
                : "Update the database (migration 274) to edit this template. The default text is used meanwhile."}
            </p>
          </div>
        )}
        {/* Variables chips */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">
              {language === "es"
                ? "Variables disponibles"
                : "Available variables"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {language === "es"
                ? "Haz clic en una variable para insertarla en la posición del cursor"
                : "Click a variable to insert it at the cursor position"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {vars.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertAtCursor(kind, v.key)}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-500/10 hover:border-emerald-500/50"
              >
                <span className="font-mono">{v.key}</span>
                <span className="text-muted-foreground">
                  — {v.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Template editor */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold">
                {language === "es"
                  ? "Plantilla del mensaje"
                  : "Message template"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {language === "es"
                  ? "Personaliza el mensaje que se copiará al portapapeles"
                  : "Customize the message that will be copied to clipboard"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleReset(kind)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {language === "es" ? "Restaurar" : "Reset"}
              </button>
              <button
                type="button"
                onClick={() => handleSave(kind)}
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-medium text-white transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {language === "es" ? "Guardar" : "Save"}
              </button>
            </div>
          </div>

          {/* Toolbar: emoji + B/I/S */}
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={
                    language === "es" ? "Insertar emoji" : "Insert emoji"
                  }
                >
                  <Smile className="h-3.5 w-3.5" />
                  {language === "es" ? "Emoji" : "Emoji"}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <div className="grid grid-cols-5 gap-1">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertAtCursor(kind, e)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-base hover:bg-accent transition-colors"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => wrapSelection(kind, "*")}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={language === "es" ? "Negrita" : "Bold"}
              title={language === "es" ? "Negrita" : "Bold"}
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection(kind, "_")}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={language === "es" ? "Cursiva" : "Italic"}
              title={language === "es" ? "Cursiva" : "Italic"}
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection(kind, "~")}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={language === "es" ? "Tachado" : "Strikethrough"}
              title={language === "es" ? "Tachado" : "Strikethrough"}
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </button>
          </div>

          <textarea
            ref={(el) => {
              textareaRefs.current[kind] = el;
            }}
            value={templates[kind]}
            onChange={(e) => setTemplateForKind(kind, e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors resize-none font-mono leading-relaxed"
            placeholder={DEFAULT_TEMPLATES[kind]}
          />
        </div>

        {/* Live preview */}
        <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-3">
          <h3 className="text-sm font-semibold">
            {language === "es" ? "Vista previa" : "Preview"}
          </h3>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: previewHtml(kind) }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {language === "es"
              ? "Así se verá el mensaje con datos de ejemplo (formato WhatsApp)"
              : "This is how the message will look with sample data (WhatsApp formatting)"}
          </p>
        </div>
      </div>
    );
  };

  // ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header: enable/disable toggle (always visible) */}
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <label className="flex items-center justify-between select-none cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <MessageSquare className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {language === "es"
                  ? "Modal de copia rápida para WhatsApp"
                  : "WhatsApp quick-copy modal"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === "es"
                  ? "Muestra un modal después de crear una cita para copiar un mensaje pre-formateado y pegarlo en WhatsApp"
                  : "Shows a modal after creating an appointment to copy a pre-formatted message for WhatsApp"}
              </p>
            </div>
          </div>
          <div className="relative ml-4 shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => handleToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-emerald-500 transition-colors" />
            <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </div>
        </label>
      </div>

      {/* Editors */}
      {showLoadingSkeleton ? (
        <div className="space-y-4">
          <div className="animate-pulse rounded-2xl bg-muted h-40" />
          <div className="animate-pulse rounded-2xl bg-muted h-40" />
        </div>
      ) : visibleKinds.length === 1 ? (
        // Only post_appointment is available — render editor without tabs.
        renderEditor("post_appointment")
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ClipboardTemplateKind)}
        >
          <TabsList className="flex-wrap h-auto">
            {visibleKinds.map((k) => (
              <TabsTrigger key={k} value={k}>
                {language === "es" ? TAB_LABELS[k].es : TAB_LABELS[k].en}
              </TabsTrigger>
            ))}
          </TabsList>
          {visibleKinds.map((k) => (
            <TabsContent key={k} value={k}>
              {renderEditor(k)}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
