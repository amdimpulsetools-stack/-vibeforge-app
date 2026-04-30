/**
 * Documento de receta médica con @react-pdf/renderer.
 *
 * Reemplaza al `buildPrescriptionPrintHTML()` (window.print) anterior. Este
 * componente es server-only: lo invoca `/api/pdf/prescription/[id]` para
 * producir un PDF real (no captura de HTML).
 *
 * Estructura:
 *   1. Membrete (logo + datos org) — replica visual de renderClinicHeader()
 *   2. Título "RECETA MÉDICA" + fecha
 *   3. Box con datos paciente/doctor
 *   4. Lista de medicamentos (renderizada por código, no por plantilla — los
 *      datos son dinámicos)
 *   5. Cuerpo personalizable (body_html del template, vía html-to-react-pdf)
 *   6. Firma + footer legal
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { htmlToReactPdf } from "./html-to-react-pdf";
import type { ClinicHeaderData } from "./clinic-header";

export interface PrescriptionItem {
  medication: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  route?: string | null;
  quantity?: string | null;
  instructions?: string | null;
}

export interface PrescriptionDocumentProps {
  prescriptions: PrescriptionItem[];
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  doctorCmp?: string | null;
  appointmentDate: string;
  clinic: ClinicHeaderData;
  /** HTML personalizado de la org (clinical_document_templates.body_html).
   *  Variables {{paciente_nombre}} etc. ya deben venir interpoladas. */
  customBodyHtml?: string | null;
}

const ACCENT_FALLBACK = "#10b981";
const TEXT_DARK = "#111111";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG_SOFT = "#f9fafb";
const BG_CHIP = "#f3f4f6";

function styles(accent: string) {
  return StyleSheet.create({
    page: {
      paddingTop: 30,
      paddingBottom: 30,
      paddingHorizontal: 36,
      fontSize: 11,
      color: TEXT_DARK,
      fontFamily: "Helvetica",
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    logo: { width: 56, height: 56, objectFit: "contain" },
    headerTextBlock: { flex: 1 },
    clinicName: { fontSize: 13, fontWeight: "bold", color: accent },
    clinicTagline: { fontSize: 9, color: TEXT_MUTED, marginTop: 1 },
    clinicMeta: { fontSize: 9, color: TEXT_MUTED, marginTop: 3, lineHeight: 1.4 },
    title: {
      fontSize: 14,
      fontWeight: "bold",
      letterSpacing: 1,
      textAlign: "center",
      marginBottom: 2,
    },
    titleDate: {
      fontSize: 9,
      color: TEXT_MUTED,
      textAlign: "center",
      marginBottom: 12,
    },
    infoBox: {
      flexDirection: "row",
      flexWrap: "wrap",
      backgroundColor: BG_SOFT,
      borderWidth: 1,
      borderColor: BORDER,
      borderRadius: 4,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginBottom: 14,
      gap: 4,
    },
    infoCell: { width: "50%", marginBottom: 2 },
    infoLabel: { fontSize: 9, color: TEXT_MUTED },
    infoValue: { fontSize: 11, fontWeight: "bold" },
    rxHeader: {
      fontSize: 11,
      fontWeight: "bold",
      letterSpacing: 0.5,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
      marginBottom: 6,
    },
    rxRow: {
      flexDirection: "row",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    rxIndex: {
      width: 22,
      fontWeight: "bold",
      color: accent,
      fontSize: 12,
    },
    rxBody: { flex: 1 },
    rxName: { fontSize: 12, fontWeight: "bold", marginBottom: 2 },
    rxChips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
    rxChip: {
      fontSize: 9,
      backgroundColor: BG_CHIP,
      borderRadius: 3,
      paddingHorizontal: 5,
      paddingVertical: 1,
      color: "#444",
    },
    rxInstructions: {
      fontSize: 10,
      fontStyle: "italic",
      color: "#444",
      marginTop: 4,
      paddingLeft: 6,
      borderLeftWidth: 2,
      borderLeftColor: accent,
    },
    customBody: { marginTop: 14, marginBottom: 14, fontSize: 10, color: "#222" },
    signatureBlock: {
      marginTop: 40,
      alignItems: "center",
    },
    signatureLine: {
      width: 220,
      borderTopWidth: 1,
      borderTopColor: TEXT_DARK,
      paddingTop: 5,
      alignItems: "center",
    },
    signatureName: { fontSize: 11, fontWeight: "bold" },
    signatureRole: { fontSize: 9, color: TEXT_MUTED, marginTop: 1 },
    footer: {
      marginTop: 22,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: BORDER,
      fontSize: 8,
      color: "#9ca3af",
      textAlign: "center",
    },
  });
}

function joinParts(parts: (string | null | undefined)[], sep = " · "): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep);
}

function ClinicHeader({ clinic, s }: { clinic: ClinicHeaderData; s: ReturnType<typeof styles> }) {
  const contact = joinParts([
    clinic.address ? `${clinic.address}${clinic.district ? `, ${clinic.district}` : ""}` : null,
    clinic.phone,
    clinic.email_public,
    clinic.website,
  ]);
  const ruc = clinic.ruc ? `RUC: ${clinic.ruc}` : null;
  const legalLine = joinParts([clinic.legal_name, ruc]);

  return (
    <View style={s.header}>
      {clinic.logo_url ? (
        // @react-pdf/renderer descarga la imagen vía fetch al renderizar.
        <Image src={clinic.logo_url} style={s.logo} />
      ) : null}
      <View style={s.headerTextBlock}>
        <Text style={s.clinicName}>{clinic.name}</Text>
        {clinic.tagline ? <Text style={s.clinicTagline}>{clinic.tagline}</Text> : null}
        {contact ? <Text style={s.clinicMeta}>{contact}</Text> : null}
        {legalLine ? <Text style={s.clinicMeta}>{legalLine}</Text> : null}
      </View>
    </View>
  );
}

export function PrescriptionDocument(props: PrescriptionDocumentProps) {
  const accent = props.clinic.print_color_primary || ACCENT_FALLBACK;
  const s = styles(accent);
  const formattedDate = formatDate(props.appointmentDate);

  const customBody: ReactNode = props.customBodyHtml
    ? htmlToReactPdf(props.customBodyHtml)
    : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ClinicHeader clinic={props.clinic} s={s} />

        <Text style={s.title}>RECETA MÉDICA</Text>
        <Text style={s.titleDate}>{formattedDate}</Text>

        <View style={s.infoBox}>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Paciente</Text>
            <Text style={s.infoValue}>{props.patientName}</Text>
          </View>
          {props.patientDni ? (
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>DNI</Text>
              <Text style={s.infoValue}>{props.patientDni}</Text>
            </View>
          ) : (
            <View style={s.infoCell} />
          )}
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Doctor</Text>
            <Text style={s.infoValue}>
              {props.doctorName}
              {props.doctorCmp ? ` · CMP ${props.doctorCmp}` : ""}
            </Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>Fecha</Text>
            <Text style={s.infoValue}>{formattedDate}</Text>
          </View>
        </View>

        <Text style={s.rxHeader}>
          Rp/ ({props.prescriptions.length}{" "}
          {props.prescriptions.length === 1 ? "medicamento" : "medicamentos"})
        </Text>

        {props.prescriptions.map((rx, i) => (
          <View key={i} style={s.rxRow} wrap={false}>
            <Text style={s.rxIndex}>{i + 1}.</Text>
            <View style={s.rxBody}>
              <Text style={s.rxName}>
                {rx.medication}
                {rx.dosage ? ` — ${rx.dosage}` : ""}
              </Text>
              <View style={s.rxChips}>
                {rx.route ? <Text style={s.rxChip}>Vía: {rx.route}</Text> : null}
                {rx.frequency ? <Text style={s.rxChip}>{rx.frequency}</Text> : null}
                {rx.duration ? <Text style={s.rxChip}>Duración: {rx.duration}</Text> : null}
                {rx.quantity ? <Text style={s.rxChip}>Cantidad: {rx.quantity}</Text> : null}
              </View>
              {rx.instructions ? (
                <Text style={s.rxInstructions}>Indicaciones: {rx.instructions}</Text>
              ) : null}
            </View>
          </View>
        ))}

        {customBody ? <View style={s.customBody}>{customBody}</View> : null}

        <View style={s.signatureBlock}>
          <View style={s.signatureLine}>
            <Text style={s.signatureName}>{props.doctorName}</Text>
            <Text style={s.signatureRole}>
              {props.doctorCmp ? `CMP ${props.doctorCmp} · ` : ""}Médico tratante
            </Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          Documento generado el {new Date().toLocaleString("es-PE")}
        </Text>
      </Page>
    </Document>
  );
}

function formatDate(yyyyMmDd: string): string {
  // Acepta "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss". Construye fecha local.
  try {
    const d = new Date(
      yyyyMmDd.includes("T") ? yyyyMmDd : `${yyyyMmDd}T00:00:00`
    );
    return d.toLocaleDateString("es-PE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return yyyyMmDd;
  }
}

