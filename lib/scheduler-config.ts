// Scheduler configuration — persisted in database (with localStorage cache)

export const SCHEDULER_CONFIG_KEYS = {
  startHour: "vibeforge_scheduler_start",
  endHour: "vibeforge_scheduler_end",
  startMinute: "vibeforge_scheduler_start_minute",
  endMinute: "vibeforge_scheduler_end_minute",
  interval: "vibeforge_scheduler_interval",
  timeIndicator: "vibeforge_time_indicator",
  disabledWeekdays: "vibeforge_disabled_weekdays",
  liveStatus: "vibeforge_live_status",
  liveStatusAutoClose: "vibeforge_live_status_auto_close",
  liveStatusReceptionCanEnd: "vibeforge_live_status_reception_can_end",
  requiredFields: "vibeforge_scheduler_required_fields",
  allowCustomDuration: "vibeforge_scheduler_allow_custom_duration",
  // Misma key que usaba break-time-dialog.tsx cuando el descanso vivía SOLO
  // en localStorage (pre-254): la caché vieja sirve de placeholder hasta que
  // llega la fila de la org.
  breakTime: "vibeforge_break_time_config",
};

export type IntervalOption = 15 | 20 | 30 | 45 | 60;

// ─── Break Time por org (mig 254) ────────────────────────────────────────

/**
 * Descanso diario de la clínica. Antes de la mig 254 vivía en el
 * localStorage de cada navegador (por usuario, invisible para el servidor);
 * ahora es una columna jsonb de scheduler_settings con esta misma forma, así
 * que la agenda, "Compartir horarios" y la reserva online lo aplican igual.
 */
export interface BreakTimeConfig {
  enabled: boolean;
  /** 0=Dom … 6=Sáb */
  days: number[];
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM" */
  endTime: string;
}

export const DEFAULT_BREAK_TIME_CONFIG: BreakTimeConfig = {
  // Off por default. La clínica activa explícitamente su break time desde el
  // botón ☕ en el header del scheduler. Asumir 1-2pm como default era invasivo
  // para clínicas que no tienen ese horario o trabajan sin almuerzo fijo.
  enabled: false,
  days: [1, 2, 3, 4, 5], // Mon–Fri
  startTime: "13:00",
  endTime: "14:00",
};

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Coerce JSON arbitrario (columna / caché) a un BreakTimeConfig seguro. */
export function sanitizeBreakTime(raw: unknown): BreakTimeConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_BREAK_TIME_CONFIG;
  const src = raw as Record<string, unknown>;
  const days = Array.isArray(src.days)
    ? Array.from(
        new Set(
          src.days.filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6)
        )
      )
    : DEFAULT_BREAK_TIME_CONFIG.days;
  const startTime =
    typeof src.startTime === "string" && HHMM_RE.test(src.startTime)
      ? src.startTime
      : DEFAULT_BREAK_TIME_CONFIG.startTime;
  const endTime =
    typeof src.endTime === "string" && HHMM_RE.test(src.endTime)
      ? src.endTime
      : DEFAULT_BREAK_TIME_CONFIG.endTime;
  const enabled = src.enabled === true && days.length > 0 && startTime < endTime;
  return { enabled, days, startTime, endTime };
}

/** Día de la semana (0=Dom) de una fecha civil "yyyy-MM-dd", sin zona horaria. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Mediodía local: inmune a DST y al offset del servidor (corre en UTC).
  return new Date(y, m - 1, d, 12, 0, 0).getDay();
}

/** ¿El descanso aplica ese día? */
export function breakTimeAppliesOn(config: BreakTimeConfig, dateStr: string): boolean {
  return config.enabled && config.days.includes(weekdayOf(dateStr));
}

/**
 * ¿La franja [startHHMM, endHHMM) pisa el descanso de ese día? Misma regla de
 * choque que las citas: fin de una == inicio de la otra NO choca.
 */
export function overlapsBreakTime(
  config: BreakTimeConfig,
  dateStr: string,
  startHHMM: string,
  endHHMM: string
): boolean {
  if (!breakTimeAppliesOn(config, dateStr)) return false;
  return startHHMM.slice(0, 5) < config.endTime && endHHMM.slice(0, 5) > config.startTime;
}

/** Marca de los bloqueos virtuales del descanso (id `bt-<fecha>`, sin fila en BD). */
export const BREAK_TIME_REASON = "__break_time__";

/**
 * Bloqueos virtuales del descanso para cada fecha de [startDate, endDate]
 * (fechas civiles "yyyy-MM-dd"). Misma forma que una fila de schedule_blocks
 * para que los lectores (agenda, reserva online) los traten igual; office_id
 * null = todos los consultorios.
 */
export function breakTimeBlocksInRange(
  config: BreakTimeConfig,
  startDate: string,
  endDate: string,
  organizationId = ""
): Array<{
  id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  office_id: null;
  all_day: false;
  reason: string;
  organization_id: string;
  created_at: string;
}> {
  if (!config.enabled) return [];
  const out: ReturnType<typeof breakTimeBlocksInRange> = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd, 12, 0, 0);
  const end = new Date(ey, em - 1, ed, 12, 0, 0);
  while (cursor <= end) {
    if (config.days.includes(cursor.getDay())) {
      const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      out.push({
        id: `bt-${dateStr}`,
        block_date: dateStr,
        start_time: config.startTime,
        end_time: config.endTime,
        office_id: null,
        all_day: false,
        reason: BREAK_TIME_REASON,
        organization_id: organizationId,
        created_at: "",
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// ─── Configurable required fields for the New Appointment modal (mig 176) ───

/**
 * Single source of truth for the whitelist of appointment fields an admin
 * can mark as mandatory. Keep this in sync with:
 *   - the DB CHECK / comment in mig 176,
 *   - the PUT Zod enum in app/api/scheduler-settings/route.ts,
 *   - buildAppointmentSchema in lib/validations/appointment.ts,
 *   - the toggles in settings/agenda-required-fields-section.tsx.
 *
 * meeting_url is intentionally EXCLUDED from v1 — it is conditional on a
 * virtual service and would add branching complexity; it keeps its current
 * (optional) behavior.
 */
export const REQUIRED_FIELD_KEYS = [
  "patient_dni",
  "patient_phone",
  "patient_email",
  "patient_birth_date",
  "patient_location",
  "origin",
  "payment_method",
  "responsible",
  "notes",
] as const;

export type RequiredFieldKey = (typeof REQUIRED_FIELD_KEYS)[number];

/**
 * Sparse override map: a present key set to true makes that field mandatory,
 * a present false makes it optional, an ABSENT key falls back to the code
 * default. The empty map ({}) is byte-identical to the pre-176 behavior.
 */
export type AppointmentRequiredFields = Partial<Record<RequiredFieldKey, boolean>>;

export const DEFAULT_REQUIRED_FIELDS: AppointmentRequiredFields = {};

/**
 * Coerce arbitrary JSON (DB column / localStorage cache) into a safe
 * AppointmentRequiredFields: only whitelisted keys with boolean values
 * survive. Anything else (old/foreign/corrupt shapes) collapses to {},
 * which preserves the byte-identical default behavior.
 */
export function sanitizeRequiredFields(raw: unknown): AppointmentRequiredFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: AppointmentRequiredFields = {};
  for (const key of REQUIRED_FIELD_KEYS) {
    const v = src[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

/** Weekday numbers: 0=Sunday, 1=Monday, …, 6=Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SchedulerConfig {
  startHour: number;
  endHour: number;
  /** Additive minute offset (0/15/30/45) on startHour — mig 175. Default 0. */
  startMinute: number;
  /** Additive minute offset (0/15/30/45) on endHour — mig 175. Default 0. */
  endMinute: number;
  intervals: IntervalOption[];
  timeIndicator: boolean;
  /** Permanently disabled weekdays (e.g. [0] = Sunday off) */
  disabledWeekdays: Weekday[];
  /** Master toggle for the live appointment status layer (mig 170/171). */
  liveStatus: boolean;
  /** Sub-toggle: starting a consultation auto-closes the doctor's previous open one. */
  liveStatusAutoClose: boolean;
  /**
   * Sub-toggle (mig 227): el rol Recepción puede "Finalizar consulta".
   * Default true. Reabrir queda siempre reservado a owner/admin/doctor.
   */
  liveStatusReceptionCanEnd: boolean;
  /**
   * Sparse map of which configurable New-Appointment fields are mandatory
   * (mig 176). Default {} = code defaults (byte-identical to pre-176).
   */
  requiredFields: AppointmentRequiredFields;
  /**
   * Flag por-org (mig 221): permite ajustar la duración por cita desde el
   * modal (la "Hora fin" se vuelve editable y la del servicio pasa a ser solo
   * el default). Default false = byte-idéntico al comportamiento pre-221.
   */
  allowCustomDuration: boolean;
  /**
   * Descanso diario por org (mig 254). Default = apagado. Antes vivía en
   * localStorage por navegador y el servidor no podía aplicarlo.
   */
  breakTime: BreakTimeConfig;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  startHour: 8,
  endHour: 20,
  startMinute: 0,
  endMinute: 0,
  intervals: [15],
  timeIndicator: true,
  disabledWeekdays: [0], // Sunday disabled by default
  liveStatus: true,
  liveStatusAutoClose: true,
  liveStatusReceptionCanEnd: true, // mig 227 — on = recepción puede finalizar
  requiredFields: {}, // mig 176 — empty = code defaults (back-compat)
  allowCustomDuration: false, // mig 221 — off = duración impuesta por el servicio
  breakTime: DEFAULT_BREAK_TIME_CONFIG, // mig 254 — off hasta que la org lo active
};

/** Returns the smallest selected interval (used for the grid resolution). */
export function getActiveInterval(config: SchedulerConfig): IntervalOption {
  return Math.min(...config.intervals) as IntervalOption;
}

/**
 * Schedule window boundaries as minutes-since-midnight, folding in the
 * additive minute offsets (mig 175). Consumers use these instead of
 * open-coding `startHour * 60` so the :15/:30/:45 offsets are respected
 * everywhere. Default minute=0 → `startHour * 60` exactly (byte-identical
 * to the pre-offset behavior).
 */
export function getScheduleStartMinutes(config: SchedulerConfig): number {
  return config.startHour * 60 + config.startMinute;
}
export function getScheduleEndMinutes(config: SchedulerConfig): number {
  return config.endHour * 60 + config.endMinute;
}

export function loadSchedulerConfig(): SchedulerConfig {
  if (typeof window === "undefined") return DEFAULT_SCHEDULER_CONFIG;
  try {
    const startHour = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.startHour) ?? "") || DEFAULT_SCHEDULER_CONFIG.startHour;
    const endHour = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.endHour) ?? "") || DEFAULT_SCHEDULER_CONFIG.endHour;
    // Minute offsets (mig 175): missing/invalid → 0 (whole-hour, back-compat).
    const parseMinute = (raw: string | null) => {
      const n = parseInt(raw ?? "");
      return n === 15 || n === 30 || n === 45 ? n : 0;
    };
    const startMinute = parseMinute(localStorage.getItem(SCHEDULER_CONFIG_KEYS.startMinute));
    const endMinute = parseMinute(localStorage.getItem(SCHEDULER_CONFIG_KEYS.endMinute));
    const rawInterval = localStorage.getItem(SCHEDULER_CONFIG_KEYS.interval) ?? "";
    let intervals: IntervalOption[];
    try {
      const parsed = JSON.parse(rawInterval);
      if (Array.isArray(parsed) && parsed.length > 0) {
        intervals = parsed.filter((v: number) => v === 15 || v === 20 || v === 30 || v === 45 || v === 60) as IntervalOption[];
      } else {
        intervals = [];
      }
    } catch {
      // Migrate from old single-value format
      const num = parseInt(rawInterval);
      intervals = [15, 20, 30, 45, 60].includes(num) ? [num as IntervalOption] : [];
    }
    if (intervals.length === 0) intervals = DEFAULT_SCHEDULER_CONFIG.intervals;
    // Migration: la UI ahora es single-select. Si un usuario tenia 2+
    // intervals guardados de una version anterior, normalizamos al menor
    // (que era el que efectivamente usaba el scheduler via Math.min).
    if (intervals.length > 1) intervals = [Math.min(...intervals) as IntervalOption];
    const timeIndicator = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.timeIndicator) ?? "true") === "true";
    let disabledWeekdays: Weekday[] = DEFAULT_SCHEDULER_CONFIG.disabledWeekdays;
    try {
      const rawDays = localStorage.getItem(SCHEDULER_CONFIG_KEYS.disabledWeekdays);
      if (rawDays) {
        const parsed = JSON.parse(rawDays);
        if (Array.isArray(parsed)) {
          disabledWeekdays = parsed.filter((v: number) => v >= 0 && v <= 6) as Weekday[];
        }
      }
    } catch { /* keep default */ }
    const liveStatus = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.liveStatus) ?? "true") === "true";
    const liveStatusAutoClose = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.liveStatusAutoClose) ?? "true") === "true";
    const liveStatusReceptionCanEnd = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.liveStatusReceptionCanEnd) ?? "true") === "true";
    // Required fields (mig 176): missing/invalid cache → {} (back-compat).
    // Orgs cached under the pre-176 shape simply have no key here, so the
    // JSON.parse falls through to {} and behavior is unchanged.
    let requiredFields: AppointmentRequiredFields = {};
    try {
      const rawReq = localStorage.getItem(SCHEDULER_CONFIG_KEYS.requiredFields);
      if (rawReq) requiredFields = sanitizeRequiredFields(JSON.parse(rawReq));
    } catch { /* keep {} */ }
    // Duración editable (mig 221): a diferencia de los toggles de arriba, el
    // default es FALSE — una caché vieja sin la key deja el flag apagado, que
    // es el comportamiento anterior.
    const allowCustomDuration = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.allowCustomDuration) ?? "false") === "true";
    // Break Time (mig 254): la misma key que guardaba el diálogo pre-254, así
    // la config que la clínica ya tenía en ESTE navegador sirve de placeholder
    // hasta que baja la fila de la org (que manda).
    let breakTime: BreakTimeConfig = DEFAULT_BREAK_TIME_CONFIG;
    try {
      const rawBreak = localStorage.getItem(SCHEDULER_CONFIG_KEYS.breakTime);
      if (rawBreak) breakTime = sanitizeBreakTime(JSON.parse(rawBreak));
    } catch { /* keep default */ }
    return { startHour, endHour, startMinute, endMinute, intervals, timeIndicator, disabledWeekdays, liveStatus, liveStatusAutoClose, liveStatusReceptionCanEnd, requiredFields, allowCustomDuration, breakTime };
  } catch {
    return DEFAULT_SCHEDULER_CONFIG;
  }
}

export function saveSchedulerConfig(config: Partial<SchedulerConfig>) {
  if (typeof window === "undefined") return;
  // Save to localStorage as cache
  if (config.startHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.startHour, String(config.startHour));
  if (config.endHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.endHour, String(config.endHour));
  if (config.startMinute !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.startMinute, String(config.startMinute));
  if (config.endMinute !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.endMinute, String(config.endMinute));
  if (config.intervals !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.interval, JSON.stringify(config.intervals));
  if (config.timeIndicator !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.timeIndicator, String(config.timeIndicator));
  if (config.disabledWeekdays !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.disabledWeekdays, JSON.stringify(config.disabledWeekdays));
  if (config.liveStatus !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.liveStatus, String(config.liveStatus));
  if (config.liveStatusAutoClose !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.liveStatusAutoClose, String(config.liveStatusAutoClose));
  if (config.liveStatusReceptionCanEnd !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.liveStatusReceptionCanEnd, String(config.liveStatusReceptionCanEnd));
  if (config.requiredFields !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.requiredFields, JSON.stringify(config.requiredFields));
  if (config.allowCustomDuration !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.allowCustomDuration, String(config.allowCustomDuration));
  if (config.breakTime !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.breakTime, JSON.stringify(config.breakTime));
}

// ─── Database-backed functions ───────────────────────────────────

/**
 * Convert DB row to SchedulerConfig. Exportada para que el servidor (dashboard
 * admin, ocupación) lea `scheduler_settings` con el mismo mapeo que el
 * cliente — una sola traducción fila → config.
 */
export function schedulerRowToConfig(row: {
  start_hour: number;
  end_hour: number;
  start_minute?: number | null;
  end_minute?: number | null;
  intervals: unknown;
  time_indicator: boolean;
  disabled_weekdays: unknown;
  live_status?: boolean | null;
  live_status_auto_close?: boolean | null;
  live_status_reception_can_end?: boolean | null;
  required_fields?: unknown;
  allow_custom_duration?: boolean | null;
  break_time?: unknown;
}): SchedulerConfig {
  const intervals = (Array.isArray(row.intervals) ? row.intervals : [15]).filter(
    (v: number) => [15, 20, 30, 45, 60].includes(v)
  ) as IntervalOption[];
  const disabledWeekdays = (Array.isArray(row.disabled_weekdays) ? row.disabled_weekdays : [0]).filter(
    (v: number) => v >= 0 && v <= 6
  ) as Weekday[];
  return {
    startHour: row.start_hour,
    endHour: row.end_hour,
    startMinute: row.start_minute ?? 0,
    endMinute: row.end_minute ?? 0,
    intervals: intervals.length > 0 ? intervals : [15],
    timeIndicator: row.time_indicator,
    disabledWeekdays,
    liveStatus: row.live_status ?? true,
    liveStatusAutoClose: row.live_status_auto_close ?? true,
    // mig 227 — columna ausente (fila anterior a la migración) → true, el
    // default decidido: recepción SÍ puede finalizar.
    liveStatusReceptionCanEnd: row.live_status_reception_can_end ?? true,
    // mig 176 — undefined column (pre-migration cache/row) → {} default.
    requiredFields: sanitizeRequiredFields(row.required_fields),
    // mig 221 — columna ausente (fila anterior a la migración) → false, que
    // es el comportamiento de siempre.
    allowCustomDuration: row.allow_custom_duration ?? false,
    // mig 254 — columna ausente (fila anterior a la migración) → apagado.
    breakTime: sanitizeBreakTime(row.break_time),
  };
}

/**
 * Fetch scheduler config from DB API, cache in localStorage.
 * Pass the ACTIVE organizationId (useOrganization) — without it the API
 * resolves an arbitrary membership, which reads another org's settings
 * for multi-org users.
 */
export async function fetchSchedulerConfig(orgId?: string | null): Promise<SchedulerConfig> {
  try {
    const url = orgId
      ? `/api/scheduler-settings?org_id=${encodeURIComponent(orgId)}`
      : "/api/scheduler-settings";
    const res = await fetch(url);
    if (!res.ok) return loadSchedulerConfig(); // fallback to localStorage
    const data = await res.json();
    const config = schedulerRowToConfig(data);
    // Cache in localStorage
    saveSchedulerConfig(config);
    return config;
  } catch {
    return loadSchedulerConfig(); // fallback to localStorage
  }
}

/** Save scheduler config to DB API + localStorage cache. Same org_id rule as fetch. */
export async function saveSchedulerConfigToDb(
  config: Partial<SchedulerConfig>,
  orgId?: string | null
): Promise<boolean> {
  // Always save to localStorage as cache
  saveSchedulerConfig(config);

  try {
    const body: Record<string, unknown> = {};
    if (config.startHour !== undefined) body.start_hour = config.startHour;
    if (config.endHour !== undefined) body.end_hour = config.endHour;
    if (config.startMinute !== undefined) body.start_minute = config.startMinute;
    if (config.endMinute !== undefined) body.end_minute = config.endMinute;
    if (config.intervals !== undefined) body.intervals = config.intervals;
    if (config.timeIndicator !== undefined) body.time_indicator = config.timeIndicator;
    if (config.disabledWeekdays !== undefined) body.disabled_weekdays = config.disabledWeekdays;
    if (config.liveStatus !== undefined) body.live_status = config.liveStatus;
    if (config.liveStatusAutoClose !== undefined) body.live_status_auto_close = config.liveStatusAutoClose;
    if (config.liveStatusReceptionCanEnd !== undefined) body.live_status_reception_can_end = config.liveStatusReceptionCanEnd;
    if (config.requiredFields !== undefined) body.required_fields = config.requiredFields;
    if (config.allowCustomDuration !== undefined) body.allow_custom_duration = config.allowCustomDuration;
    if (config.breakTime !== undefined) body.break_time = config.breakTime;
    if (orgId) body.org_id = orgId;

    const res = await fetch("/api/scheduler-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Build the grid's row start-times as a UNIFORM STRIDE: from `startMin`
 * (inclusive, minutes-since-midnight) up to — but not including — `endMin`,
 * stepping by `interval` minutes and carrying over the hour. With interval 45
 * and startMin 435 (07:15) this yields 07:15, 08:00, 08:45, 09:30…, NOT the
 * old per-hour reset. For divisors of 60 (15/30/60) with a whole-hour start
 * (startMin % 60 === 0) the stride lands back on :00 each hour, so the list is
 * byte-for-byte identical to the previous output — zero change there.
 *
 * The window bounds are in MINUTES (mig 175 minute offsets); callers pass
 * `getScheduleStartMinutes`/`getScheduleEndMinutes`. (Note: app/book/[slug]
 * has its own local generateTimeSlots — unrelated to this one.)
 *
 * When `interval` does not divide the window evenly the final row can start
 * less than one interval before `endMin` (e.g. 07:15→14:00 at 45' ends at
 * 13:15, whose full span would run to 14:00). Callers clamp that LAST row's
 * real span to `endMin` so the grid closes exactly at closing time; see the
 * views' `spanMin` memos.
 */
export function generateTimeSlots(startMin: number, endMin: number, interval: number): string[] {
  const slots: string[] = [];
  for (let mins = startMin; mins < endMin; mins += interval) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
  return slots;
}

/**
 * Returns the pixel height of ONE full interval (`slotHeight`) in the
 * calendar grid. Rows are painted PROPORTIONALLY to their real minute
 * span (`spanMin × slotHeight/interval`), so a full-interval row is
 * `slotHeight` px. The grid is a uniform stride (interval 45 → 07:00,
 * 07:45, 08:30…), so every row is one full interval except the last, which
 * may be clamped shorter to close at `endHour`; the geometry reads the real
 * `spanMin` either way — a linear pixel↔minute axis.
 *
 * Orgs with short business hours (e.g. 7am–2pm) used to render with a big
 * blank gap below the last appointment because the grid had a fixed
 * `baseSlotHeight` per slot regardless of viewport. This helper expands the
 * slot height to fill the available container when the natural content
 * (`slotUnits × baseSlotHeight`) is shorter than the viewport, and otherwise
 * keeps the base so a long schedule still scrolls.
 *
 * `slotUnits` = total grid minutes / interval = Σ spanMin / interval. For a
 * uniform grid this equals the row count (identical to the old behavior);
 * for a non-uniform grid it is the true "number of full intervals" the grid
 * spans, so dividing by it fills the container exactly.
 *
 * `headerHeight` is the calendar's sticky header (office/day names) that
 * lives inside the same scroll container and must be subtracted from the
 * available space.
 */
export function computeSlotHeight(
  containerHeight: number,
  slotUnits: number,
  baseSlotHeight: number,
  headerHeight: number
): number {
  if (slotUnits <= 0 || containerHeight <= 0) return baseSlotHeight;
  const available = containerHeight - headerHeight;
  const natural = slotUnits * baseSlotHeight;
  if (available <= natural) return baseSlotHeight;
  return available / slotUnits;
}

// Hour options for selects (0–23)
export function getHourOptions(from = 0, to = 23) {
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const h = from + i;
    return { value: h, label: `${h.toString().padStart(2, "0")}:00` };
  });
}

// Office filter — persisted in localStorage
const OFFICE_FILTER_KEY = "vibeforge_scheduler_office_filter";

/**
 * Load selected office IDs from localStorage.
 * Returns null when no filter is saved (meaning "all offices").
 */
export function loadOfficeFilter(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFFICE_FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Save selected office IDs. Pass null to clear (= all offices).
 */
export function saveOfficeFilter(officeIds: string[] | null) {
  if (typeof window === "undefined") return;
  if (officeIds === null) {
    localStorage.removeItem(OFFICE_FILTER_KEY);
  } else {
    localStorage.setItem(OFFICE_FILTER_KEY, JSON.stringify(officeIds));
  }
}
