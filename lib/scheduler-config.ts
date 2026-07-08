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
};

export type IntervalOption = 15 | 20 | 30 | 45 | 60;

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
    return { startHour, endHour, startMinute, endMinute, intervals, timeIndicator, disabledWeekdays, liveStatus, liveStatusAutoClose };
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
}

// ─── Database-backed functions ───────────────────────────────────

/** Convert DB row to SchedulerConfig */
function dbRowToConfig(row: {
  start_hour: number;
  end_hour: number;
  start_minute?: number | null;
  end_minute?: number | null;
  intervals: unknown;
  time_indicator: boolean;
  disabled_weekdays: unknown;
  live_status?: boolean | null;
  live_status_auto_close?: boolean | null;
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
  };
}

/** Fetch scheduler config from DB API, cache in localStorage */
export async function fetchSchedulerConfig(): Promise<SchedulerConfig> {
  try {
    const res = await fetch("/api/scheduler-settings");
    if (!res.ok) return loadSchedulerConfig(); // fallback to localStorage
    const data = await res.json();
    const config = dbRowToConfig(data);
    // Cache in localStorage
    saveSchedulerConfig(config);
    return config;
  } catch {
    return loadSchedulerConfig(); // fallback to localStorage
  }
}

/** Save scheduler config to DB API + localStorage cache */
export async function saveSchedulerConfigToDb(config: Partial<SchedulerConfig>): Promise<boolean> {
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
