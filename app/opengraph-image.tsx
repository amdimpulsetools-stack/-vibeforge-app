import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Yenda — Agenda, historia clínica, caja y boletas SUNAT en una sola pantalla";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hasta la auditoría del 2026-08-21 el sitio no tenía imagen OG: cada
// share por WhatsApp — el canal B2B del Perú — salía como tarjeta gris.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #022c22 0%, #064e3b 55%, #065f46 100%)",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#10b981",
              color: "#022c22",
              fontSize: 36,
              fontWeight: 800,
            }}
          >
            y
          </div>
          <div style={{ color: "#a7f3d0", fontSize: 34, fontWeight: 700 }}>
            yenda
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              color: "#ffffff",
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-1px",
              maxWidth: 980,
            }}
          >
            Deja de manejar tu clínica entre el Excel y el WhatsApp.
          </div>
          <div style={{ color: "#a7f3d0", fontSize: 30, maxWidth: 950 }}>
            Agenda · Historia clínica · Caja · Boletas SUNAT · Recordatorios
            por WhatsApp
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              display: "flex",
              background: "#10b981",
              color: "#022c22",
              fontSize: 26,
              fontWeight: 700,
              padding: "14px 32px",
              borderRadius: 14,
            }}
          >
            14 días gratis · Sin tarjeta
          </div>
          <div style={{ color: "#6ee7b7", fontSize: 26 }}>
            Desde S/129 al mes · Hecho en Perú
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
