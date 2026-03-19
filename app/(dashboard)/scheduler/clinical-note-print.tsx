"use client";

import { Printer } from "lucide-react";
import {
  type ClinicalNote,
  SOAP_LABELS,
  VITALS_FIELDS,
  type SOAPSection,
  type Vitals,
} from "@/types/clinical-notes";
import { cn } from "@/lib/utils";

interface ClinicalNotePrintProps {
  note: ClinicalNote;
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  serviceName: string;
  appointmentDate: string;
  appointmentTime: string;
  clinicName?: string;
}

function buildPrintHTML(props: ClinicalNotePrintProps): string {
  const {
    note,
    patientName,
    patientDni,
    doctorName,
    serviceName,
    appointmentDate,
    appointmentTime,
    clinicName,
  } = props;

  const soapSections = (
    ["subjective", "objective", "assessment", "plan"] as SOAPSection[]
  )
    .filter((key) => note[key]?.trim())
    .map((key) => {
      const { letter, label } = SOAP_LABELS[key];
      const content = note[key].replace(/\n/g, "<br/>");
      return `
        <div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#059669;color:#fff;font-weight:700;font-size:13px;">${letter}</span>
            <span style="font-weight:600;font-size:14px;color:#111;">${label}</span>
          </div>
          <div style="padding-left:34px;font-size:13px;line-height:1.6;color:#333;">${content}</div>
        </div>`;
    })
    .join("");

  const diagnosisHTML =
    note.diagnosis_code || note.diagnosis_label
      ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:#111;margin:0 0 6px 0;text-transform:uppercase;letter-spacing:0.5px;">Diagnóstico</h3>
          <div style="font-size:13px;color:#333;">
            ${note.diagnosis_code ? `<span style="font-weight:600;">${note.diagnosis_code}</span>` : ""}${note.diagnosis_code && note.diagnosis_label ? " — " : ""}${note.diagnosis_label ?? ""}
          </div>
        </div>`
      : "";

  const vitalsEntries = VITALS_FIELDS.filter(
    (f) => note.vitals?.[f.key as keyof Vitals] != null
  );

  const vitalsHTML =
    vitalsEntries.length > 0
      ? `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:13px;font-weight:600;color:#111;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Signos Vitales</h3>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
            ${vitalsEntries
              .map(
                (f) => `
              <div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;">
                <div style="font-size:11px;color:#6b7280;margin-bottom:2px;">${f.label}</div>
                <div style="font-size:14px;font-weight:600;color:#111;">${note.vitals[f.key as keyof Vitals]} <span style="font-weight:400;font-size:12px;color:#6b7280;">${f.unit}</span></div>
              </div>`
              )
              .join("")}
          </div>
        </div>`
      : "";

  const signedDate = note.signed_at
    ? new Date(note.signed_at).toLocaleDateString("es", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const signatureHTML = note.is_signed
    ? `
        <div style="margin-top:40px;text-align:center;">
          <div style="border-top:1px solid #333;width:250px;margin:0 auto;padding-top:8px;">
            <div style="font-size:13px;font-weight:600;color:#111;">${doctorName}</div>
            ${signedDate ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">Firmado el ${signedDate}</div>` : ""}
          </div>
        </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Nota Clínica — ${patientName}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    @media print {
      body { margin: 0; padding: 0; }
      .no-print { display: none !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #fff; color: #111; font-size: 13px; line-height: 1.5; padding: 40px; max-width: 210mm; margin: 0 auto; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #059669;padding-bottom:16px;">
    ${clinicName ? `<div style="font-size:16px;font-weight:700;color:#059669;margin-bottom:4px;">${clinicName}</div>` : ""}
    <div style="font-size:18px;font-weight:700;letter-spacing:1px;color:#111;">NOTA CLÍNICA</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px;">${appointmentDate}</div>
  </div>

  <!-- Patient Info -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:24px;padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
    <div><span style="font-size:11px;color:#6b7280;">Paciente:</span> <span style="font-weight:600;">${patientName}</span></div>
    ${patientDni ? `<div><span style="font-size:11px;color:#6b7280;">DNI:</span> <span style="font-weight:600;">${patientDni}</span></div>` : `<div></div>`}
    <div><span style="font-size:11px;color:#6b7280;">Fecha:</span> ${appointmentDate}</div>
    <div><span style="font-size:11px;color:#6b7280;">Hora:</span> ${appointmentTime}</div>
    <div><span style="font-size:11px;color:#6b7280;">Servicio:</span> ${serviceName}</div>
    <div><span style="font-size:11px;color:#6b7280;">Doctor:</span> ${doctorName}</div>
  </div>

  <!-- SOAP -->
  ${soapSections}

  <!-- Diagnosis -->
  ${diagnosisHTML}

  <!-- Vitals -->
  ${vitalsHTML}

  <!-- Signature -->
  ${signatureHTML}

  <script>window.onload=function(){window.print();}</script>
</body>
</html>`;
}

export function ClinicalNotePrintButton(props: ClinicalNotePrintProps) {
  const handlePrint = () => {
    const html = buildPrintHTML(props);
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
        "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      )}
    >
      <Printer className="h-4 w-4" />
      Imprimir
    </button>
  );
}
