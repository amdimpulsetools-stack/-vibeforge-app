/**
 * <BudgetPdfDocument /> — fertility-tier budget PDF (Phase 4).
 *
 * Single template that adapts to any treatment + tier. We do NOT
 * pixel-replicate the Vitra .docx originals: the goal is a clean,
 * professional document that surfaces the right info (paciente,
 * tratamiento, tier, monto, qué incluye, consideraciones).
 *
 * Custom font loading via `Font.register()` was intentionally skipped
 * for the MVP — Helvetica (the @react-pdf/renderer default) renders
 * predictably without bundle/network cost. Polish for later.
 *
 * Server-only: invoked from `/api/budgets/[id]/pdf` via `renderToBuffer`.
 */

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const ACCENT_EMERALD = "#10b981";
const ACCENT_DEEP = "#047857";
const TEXT_DARK = "#111111";
const TEXT_MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BG_SOFT = "#f9fafb";

export interface BudgetPdfProps {
  org: {
    name: string;
    ruc?: string | null;
    logoDataUrl?: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    documentNumber?: string | null;
  };
  doctor: { fullName: string };
  asesora: { fullName: string } | null;
  service: { name: string; treatmentType: string };
  tier: "A" | "B" | "C" | null;
  amount: number;
  // Sobreprecio de honorarios médicos (mig 174). Ya está incluido en
  // `amount`; se expone por separado para las plantillas que itemizan
  // honorarios (Vitra FIV) y necesitan integrarlo en esa línea + total.
  // Ausente/0 = sin ajuste.
  honorariosAdjustment?: number;
  currency: "PEN" | "USD";
  includesText: string | null;
  fecha: Date;
  // Per-org customization (Capa 1). The generator always supplies
  // these — pulled from `org_budget_pdf_settings` with a hardcoded
  // fallback for the rare case the row is missing.
  vigenciaDays: number;
  terms: string[];
  footerText: string;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 36,
    paddingHorizontal: 0,
    fontSize: 10,
    color: TEXT_DARK,
    fontFamily: "Helvetica",
  },
  // Top header band: emerald bar with org name centered, plus a thin
  // deeper-emerald accent line beneath that mimics Vitra's "barrita
  // lateral de colores".
  headerBand: {
    height: 38,
    backgroundColor: ACCENT_EMERALD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
  },
  headerLogo: {
    position: "absolute",
    left: 36,
    top: 6,
    height: 26,
    width: 26,
    objectFit: "contain",
  },
  headerOrgName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "center",
  },
  accentBar: { height: 4, backgroundColor: ACCENT_DEEP },

  body: { paddingHorizontal: 36, paddingTop: 18 },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    letterSpacing: 2,
    marginBottom: 14,
    color: ACCENT_DEEP,
  },

  metaTable: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    marginBottom: 14,
    overflow: "hidden",
  },
  metaCol: { flex: 1, padding: 10 },
  metaColDivider: { borderLeftWidth: 1, borderLeftColor: BORDER },
  metaLabel: {
    fontSize: 8,
    color: TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  metaValue: { fontSize: 10, color: TEXT_DARK, marginTop: 1 },

  card: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 12,
    marginBottom: 14,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: "bold",
    color: TEXT_DARK,
  },
  tierLabel: {
    fontSize: 9,
    color: ACCENT_DEEP,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 8,
    fontWeight: "bold",
  },
  includesHeading: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 6,
    marginBottom: 4,
  },
  includesItem: {
    fontSize: 10,
    color: TEXT_DARK,
    marginBottom: 2,
    lineHeight: 1.4,
  },

  totalBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: ACCENT_EMERALD,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: {
    fontSize: 11,
    color: ACCENT_DEEP,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "bold",
  },
  totalAmount: {
    fontSize: 20,
    color: ACCENT_DEEP,
    fontWeight: "bold",
  },

  considHeading: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 6,
    color: TEXT_DARK,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  considItem: {
    fontSize: 9,
    color: TEXT_DARK,
    marginBottom: 3,
    lineHeight: 1.4,
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    fontSize: 8,
    color: TEXT_MUTED,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerLeft: { flex: 1 },
  footerRight: { flex: 1, alignItems: "flex-end" },
  signatureLine: {
    fontSize: 9,
    color: TEXT_MUTED,
    textAlign: "right",
  },
  asesoraLine: {
    fontSize: 9,
    color: TEXT_DARK,
    textAlign: "right",
    marginTop: 2,
  },
});

const TIER_TO_PAQUETE: Record<"A" | "B" | "C", string> = {
  A: "PAQUETE A",
  B: "PAQUETE B",
  C: "PAQUETE C",
};

// Generic per-treatment "qué incluye" fallback used when the tier has
// no `includes_text`. Kept intentionally short — admins can fill the
// canonical version per tier from /admin/services.
const GENERIC_INCLUDES: Record<string, string[]> = {
  FIV: [
    "Honorarios médicos del ciclo de FIV",
    "Aspiración folicular y procedimiento de FIV",
    "Vitrificación de embriones",
    "Transferencia embrionaria",
  ],
  IIU: [
    "Honorarios médicos del ciclo",
    "Controles ovulatorios",
    "Procedimiento de inseminación intrauterina",
  ],
  ROPA: [
    "Honorarios médicos del ciclo ROPA",
    "Aspiración folicular en pareja donante",
    "Transferencia embrionaria a la pareja receptora",
  ],
  CRIO: [
    "Honorarios médicos",
    "Estimulación ovárica controlada",
    "Aspiración folicular",
    "Vitrificación de óvulos",
  ],
  OVODONACION: [
    "Honorarios médicos",
    "Selección y compatibilización con donante",
    "Procedimiento de FIV con óvulos donados",
    "Estudio genético NGS",
  ],
  TED: [
    "Honorarios médicos de la transferencia",
    "Desvitrificación de embriones",
    "Control endometrial",
    "Transferencia embrionaria diferida",
  ],
  INDUCCION: [
    "Honorarios médicos",
    "Controles ovulatorios",
    "Indicaciones de inducción de ovulación",
  ],
  OTRO: [
    "Detalle a coordinar con el equipo médico tratante.",
  ],
};

function formatPeruDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatAmount(amount: number, currency: "PEN" | "USD"): string {
  const prefix = currency === "USD" ? "US$" : "S/";
  return `${prefix} ${amount.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function deriveIncludesItems(
  includesText: string | null,
  treatmentType: string,
): string[] {
  if (includesText && includesText.trim()) {
    return includesText
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\-•*]\s*/, "").trim())
      .filter((line) => line.length > 0);
  }
  return GENERIC_INCLUDES[treatmentType] ?? GENERIC_INCLUDES.OTRO;
}

export function BudgetPdfDocument(props: BudgetPdfProps): React.ReactElement {
  const {
    org,
    patient,
    doctor,
    asesora,
    service,
    tier,
    amount,
    currency,
    includesText,
    fecha,
    vigenciaDays,
    terms,
    footerText,
  } = props;

  const fechaLabel = formatPeruDate(fecha);
  const safeVigenciaDays =
    Number.isFinite(vigenciaDays) && vigenciaDays > 0 ? vigenciaDays : 30;
  const vigenciaDate = new Date(fecha);
  vigenciaDate.setDate(vigenciaDate.getDate() + safeVigenciaDays);
  const vigenciaLabel = `${safeVigenciaDays} días (hasta ${formatPeruDate(vigenciaDate)})`;

  const patientName = `${patient.firstName} ${patient.lastName}`.trim();
  const includesItems = deriveIncludesItems(includesText, service.treatmentType);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBand} fixed>
          {org.logoDataUrl ? (
            <Image src={org.logoDataUrl} style={styles.headerLogo} />
          ) : null}
          <Text style={styles.headerOrgName}>{org.name.toUpperCase()}</Text>
        </View>
        <View style={styles.accentBar} fixed />

        <View style={styles.body}>
          <Text style={styles.title}>PRESUPUESTO</Text>

          <View style={styles.metaTable}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>Paciente</Text>
              <Text style={styles.metaValue}>{patientName || "—"}</Text>

              <Text style={styles.metaLabel}>Documento</Text>
              <Text style={styles.metaValue}>
                {patient.documentNumber ?? "—"}
              </Text>

              <Text style={styles.metaLabel}>Tratamiento</Text>
              <Text style={styles.metaValue}>{service.name}</Text>

              <Text style={styles.metaLabel}>Tier</Text>
              <Text style={styles.metaValue}>{tier ?? "—"}</Text>
            </View>

            <View style={[styles.metaCol, styles.metaColDivider]}>
              <Text style={styles.metaLabel}>Fecha</Text>
              <Text style={styles.metaValue}>{fechaLabel}</Text>

              <Text style={styles.metaLabel}>Médico</Text>
              <Text style={styles.metaValue}>{doctor.fullName}</Text>

              <Text style={styles.metaLabel}>Asesora</Text>
              <Text style={styles.metaValue}>
                {asesora?.fullName ?? "—"}
              </Text>

              <Text style={styles.metaLabel}>Vigencia</Text>
              <Text style={styles.metaValue}>{vigenciaLabel}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.tierLabel}>
              {tier ? TIER_TO_PAQUETE[tier] : "PAQUETE PERSONALIZADO"}
            </Text>
            <Text style={styles.includesHeading}>Qué incluye</Text>
            {includesItems.map((item, i) => (
              <Text key={i} style={styles.includesItem}>
                {"• "}
                {item}
              </Text>
            ))}
          </View>

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>
              Total {currency === "USD" ? "Dólares" : "Soles"}
            </Text>
            <Text style={styles.totalAmount}>
              {formatAmount(amount, currency)}
            </Text>
          </View>

          {terms.length > 0 && (
            <View style={[styles.card, { backgroundColor: BG_SOFT }]}>
              <Text style={styles.considHeading}>Consideraciones</Text>
              {terms.map((line, i) => (
                <Text key={i} style={styles.considItem}>
                  {"• "}
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.footer} fixed>
          <View style={styles.footerLeft}>
            <Text>{org.name}</Text>
            {org.ruc ? <Text>RUC {org.ruc}</Text> : null}
            {footerText ? <Text>{footerText}</Text> : null}
          </View>
          <View style={styles.footerRight}>
            <Text style={styles.signatureLine}>
              ________________________________
            </Text>
            <Text style={styles.signatureLine}>
              FIRMA Y NOMBRE DE LA PACIENTE
            </Text>
            {asesora ? (
              <Text style={styles.asesoraLine}>
                ASESORA DE FERTILIDAD: {asesora.fullName}
              </Text>
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
