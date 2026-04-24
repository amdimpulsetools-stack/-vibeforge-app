"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import {
  FlaskConical,
  Plus,
  Loader2,
  Check,
  X,
  ChevronDown,
  Clock,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { ExamOrderPrintButton } from "@/app/(dashboard)/scheduler/exam-order-print";

interface ExamCatalogItem {
  id: string;
  name: string;
  code: string | null;
  default_instructions: string | null;
  category_id: string;
}

interface ExamCategory {
  id: string;
  name: string;
}

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
  const { organizationId } = useOrganization();
  const [orders, setOrders] = useState<ExamOrder[]>([]);
  const [catalog, setCatalog] = useState<ExamCatalogItem[]>([]);
  const [categories, setCategories] = useState<ExamCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Form state
  const [selectedExams, setSelectedExams] = useState<{ exam_catalog_id: string | null; exam_name: string; instructions: string }[]>([]);
  const [diagnosis, setDiagnosis] = useState("");
  const [diagnosisCode, setDiagnosisCode] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [customExam, setCustomExam] = useState("");

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

  // Fetch catalog
  useEffect(() => {
    if (!organizationId) return;
    const fetchCatalog = async () => {
      const supabase = createClient();
      const [catRes, examRes] = await Promise.all([
        supabase.from("exam_categories").select("id, name").eq("is_active", true).order("display_order"),
        supabase.from("exam_catalog").select("id, name, code, default_instructions, category_id").eq("is_active", true).order("display_order"),
      ]);
      setCategories(catRes.data ?? []);
      setCatalog(examRes.data ?? []);
    };
    fetchCatalog();
  }, [organizationId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredCatalog = searchTerm.trim()
    ? catalog.filter((e) =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.code?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : catalog;

  const addExamFromCatalog = (item: ExamCatalogItem) => {
    if (selectedExams.some((e) => e.exam_catalog_id === item.id)) return;
    setSelectedExams([...selectedExams, {
      exam_catalog_id: item.id,
      exam_name: item.name,
      instructions: item.default_instructions || "",
    }]);
    setSearchTerm("");
  };

  const addCustomExam = () => {
    if (!customExam.trim()) return;
    setSelectedExams([...selectedExams, {
      exam_catalog_id: null,
      exam_name: customExam.trim(),
      instructions: "",
    }]);
    setCustomExam("");
  };

  const removeExam = (idx: number) => {
    setSelectedExams(selectedExams.filter((_, i) => i !== idx));
  };

  const updateExamInstructions = (idx: number, instructions: string) => {
    const updated = [...selectedExams];
    updated[idx].instructions = instructions;
    setSelectedExams(updated);
  };

  const handleCreate = async () => {
    if (selectedExams.length === 0 || !doctorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/exam-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          doctor_id: doctorId,
          appointment_id: appointmentId || null,
          clinical_note_id: clinicalNoteId || null,
          diagnosis: diagnosis || null,
          diagnosis_code: diagnosisCode || null,
          notes: orderNotes || null,
          items: selectedExams.map((e) => ({
            exam_catalog_id: e.exam_catalog_id,
            exam_name: e.exam_name,
            instructions: e.instructions || null,
          })),
        }),
      });
      if (res.ok) {
        toast.success("Orden de exámenes creada");
        setShowForm(false);
        setSelectedExams([]);
        setDiagnosis("");
        setDiagnosisCode("");
        setOrderNotes("");
        fetchOrders();
      } else {
        const json = await res.json();
        toast.error(json.error || "Error al crear orden");
      }
    } catch {
      toast.error("Sin conexión. Revisa tu internet e intenta otra vez.");
    }
    setSaving(false);
  };

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
    if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    if (status === "partial") return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const statusLabel = (status: string) => {
    if (status === "completed") return "Completado";
    if (status === "partial") return "Parcial";
    return "Pendiente";
  };

  const statusColor = (status: string) => {
    if (status === "completed") return "bg-emerald-500/10 text-emerald-600";
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
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-600 hover:bg-cyan-500/20 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Solicitar
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && !isSigned && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          {/* Exam selection from catalog */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase">Buscar examen en catálogo</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar examen..."
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchTerm.trim() && filteredCatalog.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-popover">
                {categories.map((cat) => {
                  const catExams = filteredCatalog.filter((e) => e.category_id === cat.id);
                  if (catExams.length === 0) return null;
                  return (
                    <div key={cat.id}>
                      <div className="px-2 py-1 text-[9px] font-semibold text-muted-foreground uppercase bg-muted/50">{cat.name}</div>
                      {catExams.map((exam) => (
                        <button
                          key={exam.id}
                          onClick={() => addExamFromCatalog(exam)}
                          disabled={selectedExams.some((e) => e.exam_catalog_id === exam.id)}
                          className="flex w-full items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent/50 disabled:opacity-40"
                        >
                          <span className="flex-1 text-left">{exam.name}</span>
                          {exam.code && <span className="text-[9px] text-muted-foreground">{exam.code}</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
            {searchTerm.trim() && filteredCatalog.length === 0 && (
              <p className="text-[10px] text-muted-foreground py-1">No se encontraron exámenes</p>
            )}
          </div>

          {/* Custom exam input */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={customExam}
              onChange={(e) => setCustomExam(e.target.value)}
              placeholder="O escribe un examen manual..."
              className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomExam(); } }}
            />
            <button
              onClick={addCustomExam}
              disabled={!customExam.trim()}
              className="rounded-md bg-cyan-500/10 px-2 py-1.5 text-[10px] font-medium text-cyan-600 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Selected exams */}
          {selectedExams.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                Exámenes seleccionados ({selectedExams.length})
              </label>
              {selectedExams.map((exam, idx) => (
                <div key={idx} className="flex items-start gap-1.5 rounded-md border border-border bg-background p-2">
                  <div className="flex-1 space-y-1">
                    <span className="text-xs font-medium">{exam.exam_name}</span>
                    <input
                      type="text"
                      value={exam.instructions}
                      onChange={(e) => updateExamInstructions(idx, e.target.value)}
                      placeholder="Indicaciones (ej: en ayunas)"
                      className="w-full rounded border border-input bg-background px-1.5 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </div>
                  <button onClick={() => removeExam(idx)} className="mt-0.5 text-muted-foreground hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Diagnosis + notes */}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="Diagnóstico presuntivo"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <input
              type="text"
              value={diagnosisCode}
              onChange={(e) => setDiagnosisCode(e.target.value)}
              placeholder="Código CIE-10"
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <textarea
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Notas adicionales"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {/* Actions */}
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              disabled={saving || selectedExams.length === 0}
              className="flex-1 flex items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Crear orden ({selectedExams.length})
            </button>
            <button onClick={() => { setShowForm(false); setSelectedExams([]); }} className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Orders list */}
      {orders.length === 0 && !showForm && (
        <p className="text-center text-xs text-muted-foreground py-4">Sin órdenes de exámenes</p>
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
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          : <Circle className="h-3.5 w-3.5 text-muted-foreground hover:text-emerald-500" />
                        }
                      </button>
                    ) : (
                      <div className="mt-0.5 shrink-0">
                        {item.status === "completed"
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
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
                        <p className="text-[10px] text-emerald-600 mt-0.5">Resultado: {item.result_notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
