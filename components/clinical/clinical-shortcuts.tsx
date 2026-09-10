"use client";

/**
 * Atajos clínicos: "Receta" y "Orden de examen".
 *
 * Un solo par de botones reutilizado en los DOS puntos de entrada que pidió
 * el founder — el sidebar de la cita en la agenda y el drawer del paciente —
 * para que recetar no obligue a entrar a la historia clínica.
 *
 * Los modales se montan solo cuando se abren: el de exámenes consulta el
 * catálogo de la org al montarse y no tiene sentido pagarlo en cada cita
 * que el staff abre.
 *
 * ── Recetas ya emitidas (prueba con la Dra. Patricia) ────────────────────
 * Antes, al guardar, el modal cerraba y el botón "Receta" volvía a quedar
 * idéntico: nada decía que esa cita YA tenía receta, así que se volvía a
 * emitir creyendo que la primera no se había guardado. Ahora, cuando la cita
 * tiene al menos una receta activa, el atajo cambia de cara: la acción por
 * defecto pasa a ser VER/imprimir, y emitir otra queda detrás de un botón
 * "+" aparte (válido clínicamente, pero deliberado). Sin `appointmentId`
 * (drawer del paciente) no hay nada que consultar y el atajo se comporta
 * exactamente como antes.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FlaskConical,
  Loader2,
  Pill,
  Plus,
  Printer,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  PrescriptionComposerModal,
  batchCode,
} from "./prescription-composer-modal";
import { ExamOrderComposerModal } from "./exam-order-composer-modal";

export interface ClinicalShortcutsProps {
  patientId: string;
  patientName: string;
  /** Médico firmante: el doctor de la cita, o el del usuario si no hay cita. */
  doctorId: string;
  doctorName?: string;
  /** `null` cuando el atajo se usa fuera de una cita (drawer del paciente). */
  appointmentId?: string | null;
  /** Se dispara tras guardar cualquiera de los dos documentos. */
  onSaved?: () => void;
  className?: string;
}

/** Sin radio: los botones partidos ("Ver receta" + "+") lo redondean por lado. */
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary";

const buttonClass = cn(buttonBase, "flex-1 rounded-lg");

/** Mitad izquierda del grupo cuando la cita YA tiene receta. */
const rxViewClass = cn(
  buttonBase,
  "min-w-0 flex-1 rounded-l-lg border-r-0 border-primary/40 bg-primary/5 text-primary",
);

/** Fila mínima: solo lo que el atajo necesita para decidir su estado. */
interface RxRow {
  id: string;
  batch_id: string | null;
  medication: string;
}

/**
 * Una "receta" = un LOTE (`batch_id`, mig 247). Las filas sin lote son las
 * históricas creadas desde la historia clínica: se imprimen todas juntas por
 * cita (`/api/pdf/prescription/[appointmentId]`), así que cuentan como UNA.
 */
interface RxBatch {
  key: string;
  batchId: string | null;
  medications: string[];
}

const LEGACY_KEY = "__sin-lote__";

function groupBatches(rows: RxRow[]): RxBatch[] {
  const byKey = new Map<string, RxBatch>();
  const ordered: RxBatch[] = [];
  for (const row of rows) {
    const key = row.batch_id ?? LEGACY_KEY;
    const existing = byKey.get(key);
    if (existing) {
      existing.medications.push(row.medication);
      continue;
    }
    const batch: RxBatch = {
      key,
      batchId: row.batch_id,
      medications: [row.medication],
    };
    byKey.set(key, batch);
    ordered.push(batch);
  }
  return ordered;
}

function batchSummary(batch: RxBatch): string {
  const names = batch.medications.filter(Boolean);
  if (names.length === 0) return "Recién emitida";
  const head = names.slice(0, 2).join(" · ");
  return names.length > 2 ? `${head} +${names.length - 2}` : head;
}

export function ClinicalShortcuts({
  patientId,
  patientName,
  doctorId,
  doctorName,
  appointmentId = null,
  onSaved,
  className,
}: ClinicalShortcutsProps) {
  const [showPrescription, setShowPrescription] = useState(false);
  const [showExamOrder, setShowExamOrder] = useState(false);
  /**
   * Lote recién guardado. Evita el hueco entre `onSaved` y la respuesta del
   * refetch: sin esto el atajo seguiría diciendo "Receta" un instante después
   * de emitirla, que es justo el estado que confunde.
   */
  const [justSavedBatchId, setJustSavedBatchId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const rxQueryKey = useMemo(
    () => ["appointment-prescriptions", appointmentId] as const,
    [appointmentId],
  );

  // Consulta directa por RLS (org-scoped, mig 053) en vez de
  // `/api/prescriptions`: el atajo se monta en CADA cita que abre el staff y
  // la ruta gasta cupo del rate limit general y escribe un acceso clínico
  // "list" en la auditoría por cada apertura. Aquí solo se leen 3 columnas
  // para decidir el estado del botón.
  const { data, isLoading } = useQuery({
    queryKey: rxQueryKey,
    enabled: !!appointmentId,
    // Más corto que el default de 5 min: es un indicador de "ya existe" y
    // otra persona (o la historia clínica) puede haber recetado en medio.
    staleTime: 30 * 1000,
    queryFn: async (): Promise<RxBatch[]> => {
      const { data: rows, error } = await createClient()
        .from("prescriptions")
        .select("id, batch_id, medication")
        .eq("appointment_id", appointmentId as string)
        // Una receta enteramente suspendida no se puede imprimir (el PDF del
        // lote solo saca filas activas): no debe cambiar la cara del atajo.
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return groupBatches((rows ?? []) as RxRow[]);
    },
  });

  // Cambiar de cita limpia el optimismo de la anterior.
  useEffect(() => {
    setJustSavedBatchId(null);
  }, [appointmentId]);

  const batches = useMemo(() => {
    const fromServer = data ?? [];
    if (
      !justSavedBatchId ||
      fromServer.some((b) => b.batchId === justSavedBatchId)
    ) {
      return fromServer;
    }
    return [
      { key: justSavedBatchId, batchId: justSavedBatchId, medications: [] },
      ...fromServer,
    ];
  }, [data, justSavedBatchId]);

  // Sin cita no hay consulta: `isLoading` es false y el atajo se queda en
  // "Receta" neutro, exactamente como antes.
  const loadingRx = !!appointmentId && isLoading;
  const hasRx = batches.length > 0;

  const openBatchPdf = (batch: RxBatch) => {
    const url = batch.batchId
      ? `/api/pdf/prescription/batch/${batch.batchId}`
      : `/api/pdf/prescription/${appointmentId}`;
    window.open(url, "_blank", "noopener");
  };

  const handlePrescriptionSaved = (savedBatchId: string) => {
    if (appointmentId) {
      setJustSavedBatchId(savedBatchId);
      queryClient.invalidateQueries({ queryKey: rxQueryKey });
    }
    onSaved?.();
  };

  /** Botón "+" del grupo: emitir OTRA receta para la misma cita. */
  const newRxButton = (
    <button
      type="button"
      onClick={() => setShowPrescription(true)}
      aria-label="Emitir otra receta"
      title="Emitir otra receta"
      className={cn(
        buttonBase,
        "w-11 flex-none rounded-r-lg px-0 text-muted-foreground",
      )}
    >
      <Plus className="h-4 w-4 shrink-0" />
    </button>
  );

  return (
    <>
      <div className={cn("flex gap-2", className)}>
        {loadingRx ? (
          // Mientras no se sabe si la cita ya tiene receta no se afirma
          // ninguna de las dos cosas: mismo tamaño, sin salto, y sin abrir el
          // compositor a ciegas.
          <button
            type="button"
            disabled
            aria-label="Cargando recetas de la cita"
            className={cn(buttonClass, "cursor-wait opacity-60")}
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            Receta
          </button>
        ) : !hasRx ? (
          <button
            type="button"
            onClick={() => setShowPrescription(true)}
            className={buttonClass}
          >
            <Pill className="h-4 w-4 shrink-0" />
            Receta
          </button>
        ) : batches.length === 1 ? (
          // Una sola receta: la acción por defecto es VERLA/imprimirla, sin
          // pasos intermedios (es lo que se quiere justo al terminar la
          // consulta). Emitir otra es el "+" de al lado.
          <div className="flex min-w-0 flex-1 items-stretch">
            <button
              type="button"
              onClick={() => openBatchPdf(batches[0])}
              title="Abrir la receta en PDF para verla o imprimirla"
              className={rxViewClass}
            >
              <Printer className="h-4 w-4 shrink-0" />
              <span className="truncate">Ver receta</span>
            </button>
            {newRxButton}
          </div>
        ) : (
          // Varias recetas en la misma cita: hay que elegir cuál, así que el
          // botón abre la lista. El "+" sigue siendo el único camino a una
          // nueva (también repetido dentro del menú, para el que llegue ahí).
          <div className="flex min-w-0 flex-1 items-stretch">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Ver o imprimir las recetas de esta cita"
                  className={rxViewClass}
                >
                  <Pill className="h-4 w-4 shrink-0" />
                  <span className="truncate">Recetas · {batches.length}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {batches.map((batch) => (
                  <DropdownMenuItem
                    key={batch.key}
                    onSelect={() => openBatchPdf(batch)}
                    className="flex min-h-11 flex-col items-start gap-0.5"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold">
                      <Printer className="h-3.5 w-3.5" />
                      {batch.batchId
                        ? batchCode(batch.batchId)
                        : "Receta de la consulta"}
                    </span>
                    <span className="w-full truncate pl-5 text-[11px] text-muted-foreground">
                      {batchSummary(batch)}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setShowPrescription(true)}
                  className="min-h-11 gap-1.5 text-xs font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Emitir otra receta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {newRxButton}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowExamOrder(true)}
          className={buttonClass}
        >
          <FlaskConical className="h-4 w-4 shrink-0" />
          Orden de examen
        </button>
      </div>

      {showPrescription && (
        <PrescriptionComposerModal
          open={showPrescription}
          onOpenChange={setShowPrescription}
          patientId={patientId}
          patientName={patientName}
          doctorId={doctorId}
          doctorName={doctorName}
          appointmentId={appointmentId}
          existingBatchCount={appointmentId ? batches.length : 0}
          onSaved={handlePrescriptionSaved}
        />
      )}

      {showExamOrder && (
        <ExamOrderComposerModal
          open={showExamOrder}
          onOpenChange={setShowExamOrder}
          patientId={patientId}
          patientName={patientName}
          doctorId={doctorId}
          doctorName={doctorName}
          appointmentId={appointmentId}
          onSaved={() => onSaved?.()}
        />
      )}
    </>
  );
}
