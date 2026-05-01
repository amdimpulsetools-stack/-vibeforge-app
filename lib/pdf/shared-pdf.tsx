/**
 * Helpers compartidos para los Documents de @react-pdf/renderer.
 *
 * - Colores y constantes de tema
 * - <ClinicHeader /> reutilizable (membrete con logo + datos de la org)
 * - <SignatureBlock /> (firma del doctor con CMP)
 * - createPageStyles() factory que recibe el accent y devuelve el StyleSheet
 *   base que cada Document extiende según su layout específico.
 */

import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ClinicHeaderData } from "./clinic-header";

// ─── Constantes de tema ────────────────────────────────────────────
export const ACCENT_FALLBACK = "#10b981";
export const TEXT_DARK = "#111111";
export const TEXT_MUTED = "#6b7280";
export const BORDER = "#e5e7eb";
export const BG_SOFT = "#f9fafb";
export const BG_CHIP = "#f3f4f6";

// ─── Style factory ─────────────────────────────────────────────────
export function createPageStyles(accent: string) {
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
    sectionTitle: {
      fontSize: 11,
      fontWeight: "bold",
      letterSpacing: 0.5,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
      marginBottom: 6,
      marginTop: 8,
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

export type PageStyles = ReturnType<typeof createPageStyles>;

// ─── Helpers ───────────────────────────────────────────────────────
export function joinParts(parts: (string | null | undefined)[], sep = " · "): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep);
}

export function formatPeruDate(yyyyMmDd: string): string {
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

// ─── <ClinicHeader /> ──────────────────────────────────────────────
export function ClinicHeader({
  clinic,
  s,
}: {
  clinic: ClinicHeaderData;
  s: PageStyles;
}) {
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
      {clinic.logo_url ? <Image src={clinic.logo_url} style={s.logo} /> : null}
      <View style={s.headerTextBlock}>
        <Text style={s.clinicName}>{clinic.name}</Text>
        {clinic.tagline ? <Text style={s.clinicTagline}>{clinic.tagline}</Text> : null}
        {contact ? <Text style={s.clinicMeta}>{contact}</Text> : null}
        {legalLine ? <Text style={s.clinicMeta}>{legalLine}</Text> : null}
      </View>
    </View>
  );
}

// ─── <SignatureBlock /> ────────────────────────────────────────────
export function SignatureBlock({
  doctorName,
  doctorCmp,
  s,
}: {
  doctorName: string;
  doctorCmp?: string | null;
  s: PageStyles;
}) {
  return (
    <View style={s.signatureBlock}>
      <View style={s.signatureLine}>
        <Text style={s.signatureName}>{doctorName}</Text>
        <Text style={s.signatureRole}>
          {doctorCmp ? `CMP ${doctorCmp} · ` : ""}Médico tratante
        </Text>
      </View>
    </View>
  );
}
