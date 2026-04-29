// Scheduler configuration — persisted in database (with localStorage cache)

export const SCHEDULER_CONFIG_KEYS = {
  startHour: "vibeforge_scheduler_start",
  endHour: "vibeforge_scheduler_end",
  interval: "vibeforge_scheduler_interval",
  timeIndicator: "vibeforge_time_indicator",
  disabledWeekdays: "vibeforge_disabled_weekdays",
};

export type IntervalOption = 15 | 20 | 30 | 45 | 60;

/** Weekday numbers: 0=Sunday, 1=Monday, …, 6=Saturday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SchedulerConfig {
  startHour: number;
  endHour: number;
  intervals: IntervalOption[];
  timeIndicator: boolean;
  /** Permanently disabled weekdays (e.g. [0] = Sunday off) */
  disabledWeekdays: Weekday[];
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  startHour: 8,
  endHour: 20,
  intervals: [15],
  timeIndicator: true,
  disabledWeekdays: [0], // Sunday disabled by default
};

/** Returns the smallest selected interval (used for the grid resolution). */
export function getActiveInterval(config: SchedulerConfig): IntervalOption {
  return Math.min(...config.intervals) as IntervalOption;
}

export function loadSchedulerConfig(): SchedulerConfig {
  if (typeof window === "undefined") return DEFAULT_SCHEDULER_CONFIG;
  try {
    const startHour = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.startHour) ?? "") || DEFAULT_SCHEDULER_CONFIG.startHour;
    const endHour = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.endHour) ?? "") || DEFAULT_SCHEDULER_CONFIG.endHour;
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
    return { startHour, endHour, intervals, timeIndicator, disabledWeekdays };
  } catch {
    return DEFAULT_SCHEDULER_CONFIG;
  }
}

export function saveSchedulerConfig(config: Partial<SchedulerConfig>) {
  if (typeof window === "undefined") return;
  // Save to localStorage as cache
  if (config.startHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.startHour, String(config.startHour));
  if (config.endHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.endHour, String(config.endHour));
  if (config.intervals !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.interval, JSON.stringify(config.intervals));
  if (config.timeIndicator !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.timeIndicator, String(config.timeIndicator));
  if (config.disabledWeekdays !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.disabledWeekdays, JSON.stringify(config.disabledWeekdays));
}

// ─── Database-backed functions ───────────────────────────────────

/** Convert DB row to SchedulerConfig */
function dbRowToConfig(row: {
  start_hour: number;
  end_hour: number;
  intervals: unknown;
  time_indicator: boolean;
  disabled_weekdays: unknown;
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
    intervals: intervals.length > 0 ? intervals : [15],
    timeIndicator: row.time_indicator,
    disabledWeekdays,
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
    if (config.intervals !== undefined) body.intervals = config.intervals;
    if (config.timeIndicator !== undefined) body.time_indicator = config.timeIndicator;
    if (config.disabledWeekdays !== undefined) body.disabled_weekdays = config.disabledWeekdays;

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

export function generateTimeSlots(startHour: number, endHour: number, interval: number): string[] {
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += interval) {
      slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return slots;
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
