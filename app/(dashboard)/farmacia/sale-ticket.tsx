"use client";

/**
 * Ticket interno de 80 mm.
 *
 * LO QUE ESTE PAPEL NO ES, y por qué importa: no es una boleta. La F4 no
 * emite comprobantes electrónicos, así que este ticket se rotula SIEMPRE
 * como 'NOTA DE VENTA NV-000123' — sin serie B/F, sin QR, sin hash, sin
 * la palabra BOLETA en ninguna parte — y lleva al pie una leyenda fija
 * que lo dice con todas sus letras.
 *
 * La leyenda vive en `TICKET_LEGEND` (types.ts) y no en este JSX
 * justamente para que quitarla sea un cambio deliberado y visible en el
 * diff, no un descuido de maquetación. Un papel que se parezca a un
 * comprobante autorizado sin serlo es una infracción tributaria; el
 * diseño tiene que empujar en la dirección contraria.
 *
 * Impresión: `@page size: 80mm` y la técnica de visibility (no display)
 * para que el resto de la aplicación desaparezca sin desmontar el
 * diálogo que contiene el ticket — con display:none el navegador
 * recalcula el layout del Dialog y algunas impresoras salen en blanco.
 */

import {
  formatPEN,
  fmtQty,
  lineAmount,
  saleLabel,
  TICKET_LEGEND,
  type CartLine,
  type CartTotals,
} from "./types";

interface Props {
  saleNumber: number | null;
  clinicName: string;
  cashierName: string;
  customerLabel: string | null;
  lines: CartLine[];
  totals: CartTotals;
  paymentMethod: string;
  issuedAt: Date;
}

export function SaleTicket({
  saleNumber,
  clinicName,
  cashierName,
  customerLabel,
  lines,
  totals,
  paymentMethod,
  issuedAt,
}: Props) {
  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .pharmacy-ticket, .pharmacy-ticket * { visibility: visible !important; }
          .pharmacy-ticket {
            position: absolute !important;
            left: 0; top: 0;
            width: 80mm;
            padding: 4mm 3mm;
            color: #000 !important;
            background: #fff !important;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          }
        }
      `}</style>

      {/* Fuera de la impresión no ocupa espacio ni se lee. */}
      <div className="pharmacy-ticket hidden print:block" aria-hidden="true">
        <div style={{ textAlign: "center", fontSize: "11px", lineHeight: 1.35 }}>
          <div style={{ fontWeight: 700, fontSize: "13px" }}>{clinicName}</div>
          <div style={{ marginTop: "3mm", fontWeight: 700, fontSize: "12px" }}>
            NOTA DE VENTA {saleLabel(saleNumber)}
          </div>
        </div>

        <div style={{ marginTop: "3mm", fontSize: "10px", lineHeight: 1.5 }}>
          <div>
            {issuedAt.toLocaleDateString("es-PE")} {issuedAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div>Cajero: {cashierName}</div>
          <div>Cliente: {customerLabel?.trim() || "Público general"}</div>
          <div>Pago: {paymentMethod}</div>
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />

        <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td style={{ paddingBottom: "1.5mm", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 600 }}>{line.product.name}</div>
                  <div>
                    {fmtQty(line.quantity)} x {formatPEN(line.unitPrice)}
                    {line.lineDiscount > 0 ? ` − ${formatPEN(line.lineDiscount)}` : ""}
                  </div>
                </td>
                <td
                  style={{
                    paddingBottom: "1.5mm",
                    textAlign: "right",
                    verticalAlign: "bottom",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPEN(lineAmount(line))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />

        <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td style={{ textAlign: "right" }}>{formatPEN(totals.subtotal)}</td>
            </tr>
            <tr>
              <td>IGV (18%)</td>
              <td style={{ textAlign: "right" }}>{formatPEN(totals.igv)}</td>
            </tr>
            <tr style={{ fontWeight: 700, fontSize: "12px" }}>
              <td style={{ paddingTop: "1.5mm" }}>TOTAL</td>
              <td style={{ paddingTop: "1.5mm", textAlign: "right" }}>
                {formatPEN(totals.total)}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", margin: "2mm 0" }} />

        {/* Leyenda obligatoria. No se quita. */}
        <div
          style={{
            fontSize: "8px",
            lineHeight: 1.4,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          {TICKET_LEGEND}
        </div>
      </div>
    </>
  );
}
