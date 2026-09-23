"use client";

/**
 * Órdenes de examen de la consulta dentro de la historia clínica (y del
 * drawer y del modal de historia del paciente).
 *
 * Crear usa EL MISMO compositor que los atajos de la agenda
 * (`ExamOrderComposerModal`): catálogo de la org agrupado por categoría,
 * examen libre, diagnóstico presuntivo con CIE-10, indicaciones prellenadas
 * e impresión al guardar. Antes este panel tenía su propio formulario
 * reducido. Aquí además viaja `clinicalNoteId`, para que el Timeline de la
 * historia agrupe la orden con su nota.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  FlaskConical,
  Plus,
  Loader2,
  ChevronDown,
  Clock,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { ExamOrderPrintButton } from "@/app/(dashboard)/scheduler/exam-order-print";
import { ExamOrderComposerModal } from "@/components/clinical/exam-order-composer-modal";
import {
  CLINICAL_PANEL_CTA,
  CLINICAL_PANEL_CTA_ICON,
  CLINICAL_PANEL_CTA_VARIANTS,
} from "@/lib/clinical-ui-tokens";

interface ExamOrderItem {
  id: string;
  exam_name: string;
  instructions: string | null;
  status: string;
  result_notes: string | null;
  completed_at: string | null;
}

interface ExamOrder {
  id: string;
  patient_id: string;
  doctor_id: string;
  diagnosis: string | null;
  diagnosis_code: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  doctors: { full_name: string } | null;
  exam_order_items: ExamOrderItem[];
}

interface ExamOrdersPanelProps {
  patientId: string;
  doctorId?: string;
  appointmentId?: string;
  clinicalNoteId?: string;
  canEdit: boolean;
  /** If true, the clinical note is signed — prevents creating NEW orders but allows marking items as completed */
  isSigned?: boolean;
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  appointmentDate?: string;
  clinicName?: string;
}

export function ExamOrdersPanel({
  patientId,
  doctorId,
  appointmentId,
  clinicalNoteId,
  canEdit,
  isSigned = false,
  patientName,
  patientDni,
  doctorName,
  appointmentDate,
  clinicName,
}: ExamOrdersPanelProps) {
  const [orders, setOrders] = useState<ExamOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    const param = appointmentId ? `appointment_id=${appointmentId}` : `patient_id=${patientId}`;
    try {
      const res = await fetch(`/api/exam-orders?${param}`);
      const json = await res.json();
      setOrders(json.data ?? []);
    } catch {
      toast.error("Error al cargar órdenes de exámenes");
    }
    setLoading(false);
  }, [patientId, appointmentId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const toggleItemStatus = async (orderId: string, item: ExamOrderItem) => {
    const newStatus = item.status === "completed" ? "pending" : "completed";
    try {
      const res = await fetch(`/api/exam-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, item_status: newStatus }),
      });
      if (res.ok) {
        toast.success(newStatus === "completed" ? "Examen marcado como completado" : "Examen marcado como pendiente");
        fetchOrders();
      }
    } catch {
      toast.error("Error al actualizar");
    }
  };

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />;
    if (status === "partial") return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const statusLabel = (status: string) => {
    if (status === "completed") return "Completado";
    if (status === "partial") return "Parcial";
    return "Pendiente";
  };

  const statusColor = (status: string) => {
    if (status === "completed") return "bg-success-500/10 text-success-600";
    if (status === "partial") return "bg-amber-500/10 text-amber-600";
    return "bg-muted text-muted-foreground";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4 text-cyan-500" />
          <span className="text-xs font-semibold">Exámenes</span>
          {orders.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium">{orders.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {orders.length > 0 && expandedOrder && patientName && doctorName && appointmentDate && (
            <ExamOrderPrintButton
              order={orders.find((o) => o.id === expandedOrder)!}
              patientName={patientName}
              patientDni={patientDni}
              doctorName={doctorName}
              appointmentDate={appointmentDate}
              clinicName={clinicName}
            />
          )}
          {canEdit && doctorId && !isSigned && (
            <button
              onClick={() => setComposerOpen(true)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.cyan)}
              aria-label="Ordenar nuevo examen"
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Ordenar examen
            </button>
          )}
        </div>
      </div>


      {/* Orders list */}
      {orders.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-xs text-muted-foreground">Sin órdenes de exámenes</p>
          {canEdit && doctorId && !isSigned && (
            <button
              onClick={() => setComposerOpen(true)}
              className={cn(CLINICAL_PANEL_CTA, CLINICAL_PANEL_CTA_VARIANTS.cyan)}
            >
              <Plus className={CLINICAL_PANEL_CTA_ICON} />
              Ordenar primer examen
            </button>
          )}
        </div>
      )}

      {orders.map((order) => (
        <div key={order.id} className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
            className="flex w-full items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusIcon(order.status)}
              <div className="text-left min-w-0">
                <span className="text-xs font-semibold block">
                  {order.exam_order_items.length} {order.exam_order_items.length === 1 ? "examen" : "exámenes"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {order.doctors?.full_name} — {new Date(order.created_at).toLocaleDateString("es-PE")}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", statusColor(order.status))}>
                {statusLabel(order.status)}
              </span>
              <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", expandedOrder === order.id && "rotate-180")} />
            </div>
          </button>

          {expandedOrder === order.id && (
            <div className="border-t border-border px-3 py-2 space-y-2">
              {order.diagnosis && (
                <p className="text-[10px]">
                  <span className="text-muted-foreground">Dx:</span> {order.diagnosis}
                  {order.diagnosis_code && <span className="ml-1 text-muted-foreground">({order.diagnosis_code})</span>}
                </p>
              )}
              {order.notes && (
                <p className="text-[10px]"><span className="text-muted-foreground">Notas:</span> {order.notes}</p>
              )}

              {/* Items */}
              <div className="space-y-1">
                {order.exam_order_items.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                    {canEdit ? (
                      <button
                        onClick={() => toggleItemStatus(order.id, item)}
                        className="mt-0.5 shrink-0"
                      >
                        {item.status === "completed"
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
                          : <Circle className="h-3.5 w-3.5 text-muted-foreground hover:text-success-500" />
                        }
                      </button>
                    ) : (
                      <div className="mt-0.5 shrink-0">
                        {item.status === "completed"
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
                          : <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={cn("text-xs font-medium", item.status === "completed" && "line-through text-muted-foreground")}>
                        {item.exam_name}
                      </span>
                      {item.instructions && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.instructions}</p>
                      )}
                      {item.result_notes && (
                        <p className="text-[10px] text-success-600 mt-0.5">Resultado: {item.result_notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}

      {composerOpen && doctorId && (
        <ExamOrderComposerModal
          open={composerOpen}
          onOpenChange={setComposerOpen}
          patientId={patientId}
          patientName={patientName ?? ""}
          doctorId={doctorId}
          doctorName={doctorName}
          appointmentId={appointmentId ?? null}
          clinicalNoteId={clinicalNoteId ?? null}
          onSaved={() => fetchOrders()}
        />
      )}
    </div>
  );
}
