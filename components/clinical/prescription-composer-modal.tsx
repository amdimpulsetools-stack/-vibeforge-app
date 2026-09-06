"use client";

/**
 * Modal de RECETA — atajo desde la cita (agenda) y desde el drawer del
 * paciente, sin pasar por la historia clínica.
 *
 * Dos paneles: izquierda el formulario de un medicamento, derecha la lista
 * de lo que ya entró a la receta. Todos los medicamentos del gesto se
 * guardan juntos y comparten un `batch_id` (mig 247) para que el PDF
 * `/api/pdf/prescription/batch/[batchId]` imprima ESE lote — antes el PDF
 * agrupaba "todo lo activo de la cita" y sin cita no había nada que
 * imprimir.
 *
 * Layout: el modal es ANCHO y bajo (feedback del founder, 5-sep: "está muy
 * alto el modal, quizá ancharlo más"). El formulario va en dos columnas a
 * partir de `md` para que en un portátil de 1366×768 entre sin scroll;
 * debajo de `md` vuelve a una sola columna.
 *
 * Medicamento: se busca en el catálogo de la org (mig 248) y, si ahí no hay
 * coincidencias, en lo que la org ya recetó antes. Ver
 * `./use-medication-catalog.ts`. Texto libre siempre vale.
 *
 * Mapeo modal → columnas de `prescriptions`:
 *   Medicamento          → medication
 *   Concentración        → dosage            ("500 mg")
 *   Forma farmacéutica   → pharmaceutical_form
 *   Cantidad por toma    → dose_per_take     ("1 tableta")
 *   Vía                  → route
 *   Frecuencia           → frequency
 *   Duración             → duration
 *   Cantidad total       → quantity
 *   Indicaciones         → instructions
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Pill, Plus, Printer, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganization } from "@/components/organization-provider";
import { useOrgToday } from "@/hooks/use-org-today";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import {
  sanitizeLikeTerm,
  saveDraftsToCatalog,
  useMedicationSearch,
  type CatalogDraft,
  type MedicationSuggestion,
} from "./use-medication-catalog";

export interface PrescriptionComposerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  /** Médico firmante. En la agenda es el doctor de la cita, no el usuario. */
  doctorId: string;
  doctorName?: string;
  /** Sin cita (drawer del paciente) va `null`. */
  appointmentId?: string | null;
  onSaved?: (batchId: string) => void;
}

/** Forma farmacéutica + cómo se dice en "1 tableta" / "2 tabletas". */
const PHARMACEUTICAL_FORMS: { value: string; one: string; many: string }[] = [
  { value: "Tableta", one: "tableta", many: "tabletas" },
  { value: "Cápsula", one: "cápsula", many: "cápsulas" },
  { value: "Jarabe", one: "cucharada", many: "cucharadas" },
  { value: "Suspensión", one: "cucharada", many: "cucharadas" },
  { value: "Gotas", one: "gota", many: "gotas" },
  { value: "Ampolla", one: "ampolla", many: "ampollas" },
  { value: "Crema", one: "aplicación", many: "aplicaciones" },
  { value: "Gel", one: "aplicación", many: "aplicaciones" },
  { value: "Óvulo", one: "óvulo", many: "óvulos" },
  { value: "Supositorio", one: "supositorio", many: "supositorios" },
  { value: "Inhalador", one: "inhalación", many: "inhalaciones" },
  { value: "Parche", one: "parche", many: "parches" },
  { value: "Sobre", one: "sobre", many: "sobres" },
  { value: "Otro", one: "unidad", many: "unidades" },
];

const ROUTES = [
  "Oral",
  "Sublingual",
  "Tópica",
  "Intramuscular",
  "Intravenosa",
  "Subcutánea",
  "Vaginal",
  "Rectal",
  "Oftálmica",
  "Ótica",
  "Nasal",
  "Inhalatoria",
] as const;

const FREQUENCIES = [
  "Cada 4 horas",
  "Cada 6 horas",
  "Cada 8 horas",
  "Cada 12 horas",
  "Una vez al día",
  "Dos veces al día",
  "Tres veces al día",
  "Según necesidad",
] as const;

const DURATIONS = [
  "3 días",
  "5 días",
  "7 días",
  "10 días",
  "14 días",
  "21 días",
  "1 mes",
  "3 meses",
  "6 meses",
  "Tratamiento continuo",
] as const;

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

const chipClass = (active: boolean) =>
  cn(
    "min-h-9 rounded-lg border px-3 py-1.5 text-xs transition-colors",
    active
      ? "border-primary bg-primary/10 font-semibold text-primary"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

interface DraftItem {
  key: string;
  medication: string;
  dosage: string;
  pharmaceutical_form: string;
  dose_per_take: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
  /** Solo UI: de qué fila del catálogo salió. `prescriptions` no lo guarda. */
  catalogId: string | null;
  /** Solo UI: escrito a mano y marcado para sumarlo al catálogo al guardar. */
  saveToCatalog: boolean;
}

/**
 * Normaliza un valor del catálogo contra las opciones del modal.
 *
 * El catálogo es texto libre ("tableta", "ORAL"): si coincide sin distinguir
 * mayúsculas se usa la opción del modal; si no coincide con nada se devuelve
 * tal cual y el `select`/chip lo muestra como opción extra, en vez de
 * descartar en silencio lo que la clínica configuró.
 */
function matchOption(
  value: string | null | undefined,
  options: readonly string[],
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return options.find((o) => o.toLowerCase() === raw.toLowerCase()) ?? raw;
}

/** "2 cucharadas" → 2. Sin número al inicio no toca el stepper. */
function parseDosePerTake(value: string | null | undefined): number | null {
  const match = /^\s*(\d{1,2})\b/.exec(value ?? "");
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 99 ? n : null;
}

/** Código legible del lote: RX-XXXXXXXX a partir del uuid del batch. */
function batchCode(batchId: string): string {
  return `RX-${batchId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function PrescriptionComposerModal({
  open,
  onOpenChange,
  patientId,
  patientName,
  doctorId,
  doctorName,
  appointmentId = null,
  onSaved,
}: PrescriptionComposerModalProps) {
  // Fecha civil de la org (CLAUDE.md): `new Date().toISOString()` en Vercel
  // (UTC) estampa mañana en cualquier receta hecha después de las 19:00 Lima.
  const { today: orgToday } = useOrgToday();
  const { organizationId, orgRole, isOrgAdmin } = useOrganization();
  const { user } = useUser();

  // RLS de la mig 248: escriben owner/admin y doctores.
  const canWriteCatalog = isOrgAdmin || orgRole === "doctor";

  const [batchId, setBatchId] = useState<string>("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Formulario del medicamento en curso
  const [medication, setMedication] = useState("");
  const [medicationFocused, setMedicationFocused] = useState(false);
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [saveToCatalog, setSaveToCatalog] = useState(false);
  const [dosage, setDosage] = useState("");
  const [form, setForm] = useState("");
  const [dosePerTake, setDosePerTake] = useState(1);
  const [route, setRoute] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [instructions, setInstructions] = useState("");

  const { suggestions, searched } = useMedicationSearch(
    medication,
    open && medicationFocused,
    organizationId,
  );

  const resetForm = useCallback(() => {
    setMedication("");
    setCatalogId(null);
    setSaveToCatalog(false);
    setDosage("");
    setForm("");
    setDosePerTake(1);
    setRoute("");
    setFrequency("");
    setDuration("");
    setQuantity("");
    setInstructions("");
  }, []);

  // Reset al abrir: el modal se monta una vez por pantalla y se reutiliza,
  // así que sin esto la segunda receta arrancaría con el lote de la primera.
  useEffect(() => {
    if (!open) return;
    setBatchId(crypto.randomUUID());
    setItems([]);
    setSaving(false);
    resetForm();
  }, [open, resetForm]);

  const formMeta = useMemo(
    () =>
      PHARMACEUTICAL_FORMS.find(
        (f) => f.value.toLowerCase() === form.toLowerCase(),
      ) ?? null,
    [form],
  );

  // Opciones + lo que venga del catálogo y no esté en la lista del modal.
  const formOptions = useMemo(() => {
    const base = PHARMACEUTICAL_FORMS.map((f) => f.value);
    return form && !base.includes(form) ? [...base, form] : base;
  }, [form]);
  const routeOptions = useMemo<readonly string[]>(
    () =>
      route && !(ROUTES as readonly string[]).includes(route)
        ? [...ROUTES, route]
        : ROUTES,
    [route],
  );
  const frequencyOptions = useMemo<readonly string[]>(
    () =>
      frequency && !(FREQUENCIES as readonly string[]).includes(frequency)
        ? [...FREQUENCIES, frequency]
        : FREQUENCIES,
    [frequency],
  );
  const durationOptions = useMemo<readonly string[]>(
    () =>
      duration && !(DURATIONS as readonly string[]).includes(duration)
        ? [...DURATIONS, duration]
        : DURATIONS,
    [duration],
  );

  const doseLabel = useMemo(() => {
    const unit = formMeta
      ? dosePerTake === 1
        ? formMeta.one
        : formMeta.many
      : dosePerTake === 1
        ? "unidad"
        : "unidades";
    return `${dosePerTake} ${unit}`;
  }, [formMeta, dosePerTake]);

  const applySuggestion = (s: MedicationSuggestion) => {
    setMedication(s.name);
    setMedicationFocused(false);
    setSaveToCatalog(false);
    const item = s.item;
    if (!item) {
      // Nombre de una receta anterior: solo el nombre, sin valores por defecto.
      setCatalogId(null);
      return;
    }
    setCatalogId(item.id);
    setDosage((item.concentration ?? "").trim());
    setForm(matchOption(item.pharmaceutical_form, PHARMACEUTICAL_FORMS.map((f) => f.value)));
    setRoute(matchOption(item.route, ROUTES));
    setFrequency(matchOption(item.frequency, FREQUENCIES));
    setDuration(matchOption(item.duration, DURATIONS));
    const parsed = parseDosePerTake(item.dose_per_take);
    if (parsed) setDosePerTake(parsed);
    setInstructions((item.default_instructions ?? "").trim());
  };

  const canAdd = medication.trim().length > 0;

  // El checkbox solo tiene sentido para lo escrito a mano: si el medicamento
  // salió del catálogo, ya está ahí.
  const showSaveToCatalog = canWriteCatalog && canAdd && catalogId === null;

  const addItem = () => {
    if (!canAdd) return;
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        medication: medication.trim(),
        dosage: dosage.trim(),
        pharmaceutical_form: form,
        // Sin forma elegida y stepper en 1 no hay dato real: no imprimir
        // "Dosis 1 unidad" en cada línea.
        dose_per_take: form === "" && dosePerTake === 1 ? "" : doseLabel,
        route,
        frequency,
        duration,
        quantity: quantity.trim(),
        instructions: instructions.trim(),
        catalogId,
        saveToCatalog: showSaveToCatalog && saveToCatalog,
      },
    ]);
    resetForm();
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  // Cerrar (Esc, clic fuera, "Cancelar") con medicamentos ya agregados
  // pide confirmación: el lote no se guarda hasta "Guardar".
  const handleOpenChange = (next: boolean) => {
    if (!next && !saving && items.length > 0) {
      const ok = window.confirm(
        "Tienes medicamentos sin guardar en esta receta. ¿Cerrar y descartarlos?",
      );
      if (!ok) return;
    }
    onOpenChange(next);
  };

  const save = async (print: boolean) => {
    if (items.length === 0 || saving) return;
    setSaving(true);
    const startDate = orgToday();

    try {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          // `catalogId` y `saveToCatalog` son solo de UI: `prescriptions` no
          // tiene esas columnas y el POST las rechazaría.
          items.map((i) => ({
            patient_id: patientId,
            doctor_id: doctorId,
            appointment_id: appointmentId || null,
            clinical_note_id: null,
            batch_id: batchId,
            medication: i.medication,
            dosage: i.dosage || null,
            pharmaceutical_form: i.pharmaceutical_form || null,
            dose_per_take: i.dose_per_take || null,
            route: i.route || null,
            frequency: i.frequency || null,
            duration: i.duration || null,
            quantity: i.quantity || null,
            instructions: i.instructions || null,
            start_date: startDate,
          })),
        ),
      });
      const json = (await res.json().catch(() => ({}))) as {
        batch_id?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo guardar la receta");
        setSaving(false);
        return;
      }

      // Catálogo (mig 248): después de la receta y sin bloquearla.
      const drafts: CatalogDraft[] = items
        .filter((i) => i.saveToCatalog && !i.catalogId)
        .map((i) => ({
          name: i.medication,
          concentration: i.dosage || null,
          pharmaceutical_form: i.pharmaceutical_form || null,
          route: i.route || null,
          frequency: i.frequency || null,
          duration: i.duration || null,
          dose_per_take: i.dose_per_take || null,
          default_instructions: i.instructions || null,
        }));
      if (organizationId && drafts.length > 0) {
        await saveDraftsToCatalog(organizationId, user?.id ?? null, drafts);
      }

      const savedBatchId = json.batch_id ?? batchId;
      toast.success(
        items.length === 1
          ? "Receta guardada"
          : `Receta guardada · ${items.length} medicamentos`,
      );
      onSaved?.(savedBatchId);
      onOpenChange(false);

      if (print) {
        const win = window.open(
          `/api/pdf/prescription/batch/${savedBatchId}`,
          "_blank",
          "noopener",
        );
        if (!win) {
          toast.info(
            "La receta se guardó, pero el navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e imprímela desde la historia clínica.",
          );
        }
      }
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    } finally {
      setSaving(false);
    }
  };

  const showDropdown =
    medicationFocused &&
    (suggestions.length > 0 ||
      (searched && sanitizeLikeTerm(medication).length >= 2));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Ancho y bajo: el formulario en dos columnas cabe en 1366×768 sin
          scroll. `max-h-[88vh]` deja ver que hay página detrás. */}
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-[1180px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-primary" />
            Receta
          </DialogTitle>
          <DialogDescription>
            {patientName}
            {doctorName ? ` · ${doctorName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] md:overflow-hidden">
          {/* ── Panel izquierdo: formulario (scrollable) ─────────────── */}
          <section className="border-border px-5 py-4 md:overflow-y-auto md:border-r">
            <div className="mb-4">
              <p className={labelClass}>Prescripción</p>
              <h3 className="mt-0.5 text-sm font-semibold">
                Selección de medicamentos
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              {/* Fila 1 — Medicamento (catálogo + texto libre) */}
              <div className="space-y-1.5 md:col-span-2">
                <label className={labelClass} htmlFor="rx-medication">
                  Medicamento
                </label>
                <div className="relative">
                  <input
                    id="rx-medication"
                    value={medication}
                    onChange={(e) => {
                      setMedication(e.target.value);
                      // Al editar a mano deja de ser "el del catálogo".
                      setCatalogId(null);
                    }}
                    onFocus={() => setMedicationFocused(true)}
                    // El blur se retrasa para que el clic en una sugerencia
                    // alcance a dispararse antes de que la lista desaparezca.
                    onBlur={() =>
                      setTimeout(() => setMedicationFocused(false), 150)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setMedicationFocused(false);
                        addItem();
                      }
                    }}
                    placeholder="Buscar en el catálogo o escribir un medicamento"
                    autoComplete="off"
                    className={inputClass}
                  />
                  {showDropdown && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                      {suggestions.length === 0 ? (
                        <p className="px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                          Sin coincidencias. Puedes escribirlo tal cual; el
                          catálogo se administra en Administración → Catálogo de
                          medicamentos.
                        </p>
                      ) : (
                        suggestions.map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applySuggestion(s)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {s.label}
                            </span>
                            {s.source === "catalog" &&
                            s.item?.inventory_product_id ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Farmacia
                              </span>
                            ) : null}
                            {s.source === "history" ? (
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                Usado antes
                              </span>
                            ) : null}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Fila 2 — Concentración | Forma farmacéutica */}
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="rx-dosage">
                  Concentración
                </label>
                <input
                  id="rx-dosage"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="500 mg"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="rx-form">
                  Forma farmacéutica
                </label>
                <select
                  id="rx-form"
                  value={form}
                  onChange={(e) => setForm(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecciona una forma</option>
                  {formOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fila 3 — Cantidad por toma (stepper) | Vía */}
              <div className="space-y-1.5">
                <label className={labelClass}>Cantidad por toma</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDosePerTake((n) => Math.max(1, n - 1))}
                    disabled={dosePerTake <= 1}
                    aria-label="Disminuir cantidad por toma"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {dosePerTake}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formMeta
                        ? dosePerTake === 1
                          ? formMeta.one
                          : formMeta.many
                        : "unidades"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDosePerTake((n) => Math.min(99, n + 1))}
                    aria-label="Aumentar cantidad por toma"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="rx-route">
                  Vía
                </label>
                <select
                  id="rx-route"
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecciona una vía</option>
                  {routeOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fila 4 — Frecuencia | Duración, cada grupo de chips en su columna */}
              <div className="space-y-1.5">
                <label className={labelClass}>Frecuencia</label>
                <div className="flex flex-wrap gap-2">
                  {frequencyOptions.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency((cur) => (cur === f ? "" : f))}
                      className={chipClass(frequency === f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Duración del tratamiento</label>
                <div className="flex flex-wrap gap-2">
                  {durationOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration((cur) => (cur === d ? "" : d))}
                      className={chipClass(duration === d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fila 5 — Cantidad total | Indicaciones adicionales */}
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="rx-quantity">
                  Cantidad total (opcional)
                </label>
                <input
                  id="rx-quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1 caja de 20 tabletas"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="rx-instructions">
                  Indicaciones adicionales (opcional)
                </label>
                <textarea
                  id="rx-instructions"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={2}
                  placeholder="Tomar después de los alimentos"
                  className={cn(inputClass, "resize-none")}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              {showSaveToCatalog && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground sm:mr-auto">
                  <input
                    type="checkbox"
                    checked={saveToCatalog}
                    onChange={(e) => setSaveToCatalog(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Guardar en el catálogo
                </label>
              )}
              <button
                type="button"
                onClick={addItem}
                disabled={!canAdd}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-50 sm:w-auto md:h-10"
              >
                <Plus className="h-4 w-4" />
                Agregar a la receta
              </button>
            </div>
          </section>

          {/* ── Panel derecho: medicamentos en receta (fijo) ─────────── */}
          <aside className="flex flex-col border-t border-border bg-muted/30 md:border-t-0 md:overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 px-5 py-4">
              <p className={labelClass}>Medicamentos en receta</p>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
                {items.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-2 px-5 pb-4 md:overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
                  <Pill className="h-6 w-6 text-muted-foreground/60" />
                  <p className="text-xs text-muted-foreground">
                    Sin medicamentos aún.
                    <br />
                    Agrega el primero desde el formulario.
                  </p>
                </div>
              ) : (
                items.map((i) => {
                  const detail = [i.dosage, i.dose_per_take, i.frequency, i.duration]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div
                      key={i.key}
                      className="flex items-start gap-2 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-semibold">
                          {i.medication}
                        </p>
                        {detail && (
                          <p className="text-xs text-muted-foreground">{detail}</p>
                        )}
                        {i.route && (
                          <p className="text-xs text-muted-foreground">
                            Vía {i.route.toLowerCase()}
                          </p>
                        )}
                        {i.quantity && (
                          <p className="text-xs text-muted-foreground">
                            Cantidad: {i.quantity}
                          </p>
                        )}
                        {i.instructions && (
                          <p className="text-xs text-muted-foreground">
                            {i.instructions}
                          </p>
                        )}
                        {i.saveToCatalog && (
                          <p className="text-[11px] font-medium text-primary">
                            Se agregará al catálogo
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(i.key)}
                        aria-label={`Quitar ${i.medication} de la receta`}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </div>

        {/* ── Pie ───────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border px-5 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {items.length}{" "}
              {items.length === 1 ? "medicamento" : "medicamentos"}
              {batchId ? ` · ${batchCode(batchId)}` : ""}
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
