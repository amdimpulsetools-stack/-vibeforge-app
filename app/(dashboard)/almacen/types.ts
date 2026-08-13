/**
 * Módulo Almacén — F1. Tipos locales y helpers de presentación.
 *
 * Los generated types (`types/database.ts`) todavía no incluyen las tablas
 * de la migración 209, así que el módulo define sus propias interfaces y
 * castea el resultado de PostgREST. Nada aquí toca la BD: son la forma
 * exacta de las columnas que la UI selecciona.
 *
 * Invariante que gobierna todo el módulo: NO existe columna `stock`.
 * El stock es SUM(inventory_movements.quantity) por producto y se deriva
 * en cliente desde el array de movimientos que ya está en memoria.
 */

// ── Filas ───────────────────────────────────────────────────────────────

export interface InventoryProduct {
  id: string;
  organization_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  presentation: string;
  base_unit: string;
  units_per_presentation: number;
  sale_price: number;
  min_stock: number;
  track_lots: boolean;
  is_discontinued: boolean;
  notes: string | null;
  created_at: string;
}

export interface InventoryLot {
  id: string;
  organization_id: string;
  product_id: string;
  lot_code: string;
  expiry_date: string | null;
  unit_cost: number | null;
  supplier: string | null;
  received_at: string;
}

export type MovementType = "entrada" | "salida" | "ajuste" | "merma";

/** Valores permitidos por el CHECK de la migración 209. */
export type ReasonCode =
  | "saldo_inicial"
  | "compra"
  | "venta"
  | "uso_en_cita"
  | "uso_interno"
  | "conteo_fisico"
  | "rotura"
  | "vencido"
  | "robo_perdida"
  | "error_registro"
  | "devolucion_paciente"
  | "devolucion_proveedor"
  | "donacion"
  | "muestra_medica"
  | "otro";

export interface InventoryMovement {
  id: string;
  organization_id: string;
  product_id: string;
  lot_id: string | null;
  movement_type: MovementType;
  /** CON SIGNO: entrada > 0, salida/merma < 0, ajuste ≠ 0. */
  quantity: number;
  unit_cost: number | null;
  unit_sale_price: number | null;
  /** Generadas por la BD: abs(quantity) × costo/precio congelado. */
  cost_total: number | null;
  revenue_total: number | null;
  movement_date: string;
  reason_code: ReasonCode | null;
  notes: string | null;
  patient_id: string | null;
  reverses_movement_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface InventorySettings {
  expiry_alert_days: number;
  warn_on_negative: boolean;
}

export const DEFAULT_SETTINGS: InventorySettings = {
  expiry_alert_days: 90,
  warn_on_negative: true,
};

/** Columnas que la UI selecciona, en el orden en que se leen. */
export const PRODUCT_COLUMNS =
  "id,organization_id,name,sku,category,presentation,base_unit,units_per_presentation,sale_price,min_stock,track_lots,is_discontinued,notes,created_at";
export const LOT_COLUMNS =
  "id,organization_id,product_id,lot_code,expiry_date,unit_cost,supplier,received_at";
export const MOVEMENT_COLUMNS =
  "id,organization_id,product_id,lot_id,movement_type,quantity,unit_cost,unit_sale_price,cost_total,revenue_total,movement_date,reason_code,notes,patient_id,reverses_movement_id,created_at,created_by";

// ── Etiquetas ───────────────────────────────────────────────────────────

export const MOVEMENT_TYPE_META: Record<
  MovementType,
  { label: string; cls: string }
> = {
  entrada: { label: "Entrada", cls: "bg-primary/10 text-primary" },
  salida: { label: "Salida", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  ajuste: {
    label: "Ajuste",
    cls: "bg-muted text-muted-foreground",
  },
  merma: { label: "Merma", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

export const REASON_LABELS: Record<ReasonCode, string> = {
  saldo_inicial: "Saldo inicial",
  compra: "Compra",
  venta: "Venta",
  uso_en_cita: "Aplicación",
  uso_interno: "Uso interno",
  conteo_fisico: "Conteo físico",
  rotura: "Rotura",
  vencido: "Vencido",
  robo_perdida: "Robo o pérdida",
  error_registro: "Error de registro",
  devolucion_paciente: "Devolución de paciente",
  devolucion_proveedor: "Devolución a proveedor",
  donacion: "Donación",
  muestra_medica: "Muestra médica",
  otro: "Otro",
};

/** Motivos de merma que se ofrecen en la hoja de salida. */
export const MERMA_REASONS: { code: ReasonCode; label: string }[] = [
  { code: "rotura", label: "Se rompió" },
  { code: "vencido", label: "Venció" },
  { code: "robo_perdida", label: "Se perdió" },
  { code: "otro", label: "Otro" },
];

export const UNIT_OPTIONS = ["UND", "U", "ML", "MG", "TABLETA", "AMPOLLA", "DOSIS"];
export const PRESENTATION_OPTIONS = [
  "UND",
  "CAJA",
  "AMPOLLA",
  "VIAL",
  "LAPICERO",
  "FRASCO",
  "BLISTER",
  "SOBRE",
];

// ── Formato ─────────────────────────────────────────────────────────────

/** S/ 2,285.00 — mismo formato que /facturacion. */
export function formatPEN(n: number): string {
  return `S/ ${Number(n || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cantidades en base_unit: hasta 3 decimales, sin ceros de relleno. */
export function fmtQty(n: number): string {
  const r = Math.round((Number(n) || 0) * 1000) / 1000;
  return r.toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

/** Signo tipográfico (− U+2212), no el guion del teclado. */
export function fmtSigned(n: number): string {
  return n > 0 ? `+${fmtQty(n)}` : `−${fmtQty(Math.abs(n))}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

// ── Semáforos ───────────────────────────────────────────────────────────

export type Tone = "muted" | "warn" | "crit";

export interface ExpiryStatus {
  label: string;
  tone: Tone;
  /** true si merece chip (rojo o ámbar); false = dato gris, sin decoración. */
  chip: boolean;
  /** Días hasta el vencimiento; negativo si ya venció. null si no hay fecha. */
  days: number | null;
}

const DAY_MS = 86_400_000;

export function daysUntil(dateIso: string, now = new Date()): number {
  const target = new Date(`${dateIso.slice(0, 10)}T00:00:00`).getTime();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return Math.round((target - today) / DAY_MS);
}

/**
 * Bajo 90 días se cuenta en DÍAS (la decisión es "¿lo uso esta semana?");
 * entre 90 y 180 en MESES ("vence en 137 días" no le dice nada a nadie);
 * sobre 180 se muestra la fecha cruda: ya no es alerta, es dato.
 */
export function expiryStatus(
  expiry: string | null | undefined,
  alertDays = 90,
  now = new Date()
): ExpiryStatus {
  if (!expiry) return { label: "—", tone: "muted", chip: false, days: null };

  const days = daysUntil(expiry, now);

  if (days < 0) {
    const n = Math.abs(days);
    return {
      label: `Venció hace ${n} ${n === 1 ? "día" : "días"}`,
      tone: "crit",
      chip: true,
      days,
    };
  }
  if (days <= alertDays) {
    return {
      label:
        days === 0
          ? "Vence hoy"
          : `Vence en ${days} ${days === 1 ? "día" : "días"}`,
      tone: "crit",
      chip: true,
      days,
    };
  }
  if (days <= alertDays * 2) {
    const months = Math.max(1, Math.round(days / 30));
    return {
      label: `Vence en ${months} ${months === 1 ? "mes" : "meses"}`,
      tone: "warn",
      chip: true,
      days,
    };
  }
  const d = new Date(`${expiry.slice(0, 10)}T12:00:00`);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return {
    label: `Vence ${mm}/${d.getFullYear()}`,
    tone: "muted",
    chip: false,
    days,
  };
}

export interface StockStatus {
  label: string;
  tone: Tone;
  chip: boolean;
}

/** El estado sano no se decora: devuelve null y la fila queda limpia. */
export function stockStatus(
  stock: number,
  minStock: number
): StockStatus | null {
  if (stock < 0)
    return { label: `Descuadre: −${fmtQty(Math.abs(stock))}`, tone: "crit", chip: true };
  if (stock === 0) return { label: "Sin stock", tone: "crit", chip: true };
  if (minStock > 0 && stock <= minStock)
    return { label: `Quedan ${fmtQty(stock)}`, tone: "warn", chip: true };
  return null;
}

export const TONE_CLS: Record<Tone, string> = {
  muted: "text-muted-foreground",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  crit: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// ── Derivados ───────────────────────────────────────────────────────────

/** Stock = SUM(quantity). Un solo SUM, sin CASE por tipo: así un bug de signo no corrompe el saldo. */
export function computeStock(
  movements: InventoryMovement[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of movements) {
    map[m.product_id] = (map[m.product_id] ?? 0) + Number(m.quantity);
  }
  return map;
}

/** Lote más próximo a vencer por producto (FIFO por vencimiento). */
export function nearestLotByProduct(
  lots: InventoryLot[]
): Record<string, InventoryLot> {
  const map: Record<string, InventoryLot> = {};
  for (const l of lots) {
    const cur = map[l.product_id];
    if (!cur) {
      map[l.product_id] = l;
      continue;
    }
    if (!l.expiry_date) continue;
    if (!cur.expiry_date || l.expiry_date < cur.expiry_date) map[l.product_id] = l;
  }
  return map;
}

/**
 * Costo PROMEDIO PONDERADO vigente por producto (CPP, el método por defecto
 * decidido en la spec — `inventory_settings.costing_method = 'promedio'`).
 *
 * Rolling clásico: cada entrada re-promedia contra el stock que había
 * (3 Saizen a S/101 + 10 nuevos a S/99 → CPP S/99.46); las salidas bajan
 * unidades sin tocar el promedio. Este número se CONGELA en `unit_cost`
 * de cada salida/merma al registrarla — así el margen de una venta de hoy
 * jamás cambia porque mañana compres más caro o más barato.
 *
 * Con stock ≤ 0 (descuadre) no hay base: cae al costo de la última entrada.
 */
export function avgCostByProduct(
  movements: InventoryMovement[]
): Record<string, number> {
  const avg: Record<string, number> = {};
  const units: Record<string, number> = {};
  const byId = new Map(movements.map((m) => [m.id, m]));
  // `movements` llega DESC; el CPP se construye en orden cronológico.
  for (let i = movements.length - 1; i >= 0; i--) {
    const m = movements[i];
    const q = Number(m.quantity);
    const pid = m.product_id;

    // Movimientos que RE-PROMEDIAN: entradas con costo y ajustes con costo.
    // Los contra-asientos de un "Deshacer entrada" llevan (o heredan del
    // original) el costo de la entrada anulada — hallazgo crítico de la
    // auditoría 13-ago: sin esto, deshacer una entrada equivocada dejaba el
    // CPP contaminado para siempre (10@100 + 10@200 deshecha → CPP 150 en
    // vez de 100). La fórmula funciona con q negativo: resta valor y
    // unidades al mismo costo con que entraron.
    let cost: number | null = null;
    if (m.movement_type === "entrada" && m.unit_cost != null) {
      cost = Number(m.unit_cost);
    } else if (m.movement_type === "ajuste") {
      if (m.unit_cost != null) {
        cost = Number(m.unit_cost);
      } else if (m.reverses_movement_id) {
        const orig = byId.get(m.reverses_movement_id);
        if (orig?.movement_type === "entrada" && orig.unit_cost != null) {
          cost = Number(orig.unit_cost);
        }
      }
    }

    if (cost != null) {
      const prevUnits = Math.max(0, units[pid] ?? 0);
      const prevAvg = avg[pid] ?? cost;
      const total = prevUnits + q;
      avg[pid] = total > 0 ? (prevUnits * prevAvg + q * cost) / total : cost;
      units[pid] = total;
    } else {
      units[pid] = (units[pid] ?? 0) + q;
    }
  }
  for (const pid of Object.keys(avg)) {
    avg[pid] = Math.round(avg[pid] * 10000) / 10000;
  }
  return avg;
}

/**
 * Ids de movimientos ANULADOS y de sus contra-asientos. Un par deshecho
 * netea a cero en el kardex (stock ✔) pero, como el contra-asiento es un
 * `ajuste` sin precio, era invisible para los agregados monetarios: una
 * venta deshecha inflaba "Ventas" y su ganancia para siempre (hallazgo
 * crítico de la auditoría 13-ago). Todo reporte de dinero excluye este set.
 */
export function reversedPairIds(movements: InventoryMovement[]): Set<string> {
  const ids = new Set<string>();
  for (const m of movements) {
    if (m.reverses_movement_id) {
      ids.add(m.id);
      ids.add(m.reverses_movement_id);
    }
  }
  return ids;
}

/** Último costo conocido del producto: la entrada más reciente con costo. */
export function lastCostByProduct(
  movements: InventoryMovement[]
): Record<string, number> {
  const map: Record<string, number> = {};
  const seen = new Set<string>();
  // `movements` llega ordenado por fecha descendente: la primera gana.
  for (const m of movements) {
    if (m.movement_type !== "entrada" || m.unit_cost == null) continue;
    if (seen.has(m.product_id)) continue;
    seen.add(m.product_id);
    map[m.product_id] = Number(m.unit_cost);
  }
  return map;
}

/** Último día del mes de un input `type="month"` (YYYY-MM) → YYYY-MM-DD. */
export function monthToLastDay(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}
