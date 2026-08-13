"use client";

/**
 * El gesto de descuento — el corazón del módulo.
 *
 * Tap 1: el botón `−` de la fila (vive en product-table).
 * Tap 2: la cantidad (1 ya viene seleccionada → en el caso frecuente no cuesta tap).
 * Tap 3: el motivo. TOCAR EL MOTIVO CONFIRMA Y CIERRA: no hay botón "Guardar".
 *
 * Nunca abre el teclado salvo que se toque `+` o el campo de paciente.
 * Merma pide un motivo específico porque la BD lo exige
 * (`inv_mov_reason_chk`: ajuste y merma requieren reason_code).
 */

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, Plus, UserPlus, X } from "lucide-react";
import {
  MERMA_REASONS,
  expiryStatus,
  fmtQty,
  type InventoryLot,
  type InventoryProduct,
  type MovementType,
  type ReasonCode,
} from "./types";

export interface DiscountPayload {
  product: InventoryProduct;
  quantity: number;
  movementType: Extract<MovementType, "salida" | "merma">;
  reasonCode: ReasonCode;
  lotId: string | null;
  /** Paciente REAL vinculada (FK a patients) — la atribución que el Excel nunca tuvo. */
  patientId: string | null;
  patientNote: string | null;
  /** Etiqueta corta del motivo, para el toast ("Aplicación", "Venta"…). */
  motiveLabel: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  product: InventoryProduct | null;
  stock: number;
  lot: InventoryLot | null;
  expiryAlertDays: number;
  warnOnNegative: boolean;
  onSubmit: (payload: DiscountPayload) => void;
}

interface PatientOption {
  id: string;
  name: string;
  /** "DNI 74123456" — imprescindible para distinguir homónimas. */
  doc: string | null;
}

type Motive = { key: "aplicacion" | "venta" | "merma"; label: string };

const MOTIVES: Motive[] = [
  { key: "aplicacion", label: "Aplicación" },
  { key: "venta", label: "Venta" },
  { key: "merma", label: "Merma" },
];

const QUICK_QTY = [1, 2, 3, 4];

export function DiscountModal({
  open,
  onOpenChange,
  organizationId,
  product,
  stock,
  lot,
  expiryAlertDays,
  warnOnNegative,
  onSubmit,
}: Props) {
  const [qty, setQty] = useState(1);
  const [customQty, setCustomQty] = useState(false);
  const [step, setStep] = useState<"motive" | "merma" | "negative">("motive");
  const [pending, setPending] = useState<Omit<DiscountPayload, "product"> | null>(
    null
  );
  const [showPatient, setShowPatient] = useState(false);
  const [patient, setPatient] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const customRef = useRef<HTMLInputElement>(null);

  // Cada apertura arranca limpia: la hoja no recuerda el descuento anterior.
  useEffect(() => {
    if (!open) return;
    setQty(1);
    setCustomQty(false);
    setStep("motive");
    setPending(null);
    setShowPatient(false);
    setPatient("");
    setPatientId(null);
    setPatientOptions([]);
  }, [open, product?.id]);

  useEffect(() => {
    if (customQty) customRef.current?.focus();
  }, [customQty]);

  // Autocomplete contra la tabla REAL de pacientes. Busca por nombre COMPLETO
  // (tokens AND-eados: "maria perez" matchea maria↔first_name Y perez↔
  // last_name — un solo ilike sobre columnas partidas no encuentra nada) y
  // por DNI/CE/Pasaporte (solo dígitos = prefijo de documento, aprovecha el
  // índice trigram de mig 103). Cada token se sanea antes de entrar al .or():
  // PostgREST parsea esa cadena y una coma del input la rompe en silencio
  // (mismo saneo que budgets/route.ts). Elegir una opción vincula por
  // patient_id; escribir sin elegir queda como nota de texto, para no
  // bloquear a la asesora con una paciente nueva.
  useEffect(() => {
    const q = patient.trim();
    if (patientId || q.length < 2 || !organizationId) {
      setPatientOptions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const supabase = createClient();
      const tokens = q
        .split(/\s+/)
        .slice(0, 5)
        .map((t) => t.replace(/[%_,().\\]/g, ""))
        .filter(Boolean);
      if (tokens.length === 0) {
        setPatientOptions([]);
        return;
      }
      let query = supabase
        .from("patients")
        .select("id, first_name, last_name, dni, document_type")
        .eq("organization_id", organizationId)
        .eq("status", "active");
      const joined = tokens.join("");
      if (/^\d+$/.test(joined)) {
        query = query.ilike("dni", `${joined}%`);
      } else {
        for (const tok of tokens) {
          query = query.or(
            `first_name.ilike.%${tok}%,last_name.ilike.%${tok}%,dni.ilike.%${tok}%`
          );
        }
      }
      const { data, error } = await query.order("last_name").limit(8);
      if (cancelled) return;
      if (error) {
        setPatientOptions([]);
        return;
      }
      setPatientOptions(
        (
          (data ?? []) as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            dni: string | null;
            document_type: string | null;
          }[]
        ).map((p) => ({
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          doc: p.dni ? `${p.document_type ?? "DNI"} ${p.dni}` : null,
        }))
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [patient, patientId, organizationId]);

  if (!product) return null;

  const exp = expiryStatus(lot?.expiry_date, expiryAlertDays);
  const resulting = stock - qty;

  function fire(motive: Motive, reasonCode?: ReasonCode) {
    if (!product) return;
    // Confirmación rápida sin selección: si la búsqueda ya trajo EXACTAMENTE
    // una candidata, se vincula sola — la asesora escribe "quispe" y toca
    // "Venta" sin esperar el dropdown. Con 0 o varias candidatas, el texto
    // queda como nota (ambigüedad no se adivina).
    const autoOption =
      !patientId && patient.trim() && patientOptions.length === 1
        ? patientOptions[0]
        : null;
    const payload: Omit<DiscountPayload, "product"> = {
      quantity: qty,
      movementType: motive.key === "merma" ? "merma" : "salida",
      reasonCode:
        motive.key === "merma"
          ? (reasonCode ?? "otro")
          : motive.key === "venta"
            ? "venta"
            : "uso_en_cita",
      lotId: lot?.id ?? null,
      patientId: patientId ?? autoOption?.id ?? null,
      // El nombre va también como nota: el kardex lo muestra sin resolver la FK.
      patientNote: autoOption ? autoOption.name : patient.trim() || null,
      motiveLabel: motive.label,
    };

    // Descuadre: se PERMITE siempre. Solo se avisa una vez, dentro de la
    // misma hoja, para que la asesora nunca quede bloqueada a media consulta.
    if (warnOnNegative && resulting < 0) {
      setPending(payload);
      setStep("negative");
      return;
    }
    commit(payload);
  }

  function commit(payload: Omit<DiscountPayload, "product">) {
    if (!product) return;
    onSubmit({ ...payload, product });
    onOpenChange(false);
  }

  function onMotive(motive: Motive) {
    if (motive.key === "merma") {
      setStep("merma");
      return;
    }
    fire(motive);
  }

  // Atajos de escritorio: 1–9 fija cantidad, A/V/M confirma.
  function onKeyDown(e: React.KeyboardEvent) {
    if (step !== "motive" || customQty) return;
    // BUG histórico: sin este guard, los keydown del campo de paciente
    // burbujeaban hasta acá — tipear "maria" confirmaba Aplicación/Merma y
    // los dígitos de un DNI cambiaban la cantidad. Nada de atajos mientras
    // se escribe en un input.
    const el = e.target as HTMLElement | null;
    if (
      el &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    )
      return;
    if (e.key >= "1" && e.key <= "9") {
      setQty(Number(e.key));
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "a") onMotive(MOTIVES[0]);
    else if (k === "v") onMotive(MOTIVES[1]);
    else if (k === "m") onMotive(MOTIVES[2]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={onKeyDown}
        aria-describedby={undefined}
        // Fallback documentado: components/ui/sheet.tsx solo soporta
        // side="left|right", así que el bottom-sheet de móvil se consigue
        // reposicionando el Dialog en <sm. En ≥sm es el dialog centrado.
        className={cn(
          "gap-0 p-5 sm:max-w-md sm:rounded-2xl",
          "max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto",
          "max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
          "max-sm:rounded-t-2xl max-sm:rounded-b-none",
          "max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        )}
      >
        {/* Grab handle: solo móvil, puro affordance de bottom sheet. */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border sm:hidden" />

        <h2 className="pr-8 text-base font-bold leading-tight">{product.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Quedan {fmtQty(stock)} {product.base_unit.toLowerCase()}
          {lot && lot.lot_code !== "SIN-LOTE" ? ` · Lote ${lot.lot_code}` : ""}
          {exp.days !== null ? ` · ${exp.label}` : ""}
        </p>

        {step === "negative" ? (
          <div className="mt-5">
            <p className="text-sm font-semibold text-red-500">
              Vas a dejar el stock en −{fmtQty(Math.abs(resulting))}. ¿Continuar?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se registra igual y la fila queda marcada como descuadre. Nadie te
              bloquea: el inventario real siempre va algo desfasado.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setStep("motive");
                }}
                className="h-12 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => pending && commit(pending)}
                className="h-12 rounded-xl bg-red-500 text-sm font-bold text-white hover:bg-red-500/90"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : step === "merma" ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setStep("motive")}
              className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Volver
            </button>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              ¿Qué pasó? — al tocar, se registra
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MERMA_REASONS.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => fire(MOTIVES[2], r.code)}
                  className="h-14 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-500/20 active:scale-[.98] dark:text-amber-400"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              ¿Cuántas salieron?
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_QTY.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={!customQty && qty === n}
                  onClick={() => {
                    setCustomQty(false);
                    setQty(n);
                  }}
                  className={cn(
                    "h-12 min-w-[3.25rem] rounded-xl border text-base font-bold tabular-nums transition-colors",
                    !customQty && qty === n
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-foreground hover:border-primary/40"
                  )}
                >
                  {n}
                </button>
              ))}
              {customQty ? (
                <input
                  ref={customRef}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(Math.max(0, Number(e.target.value)))}
                  aria-label="Cantidad"
                  className="h-12 w-24 rounded-xl border border-primary bg-card px-3 text-base font-bold tabular-nums text-primary outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomQty(true)}
                  aria-label="Otra cantidad"
                  className="grid h-12 min-w-[3.25rem] place-items-center rounded-xl border border-border bg-card text-foreground transition-colors hover:border-primary/40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Paciente ANTES de los motivos: tocar el motivo confirma y
                cierra, así que tiene que ser el último gesto de la hoja. */}
            {showPatient ? (
              <div className="relative mt-4">
                {patientId ? (
                  <div className="flex h-11 items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3">
                    <span className="inline-flex items-center gap-1.5 truncate text-sm font-medium text-primary">
                      <Check className="h-3.5 w-3.5 shrink-0" /> {patient}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPatientId(null);
                        setPatient("");
                      }}
                      aria-label="Quitar paciente"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <input
                    value={patient}
                    onChange={(e) => setPatient(e.target.value)}
                    placeholder="Nombre, apellido o DNI (opcional)"
                    autoFocus
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-primary/50 md:text-sm"
                  />
                )}
                {!patientId && patientOptions.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-xl border border-border bg-popover shadow-sm">
                    {patientOptions.map((opt) => (
                      <li key={opt.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPatientId(opt.id);
                            setPatient(opt.name);
                            setPatientOptions([]);
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-accent"
                        >
                          <span className="block truncate text-sm">{opt.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {opt.doc ?? "Sin documento"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!patientId && patient.trim().length >= 2 && patientOptions.length === 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sin coincidencias — quedará como nota de texto.
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPatient(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <UserPlus className="h-3.5 w-3.5" /> Paciente (opcional)
              </button>
            )}

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              ¿Por qué? — al tocar, se registra
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MOTIVES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  disabled={qty <= 0}
                  onClick={() => onMotive(m)}
                  className="h-14 rounded-xl border border-primary/30 bg-primary/10 text-sm font-bold text-primary transition-colors hover:bg-primary/20 active:scale-[.98] disabled:opacity-40"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
