/**
 * Documento de nota clínica SOAP con @react-pdf/renderer.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { htmlToReactPdf } from "./html-to-react-pdf";
import type { ClinicHeaderData } from "./clinic-header";
import {
  ACCENT_FALLBACK,
  BORDER,
  BG_SOFT,
  ClinicHeader,
  SignatureBlock,
  TEXT_DARK,
  TEXT_MUTED,
  createPageStyles,
  formatPeruDate,
} from "./shared-pdf";

export interface ClinicalNoteDocumentDiagnosis {
  code: string;
  label: string;
  is_primary: boolean;
}

export interface ClinicalNoteVitals {
  weight_kg?: number | null;
  height_cm?: number | null;
  temp_c?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  heart_rate?: number | null;
  resp_rate?: number | null;
  spo2?: number | null;
}

export interface ClinicalNoteDocumentProps {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnoses: ClinicalNoteDocumentDiagnosis[];
  vitals: ClinicalNoteVitals;
  isSigned: boolean;
  signedAt?: string | null;
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  doctorCmp?: string | null;
  serviceName?: string | null;
  appointmentDate: string;
  appointmentTime?: string | null;
  clinic: ClinicHeaderData;
  customBodyHtml?: string | null;
}

const SOAP_LABELS: Record<"subjective" | "objective" | "assessment" | "plan", string> = {
  subjective: "Motivo de consulta (Subjetivo)",
  objective: "Objetivo",
  assessment: "Evaluación",
  plan: "Plan",
};

const SOAP_LETTERS = {
  subjective: "S",
  objective: "O",
  assessment: "A",
  plan: "P",
} as const;

const SOAP_COLORS = {
  subjective: "#3b82f6",
  objective: "#10b981",
  assessment: "#f59e0b",
  plan: "#a855f7",
} as const;

const VITALS_FIELDS: { key: keyof ClinicalNoteVitals; label: string; unit: string }[] = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "height_cm", label: "Talla", unit: "cm" },
  { key: "temp_c", label: "Temp.", unit: "°C" },
  { key: "bp_systolic", label: "PA Sist.", unit: "mmHg" },
  { key: "bp_diastolic", label: "PA Diast.", unit: "mmHg" },
  { key: "heart_rate", label: "FC", unit: "lpm" },
  { key: "resp_rate", label: "FR", unit: "rpm" },
  { key: "spo2", label: "SpO₂", unit: "%" },
];

function noteStyles() {
  return StyleSheet.create({
    soapBlock: {
      marginBottom: 10,
    },
    soapHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
    },
    soapBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      color: "#fff",
      fontSize: 10,
      fontWeight: "bold",
      textAlign: "center",
      paddingTop: 2,
    },
    soapLabel: {
      fontSize: 10,
      fontWeight: "bold",
      color: TEXT_MUTED,
      letterSpacing: 0.5,
    },
    soapBody: {
      paddingLeft: 24,
      fontSize: 11,
      lineHeight: 1.5,
    },
    diagnosesBox: {
      marginTop: 8,
      marginBottom: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
      backgroundColor: BG_SOFT,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: BORDER,
    },
    diagnosisRow: {
      flexDirection: "row",
      gap: 4,
      fontSize: 10,
      marginBottom: 2,
    },
    primaryBadge: {
      fontSize: 8,
      backgroundColor: "#dcfce7",
      color: "#15803d",
      paddingHorizontal: 4,
      borderRadius: 2,
    },
    vitalsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 6,
    },
    vitalCell: {
      width: "23.5%",
      borderWidth: 1,
      borderColor: BORDER,
      borderRadius: 3,
      paddingVertical: 4,
      paddingHorizontal: 6,
      alignItems: "center",
    },
    vitalLabel: { fontSize: 8, color: TEXT_MUTED },
    vitalValue: { fontSize: 11, fontWeight: "bold", color: TEXT_DARK },
  });
}

export function ClinicalNoteDocument(props: ClinicalNoteDocumentProps) {
  const accent = props.clinic.print_color_primary || ACCENT_FALLBACK;
  const s = createPageStyles(accent);
  const n = noteStyles();
  const formattedDate = formatPeruDate(props.appointmentDate);
  const customBody = props.customBodyHtml ? htmlToReactPdf(props.customBodyHtml) : null;
  const sortedDiagnoses = [...props.diagnoses].sort(
    (a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1)
  );
  const vitalsEntries = VITALS_FIELDS.filter((f) => props.vitals[f.key] != null);

  const soapKeys: ("subjective" | "objective" | "assessment" | "plan")[] = [
    "subjective",
    "objective",
    "assessment",
    "plan",
  ];

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ClinicHeader clinic={props.clinic} s={s} />

        <Text style={s.title}>NOTA CLÍNICA</Text>
        <Text style={s.titleDate}>
          {formattedDate}
          {props.appointmentTime ? ` · ${props.appointmentTime}` : ""}
        </Text>

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
          {props.serviceName ? (
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>Servicio</Text>
              <Text style={s.infoValue}>{props.serviceName}</Text>
            </View>
          ) : (
            <View style={s.infoCell} />
          )}
        </View>

        {/* SOAP */}
        {soapKeys.map((key) => {
          const content = props[key];
          if (!content) return null;
          return (
            <View key={key} style={n.soapBlock} wrap={false}>
              <View style={n.soapHeader}>
                <Text
                  style={[n.soapBadge, { backgroundColor: SOAP_COLORS[key] }]}
                >
                  {SOAP_LETTERS[key]}
                </Text>
                <Text style={n.soapLabel}>{SOAP_LABELS[key].toUpperCase()}</Text>
              </View>
              <Text style={n.soapBody}>{content}</Text>
            </View>
          );
        })}

        {/* Diagnósticos */}
        {sortedDiagnoses.length > 0 ? (
          <View style={n.diagnosesBox}>
            <Text style={[s.infoLabel, { marginBottom: 4 }]}>
              DIAGNÓSTICO{sortedDiagnoses.length > 1 ? "S" : ""}
            </Text>
            {sortedDiagnoses.map((d) => (
              <View key={d.code} style={n.diagnosisRow}>
                <Text style={{ fontWeight: "bold", color: accent }}>{d.code}</Text>
                <Text>—</Text>
                <Text style={{ flex: 1 }}>{d.label}</Text>
                {d.is_primary && sortedDiagnoses.length > 1 ? (
                  <Text style={n.primaryBadge}>PRINCIPAL</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Vitales */}
        {vitalsEntries.length > 0 ? (
          <View wrap={false}>
            <Text style={[s.infoLabel, { marginTop: 6, marginBottom: 4 }]}>
              SIGNOS VITALES
            </Text>
            <View style={n.vitalsGrid}>
              {vitalsEntries.map((f) => (
                <View key={f.key} style={n.vitalCell}>
                  <Text style={n.vitalLabel}>{f.label}</Text>
                  <Text style={n.vitalValue}>
                    {String(props.vitals[f.key])}{" "}
                    <Text style={n.vitalLabel}>{f.unit}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {customBody ? <View style={s.customBody}>{customBody}</View> : null}

        {props.isSigned ? (
          <SignatureBlock doctorName={props.doctorName} doctorCmp={props.doctorCmp} s={s} />
        ) : null}

        {props.isSigned && props.signedAt ? (
          <Text style={[s.footer, { marginTop: 8 }]}>
            Firmada el {formatPeruDate(props.signedAt)}
          </Text>
        ) : null}

        <Text style={s.footer} fixed>
          Documento generado el {new Date().toLocaleString("es-PE")}
        </Text>
      </Page>
    </Document>
  );
}
