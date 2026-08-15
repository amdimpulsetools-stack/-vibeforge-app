/**
 * Módulo Caja — tipos y formato compartidos.
 *
 * Los tipos van a mano y no desde `types/database.ts` porque el cliente del
 * navegador (`lib/supabase/client.ts`) no está tipado con el `Database`
 * generado: las tablas de la 214 no existen ahí y regenerar los tipos no es
 * parte de esta entrega.
 */

// ── Filas ────────────────────────────────────────────────────────────────

export interface CashSettings {
  organization_id: string;
  shift_scope: "user" | "organization";
  require_blind_count: boolean;
  default_opening_float: number;
  difference_tolerance: number;
  activated_at: string;
}

export interface CashShift {
  id: string;
  organization_id: string;
  office_id: string | null;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string;
  opening_float: number;
  opening_notes: string | null;
  closed_at: string | null;
  closed_by: string | null;
  force_closed: boolean;
  counted_cash: number | null;
  counted_by_method: Record<string, number> | null;
  expected_cash: number | null;
  expected_by_tender: Record<string, number> | null;
  expected_by_method: Record<string, number> | null;
  payments_count: number | null;
  difference_cash: number | null;
  closing_notes: string | null;
  difference_reason: string | null;
}

export const SHIFT_COLUMNS =
  "id,organization_id,office_id,status,opened_at,opened_by,opening_float,opening_notes," +
  "closed_at,closed_by,force_closed,counted_cash,counted_by_method,expected_cash," +
  "expected_by_tender,expected_by_method,payments_count,difference_cash,closing_notes,difference_reason";

export type MovementType =
  | "ingreso"
  | "reposicion"
  | "egreso"
  | "sangria"
  | "devolucion";

export interface CashMovement {
  id: string;
  organization_id: string;
  shift_id: string;
  movement_type: MovementType;
  amount: number;
  tender_kind: "efectivo" | "electronico" | "otro";
  reason_code: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export const MOVEMENT_COLUMNS =
  "id,organization_id,shift_id,movement_type,amount,tender_kind,reason_code,notes,created_at,created_by";

/** Pago del turno, en modo lectura: la caja nunca edita un cobro. */
export interface ShiftPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  tender_kind: string | null;
  payment_date: string;
  created_at: string;
  created_by: string | null;
  patient_id: string | null;
  appointment_id: string | null;
  cash_shift_id: string | null;
  patients: { first_name: string; last_name: string } | null;
}

export const PAYMENT_COLUMNS =
  "id,amount,payment_method,tender_kind,payment_date,created_at,created_by," +
  "patient_id,appointment_id,cash_shift_id,patients(first_name,last_name)";

export interface PaymentMethodLookup {
  id: string;
  label: string;
  icon: string | null;
}

/** Lo que devuelve `caja_shift_summary`. Los `expected_*` faltan cuando el
 *  arqueo ciego está activo y quien mira no es admin. */
export interface ShiftSummary {
  shift_id: string;
  status: "open" | "closed";
  opened_at: string;
  opened_by: string;
  opening_float: number;
  payments_total: number;
  payments_count: number;
  payments_by_tender: Record<string, number>;
  payments_by_method: Record<string, number>;
  movements_by_tender: Record<string, number>;
  movements_count: number;
  operations_count: number;
  blind_count: boolean;
  expected_cash?: number;
  cash_payments?: number;
  cash_movements?: number;
}

/** Lo que devuelve `caja_close_shift`. */
export interface CloseResult {
  shift_id: string;
  expected_cash: number;
  counted_cash: number;
  difference_cash: number;
  within_tolerance: boolean;
  difference_tolerance: number;
  force_closed: boolean;
  payments_count: number;
  expected_by_method: Record<string, number>;
  difference_reason: string | null;
}

// ── Catálogos de la interfaz ─────────────────────────────────────────────

/**
 * 'devolucion' NO se ofrece en esta fase: exige paciente o pago de origen y
 * su flujo natural llega con Farmacia (F4). El tipo existe en la base desde
 * la 214 para no volver a tocar el CHECK.
 */
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  ingreso: "Ingreso",
  reposicion: "Reposición de fondo",
  egreso: "Egreso",
  sangria: "Sangría",
  devolucion: "Devolución",
};

export const REASON_LABEL: Record<string, string> = {
  compra_insumos: "Compra de insumos",
  movilidad: "Movilidad / taxi",
  servicios: "Servicios (luz, agua, internet)",
  adelanto_personal: "Adelanto a personal",
  deposito_banco: "Depósito al banco",
  devolucion_paciente: "Devolución a paciente",
  ajuste: "Ajuste",
  otro: "Otro",
};

/** Motivos que tienen sentido por tipo de movimiento. */
export const REASONS_BY_TYPE: Record<MovementType, string[]> = {
  ingreso: ["ajuste", "otro"],
  reposicion: ["ajuste", "otro"],
  egreso: [
    "compra_insumos",
    "movilidad",
    "servicios",
    "adelanto_personal",
    "otro",
  ],
  sangria: ["deposito_banco", "otro"],
  devolucion: ["devolucion_paciente"],
};

export const TENDER_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  electronico: "Electrónico",
  otro: "Otro",
};

/** Etiqueta que usa el RPC para los pagos sin método declarado. */
export const NO_METHOD = "(sin método)";

// ── Formato ──────────────────────────────────────────────────────────────

/** S/ 2,285.00 — mismo formato que /almacen y /facturacion. */
export function formatPEN(n: number): string {
  return `S/ ${Number(n || 0).toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Diferencias: el signo tipográfico (− U+2212), no el guion del teclado. */
export function formatSignedPEN(n: number): string {
  const v = Number(n || 0);
  if (v === 0) return formatPEN(0);
  return `${v > 0 ? "+" : "−"}${formatPEN(Math.abs(v))}`;
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "hace 3 h 20 min" — el turno abierto necesita saber cuánto lleva. */
export function elapsedSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "recién";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Semáforo de la diferencia. Verde solo el cuadre exacto: "casi cuadra" no
 * es cuadrar, y por eso el ámbar existe.
 */
export function differenceTone(
  difference: number | null,
  tolerance: number
): "ok" | "warn" | "bad" {
  const d = Number(difference ?? 0);
  if (d === 0) return "ok";
  return Math.abs(d) <= tolerance ? "warn" : "bad";
}

export const DIFFERENCE_TONE_CLASS: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-success-600 dark:text-success-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

export function patientName(p: ShiftPayment): string | null {
  if (!p.patients) return null;
  return `${p.patients.first_name} ${p.patients.last_name}`.trim() || null;
}
