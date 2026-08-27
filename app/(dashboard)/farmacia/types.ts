/**
 * Módulo Farmacia (POS) — F4. Tipos locales y derivados de presentación.
 *
 * Mismo criterio que `almacen/types.ts`: los generated types todavía no
 * incluyen las tablas de la mig 216, así que el módulo declara la forma
 * exacta de las columnas que selecciona y castea el resultado de
 * PostgREST.
 *
 * Los helpers de inventario (stock, lotes, FEFO, semáforos, formato) se
 * REUTILIZAN de Almacén — no se recalculan aquí. El stock del POS y el
 * stock de Almacén tienen que ser el mismo número, y la única forma de
 * garantizarlo es que salga de la misma función.
 */

import { computeLineTax, isTaxedAffectation, IGV_PERCENT } from "@/lib/pharmacy/pricing";
import type { InventoryProduct } from "../almacen/types";

export {
  computeStock,
  computeStockByLot,
  nearestLotByProduct,
  expiryStatus,
  stockStatus,
  formatPEN,
  fmtQty,
  fmtDate,
  daysUntil,
  TONE_CLS,
  LOT_COLUMNS,
  MOVEMENT_COLUMNS,
  type InventoryLot,
  type InventoryMovement,
  type InventoryProduct,
  type Tone,
} from "../almacen/types";

export { computeLineTax, isTaxedAffectation, IGV_PERCENT };

// ── Filas ───────────────────────────────────────────────────────────────

export type SaleStatus = "borrador" | "confirmada" | "anulada";

export interface PharmacySale {
  id: string;
  organization_id: string;
  sale_number: number | null;
  status: SaleStatus;
  /** Fecha del HECHO en Lima (mig 232). confirmed_at es el sello de registro. */
  sale_date: string;
  patient_id: string | null;
  customer_label: string | null;
  total: number;
  subtotal_taxed: number;
  subtotal_exempt: number;
  subtotal_unaffected: number;
  igv_amount: number;
  discount_amount: number;
  payment_id: string | null;
  cash_shift_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface PharmacySaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  lot_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  igv_affectation: number;
  line_gross: number;
  line_total: number;
  line_subtotal: number;
  line_igv: number;
  position: number;
}

export const SALE_COLUMNS =
  "id,organization_id,sale_number,status,sale_date,patient_id,customer_label,total,subtotal_taxed,subtotal_exempt,subtotal_unaffected,igv_amount,discount_amount,payment_id,cash_shift_id,confirmed_at,confirmed_by,voided_at,void_reason,created_at";

export const SALE_ITEM_COLUMNS =
  "id,sale_id,product_id,lot_id,description,quantity,unit_price,line_discount,igv_affectation,line_gross,line_total,line_subtotal,line_igv,position";

/** Columnas del catálogo que el POS necesita (incluye las fiscales de la 213). */
export const SELLABLE_PRODUCT_COLUMNS =
  "id,organization_id,name,sku,category,presentation,base_unit,units_per_presentation,sale_price,min_stock,track_lots,is_discontinued,notes,created_at,igv_affectation,is_sellable";

export interface SellableProduct extends InventoryProduct {
  igv_affectation: number;
  is_sellable: boolean;
}

/** Un día agregado de `pharmacy_day_summary` (mig 232). */
export interface DaySummary {
  day: string;
  sales_count: number;
  voided_count: number;
  items_count: number;
  subtotal: number;
  igv: number;
  total: number;
  by_tender: { efectivo: number; electronico: number; otro: number };
  by_method: Record<string, number>;
}

/** Resultado de `pharmacy_confirm_sale` (mig 217). */
export interface ConfirmResult {
  sale_id: string;
  status: SaleStatus;
  already: boolean;
  sale_number: number;
  sale_label?: string;
  total: number;
  payment_id: string | null;
  cash_shift_id: string | null;
  movement_ids: string[];
  warnings: string[];
}

// ── Carrito ─────────────────────────────────────────────────────────────

/** Una línea del carrito, ya persistida como `pharmacy_sale_items`. */
export interface CartLine {
  /** id real de la fila en la base: es lo que la RPC usa como idempotencia. */
  id: string;
  product: SellableProduct;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lotId: string | null;
}

export interface CartTotals {
  gross: number;
  discount: number;
  subtotal: number;
  igv: number;
  total: number;
}

/**
 * Totales EN VIVO del carrito, con la misma aritmética que la base
 * (computeLineTax → columnas GENERATED de la mig 216).
 *
 * Es una VISTA PREVIA, no la fuente de verdad: lo que se cobra lo
 * recalcula `pharmacy_confirm_sale` en el servidor. Que ambos números
 * coincidan siempre es justamente el motivo de compartir la fórmula en
 * vez de reescribirla.
 */
export function cartTotals(lines: CartLine[]): CartTotals {
  let gross = 0;
  let discount = 0;
  let subtotal = 0;
  let igv = 0;
  let total = 0;

  for (const line of lines) {
    const amounts = computeLineTax({
      quantity: line.quantity,
      unitPriceWithTax: line.unitPrice,
      lineDiscount: line.lineDiscount,
      isTaxed: isTaxedAffectation(line.product.igv_affectation ?? 1),
      igvPercent: IGV_PERCENT,
    });
    gross += amounts.lineGross;
    discount += amounts.lineDiscount;
    subtotal += amounts.subtotal;
    igv += amounts.igvAmount;
    total += amounts.lineTotal;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    gross: r2(gross),
    discount: r2(discount),
    subtotal: r2(subtotal),
    igv: r2(igv),
    total: r2(total),
  };
}

/** Importe de una línea, ya con su descuento aplicado. */
export function lineAmount(line: CartLine): number {
  return computeLineTax({
    quantity: line.quantity,
    unitPriceWithTax: line.unitPrice,
    lineDiscount: line.lineDiscount,
    isTaxed: isTaxedAffectation(line.product.igv_affectation ?? 1),
    igvPercent: IGV_PERCENT,
  }).lineTotal;
}

// ── Formato ─────────────────────────────────────────────────────────────

/** 'NV-000123' — el número interno. JAMÁS se rotula como boleta. */
export function saleLabel(n: number | null | undefined): string {
  if (n == null) return "NV-—";
  return `NV-${String(n).padStart(6, "0")}`;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Fechas en el huso del negocio ───────────────────────────────────────
//
// La fecha civil de la venta (sale_date, mig 232) vive en America/Lima,
// no en el reloj del navegador: una recepcionista revisando desde otra
// zona (o un servidor en UTC) tiene que ver el MISMO "hoy" que el POS.

/** 'YYYY-MM-DD' de hoy en Lima. en-CA formatea exactamente ISO. */
export function limaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Fecha Lima ('YYYY-MM-DD') de un timestamptz ISO; null si no hay sello. */
export function limaDateOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** 'lun 25 ago 2026' — encabezado de día del historial. */
export function fmtDayHeading(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Cantidades del kardex: máximo 3 decimales (mig 209). */
export function clampQty(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 1000) / 1000;
}

/**
 * Leyenda que NO se puede quitar del ticket. Una nota de venta interna que
 * se parezca a una boleta es una infracción tributaria esperando ocurrir,
 * así que el texto vive en una constante y no en el JSX de la plantilla.
 */
export const TICKET_LEGEND =
  "DOCUMENTO INTERNO DE CONTROL — NO ES UN COMPROBANTE DE PAGO AUTORIZADO POR SUNAT";
