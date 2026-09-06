"use client";

/**
 * Modal de ORDEN DE EXAMEN — atajo desde la cita (agenda) y desde el drawer
 * del paciente, sin pasar por la historia clínica.
 *
 * Dos paneles: izquierda el catálogo de la organización (agrupado por
 * categoría) más "examen libre", diagnóstico presuntivo, CIE-10 y notas;
 * derecha los exámenes que ya entraron a la orden, con las indicaciones
 * prellenadas desde `exam_catalog.default_instructions` y editables.
 *
 * Guarda UNA orden (`exam_orders` + `exam_order_items`, mig 078) y la
 * imprime con la ruta que ya existe, `/api/pdf/exam-order/[orderId]`.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FlaskConical, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { cn } from "@/lib/utils";

export interface ExamOrderComposerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  /** Médico firmante. En la agenda es el doctor de la cita, no el usuario. */
  doctorId: string;
  doctorName?: string;
  /** Sin cita (drawer del paciente) va `null`. */
  appointmentId?: string | null;
  onSaved?: (orderId: string) => void;
}

interface CatalogItem {
  id: string;
  name: string;
  code: string | null;
  default_instructions: string | null;
  category_id: string;
}

interface Category {
  id: string;
  name: string;
}

interface DraftExam {
  key: string;
  exam_catalog_id: string | null;
  exam_name: string;
  instructions: string;
}

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function ExamOrderComposerModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  doctorId,
  doctorName,
  appointmentId = null,
  onSaved,
}: ExamOrderComposerModalProps) {
  const { organizationId } = useOrganization();

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [items, setItems] = useState<DraftExam[]>([]);
  const [search, setSearch] = useState("");
  const [customExam, setCustomExam] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset al abrir: el modal se monta una vez por pantalla y se reutiliza.
  useEffect(() => {
    if (!open) return;
    setItems([]);
    setSearch("");
    setCustomExam("");
    setDiagnosis("");
    setDiagnosisCode("");
    setNotes("");
    setSaving(false);
  }, [open]);

  // Catálogo de la org (el RLS de mig 078 ya lo limita a las orgs del
  // usuario; `organizationId` solo evita disparar la consulta antes de que
  // el proveedor de organización resuelva).
  useEffect(() => {
    if (!open || !organizationId) return;
    let cancelled = false;
    const load = async () => {
      setLoadingCatalog(true);
      const supabase = createClient();
      const [catRes, examRes] = await Promise.all([
        supabase
          .from("exam_categories")
          .select("id, name")
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("exam_catalog")
          .select("id, name, code, default_instructions, category_id")
          .eq("is_active", true)
          .order("display_order"),
      ]);
      if (cancelled) return;
      setCategories((catRes.data ?? []) as Category[]);
      setCatalog((examRes.data ?? []) as CatalogItem[]);
      setLoadingCatalog(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, organizationId]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.code ?? "").toLowerCase().includes(q),
    );
  }, [catalog, search]);

  const groups = useMemo(
    () =>
      categories
        .map((cat) => ({
          category: cat,
          exams: filteredCatalog.filter((e) => e.category_id === cat.id),
        }))
        .filter((g) => g.exams.length > 0),
    [categories, filteredCatalog],
  );

  const addFromCatalog = (exam: CatalogItem) => {
    if (items.some((i) => i.exam_catalog_id === exam.id)) return;
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        exam_catalog_id: exam.id,
        exam_name: exam.name,
        instructions: exam.default_instructions ?? "",
      },
    ]);
    setSearch("");
  };

  const addCustom = () => {
    const name = customExam.trim();
    if (!name) return;
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), exam_catalog_id: null, exam_name: name, instructions: "" },
    ]);
    setCustomExam("");
  };

  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((i) => i.key !== key));

  const updateInstructions = (key: string, instructions: string) =>
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, instructions } : i)),
    );

  // Cerrar (Esc, clic fuera, "Cancelar") con exámenes ya agregados pide
  // confirmación: la orden no se guarda hasta "Guardar".
  const handleOpenChange = (next: boolean) => {
    if (!next && !saving && items.length > 0) {
      const ok = window.confirm(
        "Tienes exámenes sin guardar en esta orden. ¿Cerrar y descartarlos?",
      );
      if (!ok) return;
    }
    onOpenChange(next);
  };

  const save = async (print: boolean) => {
    if (items.length === 0 || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/exam-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_id: appointmentId || null,
          clinical_note_id: null,
          diagnosis: diagnosis.trim() || null,
          diagnosis_code: diagnosisCode.trim() || null,
          notes: notes.trim() || null,
          items: items.map((i) => ({
            exam_catalog_id: i.exam_catalog_id,
            exam_name: i.exam_name,
            instructions: i.instructions.trim() || null,
          })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo crear la orden de exámenes");
        setSaving(false);
        return;
      }

      const orderId = json.data?.id;
      toast.success(
        items.length === 1
          ? "Orden de examen creada"
          : `Orden creada · ${items.length} exámenes`,
      );
      if (orderId) onSaved?.(orderId);
      onOpenChange(false);

      if (print) {
        if (!orderId) {
          toast.info("La orden se guardó, pero no se pudo abrir el PDF.");
        } else {
          const win = window.open(
            `/api/pdf/exam-order/${orderId}`,
            "_blank",
            "noopener",
          );
          if (!win) {
            toast.info(
              "La orden se guardó, pero el navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e imprímela desde la historia clínica.",
            );
          }
        }
      }
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Orden de examen
          </DialogTitle>
          <DialogDescription>
            {patientName}
            {doctorName ? ` · ${doctorName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[1.15fr_1fr] md:overflow-hidden">
          {/* ── Panel izquierdo: catálogo + datos de la orden ─────────── */}
          <section className="space-y-4 border-border px-5 py-4 md:overflow-y-auto md:border-r">
            <div>
              <p className={labelClass}>Orden de examen</p>
              <h3 className="mt-0.5 text-sm font-semibold">
                Selección de exámenes
              </h3>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="exam-search">
                Buscar en el catálogo
              </label>
              <input
                id="exam-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hemograma, glucosa, ecografía…"
                autoComplete="off"
                className={inputClass}
              />

              <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background">
                {loadingCatalog ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : groups.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                    {catalog.length === 0
                      ? "El catálogo de exámenes está vacío. Configúralo en Admin → Catálogo de exámenes, o escribe un examen libre abajo."
                      : "No se encontraron exámenes con ese nombre."}
                  </p>
                ) : (
                  groups.map((g) => (
                    <div key={g.category.id}>
                      <div className="sticky top-0 bg-muted/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                        {g.category.name}
                      </div>
                      {g.exams.map((exam) => {
                        const already = items.some(
                          (i) => i.exam_catalog_id === exam.id,
                        );
                        return (
                          <button
                            key={exam.id}
                            type="button"
                            onClick={() => addFromCatalog(exam)}
                            disabled={already}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {exam.name}
                            </span>
                            {exam.code && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {exam.code}
                              </span>
                            )}
                            {already && (
                              <span className="shrink-0 text-[10px] font-medium text-primary">
                                Agregado
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Examen libre */}
            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="exam-custom">
                Examen libre
              </label>
              <div className="flex gap-2">
                <input
                  id="exam-custom"
                  value={customExam}
                  onChange={(e) => setCustomExam(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom();
                    }
                  }}
                  placeholder="Escribe un examen que no está en el catálogo"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={addCustom}
                  disabled={!customExam.trim()}
                  aria-label="Agregar examen libre a la orden"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="exam-dx">
                  Diagnóstico presuntivo
                </label>
                <input
                  id="exam-dx"
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  placeholder="Anemia por investigar"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="exam-cie">
                  Código CIE-10
                </label>
                <input
                  id="exam-cie"
                  value={diagnosisCode}
                  onChange={(e) => setDiagnosisCode(e.target.value)}
                  placeholder="D64.9"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="exam-notes">
                Notas de la orden (opcional)
              </label>
              <textarea
                id="exam-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Traer resultados a la próxima consulta"
                className={cn(inputClass, "resize-none")}
              />
            </div>
          </section>

          {/* ── Panel derecho: exámenes en la orden ───────────────────── */}
          <aside className="flex flex-col border-t border-border bg-muted/30 md:border-t-0 md:overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 px-5 py-4">
              <p className={labelClass}>Exámenes en la orden</p>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
                {items.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-2 px-5 pb-4 md:overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <FlaskConical className="h-6 w-6 text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground">
                    Sin exámenes aún.
                    <br />
                    Agrega el primero desde el catálogo.
                  </p>
                </div>
              ) : (
                items.map((i) => (
                  <div
                    key={i.key}
                    className="flex items-start gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="truncate text-sm font-semibold">
                        {i.exam_name}
                      </p>
                      <input
                        value={i.instructions}
                        onChange={(e) => updateInstructions(i.key, e.target.value)}
                        placeholder="Indicaciones (ej. en ayunas 8 horas)"
                        aria-label={`Indicaciones para ${i.exam_name}`}
                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(i.key)}
                      aria-label={`Quitar ${i.exam_name} de la orden`}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>

        {/* ── Pie ───────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border px-5 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "examen" : "exámenes"}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent md:h-10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => save(false)}
                disabled={items.length === 0 || saving}
                className="h-11 rounded-lg border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50 md:h-10"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={items.length === 0 || saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 md:h-10"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
                Guardar e imprimir
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
