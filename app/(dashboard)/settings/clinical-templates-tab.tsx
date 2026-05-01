"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Pill,
  TestTube,
  ClipboardList,
  FileSignature,
  Loader2,
  Save,
  RotateCcw,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/rich-text-editor";

// ── Tipos ──────────────────────────────────────────────────────────

type TemplateSlug =
  | "prescription"
  | "clinical_note"
  | "exam_order"
  | "consent"
  | "treatment_plan";

interface ClinicalDocumentTemplate {
  id: string;
  slug: TemplateSlug;
  name: string;
  description: string | null;
  body_html: string;
  is_enabled: boolean;
}

interface SlugMeta {
  slug: TemplateSlug;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
  /** Lista de variables disponibles para el template (se inyectan al renderizar). */
  variables: { token: string; description: string }[];
}

// Por ahora solo prescription es funcional (POC). Las otras 4 se muestran
// deshabilitadas con badge "Próximamente" para mantener visibilidad del roadmap.
const SLUGS: SlugMeta[] = [
  {
    slug: "prescription",
    label: "Receta médica",
    icon: Pill,
    available: true,
    variables: [
      { token: "{{paciente_nombre}}", description: "Nombre completo del paciente" },
      { token: "{{paciente_dni}}", description: "DNI del paciente" },
      { token: "{{doctor_nombre}}", description: "Nombre del doctor tratante" },
      { token: "{{doctor_cmp}}", description: "Número de CMP del doctor" },
      { token: "{{fecha}}", description: "Fecha de la consulta" },
      { token: "{{clinica_nombre}}", description: "Nombre de la organización" },
    ],
  },
  {
    slug: "clinical_note",
    label: "Nota clínica SOAP",
    icon: FileText,
    available: false,
    variables: [],
  },
  {
    slug: "exam_order",
    label: "Orden de exámenes",
    icon: TestTube,
    available: false,
    variables: [],
  },
  {
    slug: "consent",
    label: "Consentimiento informado",
    icon: FileSignature,
    available: false,
    variables: [],
  },
  {
    slug: "treatment_plan",
    label: "Plan de tratamiento",
    icon: ClipboardList,
    available: false,
    variables: [],
  },
];

// ── Componente ─────────────────────────────────────────────────────

export default function ClinicalTemplatesTab() {
  const [templates, setTemplates] = useState<ClinicalDocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState<TemplateSlug | null>(null);
  const [draftHtml, setDraftHtml] = useState<string>("");
  const [draftEnabled, setDraftEnabled] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clinical-document-templates");
      if (!res.ok) throw new Error("No se pudieron cargar las plantillas");
      const json = await res.json();
      const list = (json.data ?? []) as ClinicalDocumentTemplate[];
      setTemplates(list);
      // Auto-seleccionar la primera disponible (prescription) AUNQUE no haya
      // fila aún. El editor a la derecha trabajará con defaults; el upsert
      // en PATCH crea la fila al primer guardado.
      if (!activeSlug) {
        const firstAvailable = SLUGS.find((s) => s.available);
        if (firstAvailable) {
          setActiveSlug(firstAvailable.slug);
          const found = list.find((t) => t.slug === firstAvailable.slug);
          setDraftHtml(found?.body_html ?? "");
          setDraftEnabled(found?.is_enabled ?? true);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [activeSlug]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const activeTemplate = templates.find((t) => t.slug === activeSlug) ?? null;
  const activeMeta = SLUGS.find((s) => s.slug === activeSlug);

  // Detectar cambios sin guardar. Si aún no hay fila en DB, comparamos contra
  // el estado "vacío inicial" (body_html='', is_enabled=true) para que el
  // botón Guardar se habilite cuando el usuario empiece a escribir.
  const baseHtml = activeTemplate?.body_html ?? "";
  const baseEnabled = activeTemplate?.is_enabled ?? true;
  const isDirty = draftHtml !== baseHtml || draftEnabled !== baseEnabled;

  const selectSlug = (slug: TemplateSlug) => {
    if (isDirty) {
      const ok = window.confirm("Hay cambios sin guardar. ¿Descartar?");
      if (!ok) return;
    }
    const tpl = templates.find((t) => t.slug === slug);
    setActiveSlug(slug);
    setDraftHtml(tpl?.body_html ?? "");
    setDraftEnabled(tpl?.is_enabled ?? true);
  };

  const handleSave = async () => {
    if (!activeSlug) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clinical-document-templates/${activeSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body_html: draftHtml,
          is_enabled: draftEnabled,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "No se pudo guardar");
      }
      const json = await res.json();
      const updated = json.data as ClinicalDocumentTemplate;
      // Insert si la fila no existía, replace si sí. Mantenemos el array
      // ordenado por slug.
      setTemplates((prev) => {
        const filtered = prev.filter((t) => t.slug !== updated.slug);
        return [...filtered, updated].sort((a, b) => a.slug.localeCompare(b.slug));
      });
      toast.success("Plantilla guardada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraftHtml(activeTemplate?.body_html ?? "");
    setDraftEnabled(activeTemplate?.is_enabled ?? true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Plantillas de Historia Clínica</h2>
            <p className="text-sm text-muted-foreground">
              Personaliza el cuerpo de los documentos que generas (recetas, notas, órdenes,
              consentimientos, planes). El membrete con el logo y datos de la organización
              se aplica automáticamente desde tu perfil. Puedes incluir variables como{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{`{{paciente_nombre}}`}</code>{" "}
              que se reemplazan al imprimir.
            </p>
          </div>
        </div>
      </div>

      {/* Banner del estado del POC — sé claro sobre qué está disponible */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">
            Disponible ahora: <span className="text-emerald-700 dark:text-emerald-400">Receta médica</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Los otros 4 documentos (nota clínica, orden de exámenes, consentimiento, plan
            de tratamiento) llegarán en próximas iteraciones. Por ahora aparecen marcados
            con &quot;Pronto&quot; en gris.
          </p>
        </div>
      </div>

      {/* Layout 2-col: lista de plantillas + editor */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar: lista de plantillas */}
        <aside className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2">
            Documentos
          </h3>
          {SLUGS.map((meta) => {
            const Icon = meta.icon;
            const isActive = activeSlug === meta.slug;
            const tpl = templates.find((t) => t.slug === meta.slug);
            return (
              <button
                key={meta.slug}
                type="button"
                disabled={!meta.available}
                onClick={() => meta.available && selectSlug(meta.slug)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                  meta.available
                    ? isActive
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "hover:bg-accent border border-transparent"
                    : "cursor-not-allowed opacity-50 border border-transparent"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                  <span className="text-sm font-medium truncate">{meta.label}</span>
                </div>
                {!meta.available ? (
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                    Pronto
                  </span>
                ) : tpl && !tpl.is_enabled ? (
                  <Lock className="h-3 w-3 text-muted-foreground/60" />
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Activa
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Editor */}
        <div className="space-y-4">
          {!activeMeta ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 py-20 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                Selecciona una plantilla a la izquierda.
              </p>
            </div>
          ) : (
            <>
              {/* Header del editor */}
              <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold">{activeMeta.label}</h3>
                    {activeTemplate?.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activeTemplate.description}
                      </p>
                    ) : !activeTemplate ? (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        Plantilla aún no inicializada para tu organización. Edítala y
                        guarda — se creará automáticamente.
                      </p>
                    ) : null}
                  </div>
                  {/* Toggle habilitar */}
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <span className="text-muted-foreground">
                      {draftEnabled ? "Habilitada" : "Deshabilitada"}
                    </span>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={draftEnabled}
                        onChange={(e) => setDraftEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
                      <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                    </div>
                  </label>
                </div>

                {!draftEnabled && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                    Cuando está deshabilitada, los documentos se imprimen con el cuerpo
                    default del sistema (no con tu personalización).
                  </div>
                )}

                {/* Variables disponibles */}
                {activeMeta.variables.length > 0 && (
                  <div className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                      Variables disponibles (click para copiar):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {activeMeta.variables.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(v.token);
                            toast.success(`${v.token} copiado`);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-mono hover:bg-accent transition-colors"
                          title={v.description}
                        >
                          {v.token}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Editor TipTap */}
              <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
                <label className="text-sm font-semibold">Cuerpo del documento</label>
                <RichTextEditor
                  ref={editorRef}
                  value={draftHtml}
                  onChange={setDraftHtml}
                  minHeight={300}
                />
                <p className="text-[11px] text-muted-foreground">
                  El listado de medicamentos / SOAP / ítems específicos se renderiza
                  automáticamente por el sistema. Aquí solo personalizas el contenido
                  alrededor (encabezado adicional, indicaciones generales, footer legal).
                </p>
              </div>

              {/* Footer con CTAs */}
              <div className="flex items-center justify-end gap-2">
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Descartar
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Guardar plantilla
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
