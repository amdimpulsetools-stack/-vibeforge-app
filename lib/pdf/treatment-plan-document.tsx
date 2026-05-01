/**
 * Documento de plan de tratamiento con @react-pdf/renderer.
 *
 * Renderiza:
 *   - Título + diagnóstico CIE-10
 *   - Datos paciente / doctor
 *   - Items del plan (servicios, cantidad, precio unitario, subtotal)
 *   - Total
 *   - Body personalizable (notas para el paciente, términos)
 *   - Firma del médico
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

export interface TreatmentPlanItem {
  service_name: string;
  quantity: number;
  unit_price: number;
}

export interface TreatmentPlanDocumentProps {
  title: string;
  description?: string | null;
  diagnosisCode?: string | null;
  diagnosisLabel?: string | null;
  totalSessions?: number | null;
  startDate?: string | null;
  estimatedEndDate?: string | null;
  items: TreatmentPlanItem[];
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  doctorCmp?: string | null;
  clinic: ClinicHeaderData;
  customBodyHtml?: string | null;
}

function tpStyles(accent: string) {
  return StyleSheet.create({
    diagnosisBox: {
      marginBottom: 10,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: "#f0f9ff",
      borderRadius: 4,
      borderWidth: 1,
      borderColor: "#bae6fd",
    },
    descriptionBox: {
      marginBottom: 12,
      fontSize: 11,
      lineHeight: 1.5,
    },
    table: { borderWidth: 1, borderColor: BORDER, borderRadius: 3 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f9fafb",
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    tableRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    tableHeaderCell: {
      fontSize: 9,
      fontWeight: "bold",
      color: TEXT_MUTED,
      letterSpacing: 0.5,
    },
    cellService: { flex: 3 },
    cellQty: { flex: 1, textAlign: "center" },
    cellPrice: { flex: 1, textAlign: "right" },
    cellSubtotal: { flex: 1, textAlign: "right" },
    totalRow: {
      flexDirection: "row",
      paddingVertical: 8,
      paddingHorizontal: 8,
      backgroundColor: "#f9fafb",
    },
    totalLabel: { flex: 5, textAlign: "right", fontWeight: "bold", fontSize: 11 },
    totalValue: { flex: 1, textAlign: "right", fontWeight: "bold", fontSize: 12, color: accent },
  });
}

function formatCurrency(amount: number): string {
  return `S/. ${amount.toFixed(2)}`;
}

export function TreatmentPlanDocument(props: TreatmentPlanDocumentProps) {
  const accent = props.clinic.print_color_primary || ACCENT_FALLBACK;
  const s = createPageStyles(accent);
  const t = tpStyles(accent);
  const customBody = props.customBodyHtml ? htmlToReactPdf(props.customBodyHtml) : null;
  const total = props.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const issuedDate = formatPeruDate(new Date().toISOString().slice(0, 10));

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ClinicHeader clinic={props.clinic} s={s} />

        <Text style={s.title}>PLAN DE TRATAMIENTO</Text>
        <Text style={s.titleDate}>{issuedDate}</Text>

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
          {props.totalSessions ? (
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>Sesiones</Text>
              <Text style={s.infoValue}>{props.totalSessions}</Text>
            </View>
          ) : (
            <View style={s.infoCell} />
          )}
          {props.startDate ? (
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>Inicio</Text>
              <Text style={s.infoValue}>{formatPeruDate(props.startDate)}</Text>
            </View>
          ) : null}
          {props.estimatedEndDate ? (
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>Fin estimado</Text>
              <Text style={s.infoValue}>{formatPeruDate(props.estimatedEndDate)}</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.sectionTitle}>{props.title}</Text>

        {props.diagnosisCode || props.diagnosisLabel ? (
          <View style={t.diagnosisBox}>
            <Text style={s.infoLabel}>Diagnóstico</Text>
            <Text style={[s.infoValue, { fontSize: 11 }]}>
              {props.diagnosisCode ? (
                <Text style={{ fontWeight: "bold", color: accent }}>{props.diagnosisCode} </Text>
              ) : null}
              {props.diagnosisLabel ?? ""}
            </Text>
          </View>
        ) : null}

        {props.description ? (
          <Text style={t.descriptionBox}>{props.description}</Text>
        ) : null}

        {props.items.length > 0 ? (
          <View style={t.table}>
            <View style={t.tableHeader}>
              <Text style={[t.tableHeaderCell, t.cellService]}>SERVICIO</Text>
              <Text style={[t.tableHeaderCell, t.cellQty]}>CANT.</Text>
              <Text style={[t.tableHeaderCell, t.cellPrice]}>PRECIO U.</Text>
              <Text style={[t.tableHeaderCell, t.cellSubtotal]}>SUBTOTAL</Text>
            </View>
            {props.items.map((item, i) => (
              <View key={i} style={t.tableRow}>
                <Text style={t.cellService}>{item.service_name}</Text>
                <Text style={t.cellQty}>{item.quantity}</Text>
                <Text style={t.cellPrice}>{formatCurrency(item.unit_price)}</Text>
                <Text style={t.cellSubtotal}>
                  {formatCurrency(item.quantity * item.unit_price)}
                </Text>
              </View>
            ))}
            <View style={t.totalRow}>
              <Text style={t.totalLabel}>TOTAL</Text>
              <Text style={t.totalValue}>{formatCurrency(total)}</Text>
            </View>
          </View>
        ) : null}

        {customBody ? <View style={s.customBody}>{customBody}</View> : null}

        <SignatureBlock doctorName={props.doctorName} doctorCmp={props.doctorCmp} s={s} />

        <Text style={s.footer} fixed>
          Plan generado el {new Date().toLocaleString("es-PE")}
        </Text>
      </Page>
    </Document>
  );
}
