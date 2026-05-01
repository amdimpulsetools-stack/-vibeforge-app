/**
 * Documento de consentimiento informado con @react-pdf/renderer.
 *
 * Reemplaza al `renderInformedConsentHtml()` HTML-only anterior.
 */

import {
  Document,
  Image,
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
  TEXT_DARK,
  TEXT_MUTED,
  createPageStyles,
} from "./shared-pdf";

export interface ConsentDocumentProps {
  consentLabel: string;
  procedureDescription: string;
  risksExplained?: string | null;
  serviceName?: string | null;
  patientName: string;
  patientDni?: string | null;
  doctorName: string;
  doctorCmp?: string | null;
  signedByPatientName: string;
  signedAt: string; // ISO timestamp
  signatureMethod: "typed" | "drawn";
  signatureImageDataUrl?: string | null;
  clinic: ClinicHeaderData;
  customBodyHtml?: string | null;
}

function consentStyles() {
  return StyleSheet.create({
    typeBadge: {
      fontSize: 10,
      color: TEXT_MUTED,
      marginBottom: 14,
    },
    typeBadgeStrong: { fontWeight: "bold", color: TEXT_DARK },
    h2: {
      fontSize: 13,
      fontWeight: "bold",
      marginTop: 14,
      marginBottom: 6,
    },
    legal: {
      fontSize: 10,
      lineHeight: 1.5,
      color: "#222",
      marginBottom: 6,
    },
    procedure: {
      fontSize: 11,
      lineHeight: 1.5,
      marginBottom: 8,
    },
    signatureRow: {
      flexDirection: "row",
      gap: 20,
      marginTop: 18,
    },
    signatureCol: { flex: 1 },
    signatureLabel: {
      fontSize: 10,
      fontWeight: "bold",
      marginBottom: 4,
    },
    signatureLine: {
      borderBottomWidth: 1,
      borderBottomColor: "#555",
      height: 70,
      marginBottom: 4,
    },
    signatureImg: {
      maxHeight: 70,
      maxWidth: 220,
      marginBottom: 4,
    },
    signatureMeta: {
      fontSize: 9,
      color: TEXT_MUTED,
    },
    signatureDisclaimer: {
      fontSize: 9,
      color: "#374151",
      marginTop: 2,
      fontStyle: "italic",
    },
  });
}

function formatDateTimePeru(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-PE", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "America/Lima",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ConsentDocument(props: ConsentDocumentProps) {
  const accent = props.clinic.print_color_primary || ACCENT_FALLBACK;
  const s = createPageStyles(accent);
  const c = consentStyles();
  const customBody = props.customBodyHtml ? htmlToReactPdf(props.customBodyHtml) : null;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <ClinicHeader clinic={props.clinic} s={s} />

        <Text style={s.title}>CONSENTIMIENTO INFORMADO</Text>
        <Text style={c.typeBadge}>
          Tipo: <Text style={c.typeBadgeStrong}>{props.consentLabel}</Text>
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
            <Text style={s.infoLabel}>Médico tratante</Text>
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

        <Text style={c.h2}>Procedimiento / tratamiento</Text>
        <Text style={c.procedure}>{props.procedureDescription}</Text>

        {props.risksExplained?.trim() ? (
          <>
            <Text style={c.h2}>Riesgos explicados</Text>
            <Text style={c.procedure}>{props.risksExplained}</Text>
          </>
        ) : null}

        <Text style={c.h2}>Declaración del paciente</Text>
        <Text style={c.legal}>
          Yo, <Text style={{ fontWeight: "bold" }}>{props.signedByPatientName}</Text>, declaro haber
          recibido del profesional médico la información clínica respecto al procedimiento o
          tratamiento arriba descrito, así como sus riesgos, alternativas y consecuencias previsibles.
          Manifiesto que las explicaciones se me han dado en términos comprensibles y que he tenido
          la oportunidad de hacer preguntas, las cuales me fueron respondidas a mi satisfacción.
        </Text>
        <Text style={c.legal}>
          En ejercicio del derecho que me reconocen la{" "}
          <Text style={{ fontWeight: "bold" }}>Ley 29414</Text> y el{" "}
          <Text style={{ fontWeight: "bold" }}>D.S. 027-2015-SA</Text>, otorgo mi consentimiento
          informado, libre y voluntario, pudiendo revocarlo en cualquier momento previo a la
          ejecución del acto, sin perjuicio para la continuidad de mi atención.
        </Text>
        <Text style={c.legal}>
          Asimismo, acepto el tratamiento de mis datos personales y de salud para los fines
          asistenciales descritos, conforme a la <Text style={{ fontWeight: "bold" }}>Ley 29733</Text>{" "}
          y su reglamento.
        </Text>

        {customBody ? <View style={s.customBody}>{customBody}</View> : null}

        <View style={c.signatureRow} wrap={false}>
          <View style={c.signatureCol}>
            <Text style={c.signatureLabel}>Firma del paciente</Text>
            {props.signatureMethod === "drawn" && props.signatureImageDataUrl ? (
              <Image src={props.signatureImageDataUrl} style={c.signatureImg} />
            ) : (
              <View style={c.signatureLine} />
            )}
            <Text style={[c.signatureMeta, { fontWeight: "bold" }]}>
              {props.signedByPatientName}
            </Text>
            <Text style={c.signatureMeta}>{formatDateTimePeru(props.signedAt)}</Text>
            {props.signatureMethod === "typed" ? (
              <Text style={c.signatureDisclaimer}>
                (Firma electrónica vía aceptación tipeada — Ley 27269)
              </Text>
            ) : null}
          </View>
          <View style={c.signatureCol}>
            <Text style={c.signatureLabel}>Profesional responsable</Text>
            <View style={c.signatureLine} />
            <Text style={c.signatureMeta}>
              {props.doctorName}
              {props.doctorCmp ? ` · CMP ${props.doctorCmp}` : ""}
            </Text>
          </View>
        </View>

        <Text style={[s.footer, { borderTopWidth: 0, marginTop: 30 }]}>
          Documento generado electrónicamente. Conservado conforme a la normativa peruana aplicable.
        </Text>
      </Page>
    </Document>
  );
}
