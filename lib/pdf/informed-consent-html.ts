// Renders the printable HTML for an informed consent. The output is
// a complete <html> document ready to be saved to storage as `.html`
// (until puppeteer / @react-pdf is added — see TODO below) or printed
// directly by the browser.
//
// Reuses the shared `renderClinicHeader` so the consent matches every
// other PDF the org emits (recetas, notas clínicas, exámenes).
//
// TODO: convert to real PDF when puppeteer is incorporated. For now
// the HTML is the source artifact and is signed inline.

import { renderClinicHeader, type ClinicHeaderData } from "@/lib/pdf/clinic-header";
import { CONSENT_TYPE_LABELS, type InformedConsentType, type InformedConsentSignatureMethod } from "@/types/informed-consent";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface InformedConsentRenderInput {
  org: ClinicHeaderData;
  patientName: string;
  patientDocument?: string | null;
  doctorName?: string | null;
  doctorCmp?: string | null;
  consentType: InformedConsentType;
  procedureDescription: string;
  risksExplained?: string | null;
  serviceName?: string | null;
  signedByPatientName: string;
  signedAt: Date;
  signatureMethod: InformedConsentSignatureMethod;
  /** Base64 image src ("data:image/png;base64,...") for drawn signature. */
  signatureImageDataUrl?: string | null;
}

function formatDateTime(d: Date): string {
  // Lima time, intentionally locale-formatted in es-PE.
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(d);
}

export function renderInformedConsentHtml(input: InformedConsentRenderInput): string {
  const headerHtml = renderClinicHeader(input.org);
  const consentLabel = CONSENT_TYPE_LABELS[input.consentType] ?? input.consentType;

  const procedureBlock = `<p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(input.procedureDescription)}</p>`;
  const risksBlock = input.risksExplained?.trim()
    ? `<h3 style="font-size:13px;margin:18px 0 6px;color:#111;">Riesgos explicados</h3>
       <p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(input.risksExplained)}</p>`
    : "";
  const serviceBlock = input.serviceName
    ? `<p style="margin:0 0 6px;"><strong>Servicio:</strong> ${escapeHtml(input.serviceName)}</p>`
    : "";
  const doctorBlock = input.doctorName
    ? `<p style="margin:0 0 6px;"><strong>Médico tratante:</strong> ${escapeHtml(input.doctorName)}${
        input.doctorCmp ? ` — CMP ${escapeHtml(input.doctorCmp)}` : ""
      }</p>`
    : "";
  const patientDocBlock = input.patientDocument
    ? `<p style="margin:0 0 6px;"><strong>Documento:</strong> ${escapeHtml(input.patientDocument)}</p>`
    : "";

  const signatureBlock = input.signatureMethod === "drawn" && input.signatureImageDataUrl
    ? `<div style="margin-top:12px;">
         <img src="${escapeHtml(input.signatureImageDataUrl)}" alt="Firma del paciente"
              style="max-height:90px;max-width:280px;border-bottom:1px solid #555;" />
       </div>`
    : `<div style="margin-top:24px;border-bottom:1px solid #555;height:32px;"></div>
       <p style="font-size:11px;color:#374151;margin-top:6px;">
         (Firma electrónica vía aceptación tipeada — equivalente legal según Ley 27269)
       </p>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Consentimiento informado — ${escapeHtml(input.patientName)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #111; }
  h2 { font-size: 14px; margin: 18px 0 6px; color: #111; }
  h3 { font-size: 13px; margin: 14px 0 6px; color: #111; }
  .muted { color: #6b7280; font-size: 11px; }
  .legal { font-size: 10.5px; color: #374151; line-height: 1.5; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
</style>
</head>
<body>
${headerHtml}

<div style="margin-top:8px;">
  <h1>Consentimiento informado</h1>
  <p class="muted" style="margin:0 0 14px;">Tipo: <strong>${escapeHtml(consentLabel)}</strong></p>
</div>

<div class="box" style="margin-bottom:16px;">
  <p style="margin:0 0 6px;"><strong>Paciente:</strong> ${escapeHtml(input.patientName)}</p>
  ${patientDocBlock}
  ${doctorBlock}
  ${serviceBlock}
</div>

<h2>Procedimiento / tratamiento</h2>
${procedureBlock}

${risksBlock}

<h2>Declaración del paciente</h2>
<p class="legal" style="margin:0 0 8px;">
  Yo, <strong>${escapeHtml(input.signedByPatientName)}</strong>, declaro haber recibido del
  profesional médico la información clínica respecto al procedimiento o tratamiento
  arriba descrito, así como sus riesgos, alternativas y consecuencias previsibles.
  Manifiesto que las explicaciones se me han dado en términos comprensibles y que
  he tenido la oportunidad de hacer preguntas, las cuales me fueron respondidas a
  mi satisfacción.
</p>
<p class="legal" style="margin:0 0 8px;">
  En ejercicio del derecho que me reconocen la <strong>Ley 29414</strong> (derechos de las
  personas usuarias de los servicios de salud) y el <strong>D.S. 027-2015-SA</strong>,
  otorgo mi <strong>consentimiento informado, libre y voluntario</strong>, pudiendo
  revocarlo en cualquier momento previo a la ejecución del acto, sin perjuicio
  para la continuidad de mi atención.
</p>
<p class="legal" style="margin:0 0 16px;">
  Asimismo, acepto el tratamiento de mis datos personales y de salud para los fines
  asistenciales descritos, conforme a la <strong>Ley 29733</strong> y su reglamento.
</p>

<div style="display:flex;gap:32px;margin-top:24px;">
  <div style="flex:1;">
    <p style="font-weight:600;margin:0 0 4px;">Firma del paciente</p>
    ${signatureBlock}
    <p style="font-size:11px;color:#374151;margin-top:8px;">
      <strong>${escapeHtml(input.signedByPatientName)}</strong>
    </p>
    <p class="muted" style="margin:2px 0 0;">${escapeHtml(formatDateTime(input.signedAt))}</p>
  </div>
  <div style="flex:1;">
    <p style="font-weight:600;margin:0 0 4px;">Profesional responsable</p>
    <div style="height:90px;border-bottom:1px solid #555;"></div>
    <p style="font-size:11px;color:#374151;margin-top:8px;">
      ${escapeHtml(input.doctorName ?? "")}${input.doctorCmp ? ` — CMP ${escapeHtml(input.doctorCmp)}` : ""}
    </p>
  </div>
</div>

<p class="muted" style="margin-top:32px;text-align:center;">
  Documento generado electrónicamente. Conservado por la organización conforme a la
  normativa peruana aplicable.
</p>
</body>
</html>`;
}
