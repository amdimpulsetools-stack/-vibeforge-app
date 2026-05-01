"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExamOrderItem {
  id: string;
  exam_name: string;
  instructions: string | null;
  status: string;
}

interface ExamOrder {
  id: string;
  diagnosis: string | null;
  diagnosis_code: string | null;
  notes: string | null;
  exam_order_items: ExamOrderItem[];
}

interface ExamOrderPrintProps {
  order: ExamOrder;
  // Props legacy (no se usan ya que el endpoint resuelve todo desde DB).
  patientName?: string;
  patientDni?: string | null;
  doctorName?: string;
  appointmentDate?: string;
  clinicName?: string;
}

export function ExamOrderPrintButton({ order }: ExamOrderPrintProps) {
  if (!order || order.exam_order_items.length === 0) return null;

  const handlePrint = () => {
    window.open(`/api/pdf/exam-order/${order.id}`, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      )}
      title="Abrir orden de exámenes en PDF"
    >
      <Printer className="h-3 w-3" />
      Imprimir Orden
    </button>
  );
}
