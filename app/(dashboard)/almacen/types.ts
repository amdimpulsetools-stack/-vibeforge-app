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
  /**
   * Catálogo 07 de SUNAT (mig 213): 1 gravado, 8 exonerado, 9 inafecto,
   * 12/16/17/20 especiales. La columna es NOT NULL DEFAULT 1, pero se
   * tipa opcional porque hay filas cacheadas/insertadas antes de que la
   * UI la pidiera; quien la lea debe asumir 1 (gravado) si falta.
   */
  igv_affectation?: number | null;
  min_stock: number;
  track_lots: boolean;
  is_discontinued: boolean;
  /**
   * Baja lógica (mig 209; la escribe el RPC de la mig 264). Opcionales
   * porque el POS (`farmacia/types.ts`) selecciona sus propias columnas y
   * nunca carga archivados.
   */
  discontinued_at?: string | null;
  discontinued_reason?: string | null;
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
  | "otro"
  /** Mig 270: par de ajustes que mueve unidades entre "sin lote" y un lote. */
  | "asignacion_lote";

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
  /**
   * Mig 268: aplicación hecha desde la ficha de un tratamiento (addon
   * fertilidad). Opcional a propósito: el optimistic update de
   * almacen/page.tsx construye este literal a mano y un campo requerido
   * rompería aquel archivo.
   */
  treatment_id?: string | null;
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
  "id,organization_id,name,sku,category,presentation,base_unit,units_per_presentation,sale_price,igv_affectation,min_stock,track_lots,is_discontinued,discontinued_at,discontinued_reason,notes,created_at";
export const LOT_COLUMNS =
  "id,organization_id,product_id,lot_code,expiry_date,unit_cost,supplier,received_at";
export const MOVEMENT_COLUMNS =
  "id,organization_id,product_id,lot_id,movement_type,quantity,unit_cost,unit_sale_price,cost_total,revenue_total,movement_date,reason_code,notes,patient_id,treatment_id,reverses_movement_id,created_at,created_by";

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
  asignacion_lote: "Asignación de lote",
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

/**
 * Rellena `{clave}` en una cadena de `t()` (el provider no interpola).
 * `fillTemplate("Tiene {n} lotes", { n: 2 })` → "Tiene 2 lotes".
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m
  );
}

/** S/ 2,285.00 — mismo formato que /facturacion. */
export function formatPEN(n: number): string {
  return `S/ ${Number(n || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── IGV ─────────────────────────────────────────────────────────────────
//
// El precio de venta del almacén se digita CON IGV (es el precio de
// mostrador), y `inventory_movements.revenue_total` lo congela tal cual.
// El costo, en cambio, viaja SIN IGV (es lo que la clínica pagó al
// proveedor como valor de compra). Compararlos directo sobreestimaba la
// ganancia ~18% en todo producto gravado.
//
// Solo el código 1 (gravado) lleva IGV; exonerado (8), inafecto (9, 12),
// exportación (16) y los gratuitos (17, 20) ya son netos. Misma regla que
// `isTaxedAffectation` en la emisión electrónica — se replica en tres
// líneas en vez de importarla para no atar el módulo Almacén al de
// facturación, pero SI EL IGV CAMBIA hay que tocar ambos.

/** IGV vigente en Perú, como factor de desagregación. */
export const IGV_FACTOR = 1.18;

/**
 * Ingreso neto de IGV de un producto.
 *
 * Los movimientos anteriores a la mig 213 son de productos que hoy
 * tienen `igv_affectation = 1` por el DEFAULT de la columna: se tratan
 * como gravados, que es el supuesto correcto para una clínica peruana
 * que vende al mostrador (y el conservador para la ganancia: netea de
 * más antes que inflar). Si un producto histórico era exonerado, basta
 * corregir su afectación y el histórico se recalcula solo.
 */
export function netOfIgv(amount: number, igvAffectation?: number | null): number {
  const taxed = (igvAffectation ?? 1) === 1;
  const net = taxed ? Number(amount) / IGV_FACTOR : Number(amount);
  return Math.round(net * 100) / 100;
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

/**
 * Stock por LOTE. El saldo por producto no basta: la salida se imputa al lote
 * más próximo a vencer, así que sin este desglose se podían descontar de un
 * lote más unidades de las que tenía — el total del producto cuadraba y el
 * detalle por lote mentía en silencio, que es justo donde vive la trazabilidad
 * de un medicamento vencido.
 */
export function computeStockByLot(
  movements: InventoryMovement[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of movements) {
    if (!m.lot_id) continue;
    map[m.lot_id] = (map[m.lot_id] ?? 0) + Number(m.quantity);
  }
  return map;
}

/**
 * Unidades "sin lote" por producto = Σ quantity con lot_id NULL (mig 270).
 * Identidad: stock = Σ saldos de lotes + sin lote. Positivo = unidades en
 * estante sin lote asignado (entradas con el campo Lote vacío); negativo =
 * salieron unidades sin decir de qué lote (ventas/insumos de productos sin
 * control de lotes), así que los lotes suman MÁS que el stock real.
 */
export function unlottedByProduct(
  movements: InventoryMovement[]
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of movements) {
    if (m.lot_id) continue;
    map[m.product_id] = (map[m.product_id] ?? 0) + Number(m.quantity);
  }
  for (const k of Object.keys(map)) {
    map[k] = Math.round(map[k] * 1000) / 1000;
  }
  return map;
}

/** Entradas sin lote de un producto (las más recientes primero): de dónde
 *  salieron las unidades "sin lote" — fecha, costo y autor. */
export function unlottedEntries(
  movements: InventoryMovement[],
  productId: string
): InventoryMovement[] {
  return movements
    .filter(
      (m) =>
        m.product_id === productId &&
        !m.lot_id &&
        m.movement_type === "entrada"
    )
    .sort((a, b) =>
      b.movement_date === a.movement_date
        ? b.created_at.localeCompare(a.created_at)
        : b.movement_date.localeCompare(a.movement_date)
    );
}

/**
 * Lote que se descuenta por defecto: el que vence primero ENTRE LOS QUE
 * TIENEN SALDO (FEFO real). Alimenta la columna LOTE/VENCE, el lote de las
 * salidas de Almacén, el chip del POS y el de insumos de tratamientos.
 *
 * Antes ignoraba el saldo y, con dos lotes del mismo vencimiento, se quedaba
 * con el primero que devolvía la base (orden físico, sin ORDER BY). Caso real
 * (25-sep, Adaptessens): la lista mostraba el lote 25-006 ya agotado en vez
 * del 25-075 con 17 und, y una merma de Gonapeptyl se descontó de un lote en
 * 0 (quedó en −2) teniendo otro con 21.
 *
 * Orden: vencimiento ascendente (sin vencimiento al final) → recepción →
 * código. Un producto sin ningún lote con saldo no aparece en el mapa: la
 * salida se registra sin lote en vez de hundir un lote vacío en negativo.
 */
export function nearestLotByProduct(
  lots: InventoryLot[],
  stockByLot: Record<string, number>
): Record<string, InventoryLot> {
  const map: Record<string, InventoryLot> = {};
  for (const l of lots) {
    if ((stockByLot[l.id] ?? 0) <= 0) continue;
    const cur = map[l.product_id];
    if (!cur || compareLotsFefo(l, cur) < 0) map[l.product_id] = l;
  }
  return map;
}

/** Orden FEFO estable: vence antes → recibido antes → código. */
export function compareLotsFefo(a: InventoryLot, b: InventoryLot): number {
  if (a.expiry_date !== b.expiry_date) {
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return a.expiry_date.localeCompare(b.expiry_date);
  }
  const byReceived = (a.received_at ?? "").localeCompare(b.received_at ?? "");
  if (byReceived !== 0) return byReceived;
  return a.lot_code.localeCompare(b.lot_code, "es", { numeric: true });
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

/**
 * Costo de compra por lote tal como está en el KARDEX: la entrada más
 * reciente de ese lote que no fue anulada. `inventory_lots.unit_cost` es
 * solo informativo y no se corrige cuando se corrige la entrada (caso real
 * 25-075: el lote decía S/ 101.60 "sin IGV" —era el precio CON IGV— y el
 * kardex, ya corregido, S/ 86.10). La ventana de lotes muestra este.
 */
export function entryCostByLot(
  movements: InventoryMovement[]
): Record<string, number> {
  const reversed = reversedPairIds(movements);
  const map: Record<string, number> = {};
  // `movements` llega DESC: la primera entrada vigente de cada lote gana.
  for (const m of movements) {
    if (!m.lot_id || m.movement_type !== "entrada" || m.unit_cost == null) continue;
    if (reversed.has(m.id) || m.lot_id in map) continue;
    map[m.lot_id] = Number(m.unit_cost);
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
