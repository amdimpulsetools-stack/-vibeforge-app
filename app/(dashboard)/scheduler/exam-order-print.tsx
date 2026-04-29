"use client";

import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { renderClinicHeader, type ClinicHeaderData } from "@/lib/pdf/clinic-header";
import {
  toClinicHeaderData,
  fallbackClinicHeader,
  type OrganizationWithBranding,
} from "@/lib/pdf/clinic-header-data";

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
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  appointmentDate: string;
  /** Legacy fallback if the org context isn't loaded. */
  clinicName?: string;
}

interface BuildArgs extends ExamOrderPrintProps {
  clinic: ClinicHeaderData;
}

function buildExamOrderPrintHTML(args: BuildArgs): string {
  const { order, patientName, patientDni, doctorName, appointmentDate, clinic } = args;

  if (!order || order.exam_order_items.length === 0) return "";

  const accent = clinic.print_color_primary || "#10b981";

  const examRows = order.exam_order_items
    .map(
      (item, idx) => `
      <tr style="${idx > 0 ? "border-top: 1px solid #e5e7eb;" : ""}">
        <td style="padding: 10px 12px; vertical-align: top; width: 30px; font-weight: 600; color: ${accent}; font-size: 14px;">
          ${idx + 1}.
        </td>
        <td style="padding: 10px 12px; vertical-align: top;">
          <div style="font-size: 14px; font-weight: 600; color: #111; margin-bottom: 2px;">
            ${item.exam_name}
          </div>
          ${item.instructions ? `<div style="font-size: 12px; color: #555; font-style: italic; padding-left: 8px; border-left: 2px solid ${accent};">Indicaciones: ${item.instructions}</div>` : ""}
        </td>
      </tr>`
    )
    .join("");

  const formattedDate = new Date(appointmentDate + "T00:00:00").toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const headerHtml = renderClinicHeader(clinic, { compact: true });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Orden de Exámenes — ${patientName}</title>
  <style>
    @page { size: A5 landscape; margin: 12mm; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #fff;
      color: #111;
      font-size: 13px;
      line-height: 1.5;
      padding: 30px;
      max-width: 210mm;
      margin: 0 auto;
    }
  </style>
</head>
<body>
  ${headerHtml}

  <!-- Document title -->
  <div style="text-align: center; margin-bottom: 14px;">
    <div style="font-size: 16px; font-weight: 700; letter-spacing: 1px; color: #111;">ORDEN DE EXÁMENES</div>
    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${formattedDate}</div>
  </div>

  <!-- Patient & Doctor Info -->
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; padding: 10px 14px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
    <div>
      <span style="font-size: 11px; color: #6b7280;">Paciente:</span>
      <span style="font-weight: 600;"> ${patientName}</span>
    </div>
    ${patientDni ? `<div><span style="font-size: 11px; color: #6b7280;">DNI:</span> <span style="font-weight: 600;">${patientDni}</span></div>` : "<div></div>"}
    <div>
      <span style="font-size: 11px; color: #6b7280;">Doctor:</span>
      <span style="font-weight: 600;"> ${doctorName}</span>
    </div>
    <div>
      <span style="font-size: 11px; color: #6b7280;">Fecha:</span>
      <span style="font-weight: 600;"> ${formattedDate}</span>
    </div>
  </div>

  ${order.diagnosis ? `
  <div style="margin-bottom: 16px; padding: 8px 14px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
    <span style="font-size: 11px; color: #6b7280;">Diagnóstico presuntivo:</span>
    <span style="font-weight: 600;"> ${order.diagnosis}</span>
    ${order.diagnosis_code ? `<span style="font-size: 11px; color: #6b7280;"> (${order.diagnosis_code})</span>` : ""}
  </div>` : ""}

  <!-- Exams Title -->
  <div style="font-size: 13px; font-weight: 600; color: #111; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">
    Exámenes solicitados (${order.exam_order_items.length})
  </div>

  <!-- Exams Table -->
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
    <tbody>
      ${examRows}
    </tbody>
  </table>

  ${order.notes ? `
  <div style="margin-bottom: 20px; padding: 8px 14px; background: #fefce8; border-radius: 8px; border: 1px solid #fde68a; font-size: 12px;">
    <span style="font-weight: 600;">Nota:</span> ${order.notes}
  </div>` : ""}

  <!-- Signature -->
  <div style="margin-top: 50px; text-align: center;">
    <div style="border-top: 1px solid #333; width: 250px; margin: 0 auto; padding-top: 8px;">
      <div style="font-size: 13px; font-weight: 600; color: #111;">${doctorName}</div>
      <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Médico tratante</div>
    </div>
  </div>

  <!-- Legal disclaimer -->
  <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px;">
    Orden de exámenes auxiliares. Válida por 30 días desde su emisión.
  </div>

  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;
}

export function ExamOrderPrintButton(props: ExamOrderPrintProps) {
  const { organization } = useOrganization();

  if (!props.order || props.order.exam_order_items.length === 0) return null;

  const handlePrint = () => {
    const clinic = organization
      ? toClinicHeaderData(organization as OrganizationWithBranding)
      : fallbackClinicHeader(props.clinicName);
    const html = buildExamOrderPrintHTML({ ...props, clinic });
    if (!html) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      )}
    >
      <Printer className="h-3 w-3" />
      Imprimir Orden
    </button>
  );
}
