/**
 * Documento de orden de exámenes con @react-pdf/renderer.
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
  ClinicHeader,
  SignatureBlock,
  TEXT_DARK,
  TEXT_MUTED,
  createPageStyles,
  formatPeruDate,
} from "./shared-pdf";

export interface ExamItem {
  exam_name: string;
  instructions?: string | null;
}

export interface ExamOrderDocumentProps {
  items: ExamItem[];
  diagnosis?: string | null;
  diagnosisCode?: string | null;
  notes?: string | null;
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  doctorCmp?: string | null;
  appointmentDate: string;
  clinic: ClinicHeaderData;
  customBodyHtml?: string | null;
}

function examStyles(accent: string) {
  return StyleSheet.create({
    examRow: {
      flexDirection: "row",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    examIndex: {
      width: 22,
      fontWeight: "bold",
      color: accent,
      fontSize: 12,
    },
    examBody: { flex: 1 },
    examName: { fontSize: 12, fontWeight: "bold", color: TEXT_DARK, marginBottom: 2 },
    examInstructions: {
      fontSize: 10,
      fontStyle: "italic",
      color: "#444",
      marginTop: 2,
      paddingLeft: 6,
      borderLeftWidth: 2,
      borderLeftColor: accent,
    },
    diagnosisBox: {
      marginBottom: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: "#f0f9ff",
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "#bae6fd",
    },
    notesBox: {
      marginTop: 12,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: "#fefce8",
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "#fde68a",
    },
  });
}

export function ExamOrderDocument(props: ExamOrderDocumentProps) {
  const accent = props.clinic.print_color_primary || ACCENT_FALLBACK;
  const s = createPageStyles(accent);
  const e = examStyles(accent);
  const formattedDate = formatPeruDate(props.appointmentDate);
  const customBody = props.customBodyHtml ? htmlToReactPdf(props.customBodyHtml) : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ClinicHeader clinic={props.clinic} s={s} />

        <Text style={s.title}>ORDEN DE EXÁMENES</Text>
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

        {props.diagnosis ? (
          <View style={e.diagnosisBox}>
            <Text style={s.infoLabel}>Diagnóstico presuntivo</Text>
            <Text style={[s.infoValue, { fontSize: 11 }]}>
              {props.diagnosis}
              {props.diagnosisCode ? (
                <Text style={{ color: TEXT_MUTED, fontWeight: "normal" }}>
                  {" "}({props.diagnosisCode})
                </Text>
              ) : null}
            </Text>
          </View>
        ) : null}

        <Text style={s.sectionTitle}>
          Exámenes solicitados ({props.items.length})
        </Text>

        {props.items.map((item, i) => (
          <View key={i} style={e.examRow} wrap={false}>
            <Text style={e.examIndex}>{i + 1}.</Text>
            <View style={e.examBody}>
              <Text style={e.examName}>{item.exam_name}</Text>
              {item.instructions ? (
                <Text style={e.examInstructions}>Indicaciones: {item.instructions}</Text>
              ) : null}
            </View>
          </View>
        ))}

        {props.notes ? (
          <View style={e.notesBox}>
            <Text style={[s.infoLabel, { marginBottom: 2 }]}>NOTA</Text>
            <Text style={{ fontSize: 11 }}>{props.notes}</Text>
          </View>
        ) : null}

        {customBody ? <View style={s.customBody}>{customBody}</View> : null}

        <SignatureBlock doctorName={props.doctorName} doctorCmp={props.doctorCmp} s={s} />

        <Text style={s.footer} fixed>
          Documento generado el {new Date().toLocaleString("es-PE")}
        </Text>
      </Page>
    </Document>
  );
}
