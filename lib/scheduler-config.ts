// Scheduler configuration — persisted in localStorage

export const SCHEDULER_CONFIG_KEYS = {
  startHour: "vibeforge_scheduler_start",
  endHour: "vibeforge_scheduler_end",
  interval: "vibeforge_scheduler_interval",
  timeIndicator: "vibeforge_time_indicator",
};

export type IntervalOption = 15 | 20 | 30 | 45 | 60;

export interface SchedulerConfig {
  startHour: number;
  endHour: number;
  intervals: IntervalOption[];
  timeIndicator: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  startHour: 8,
  endHour: 20,
  intervals: [15],
  timeIndicator: true,
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
    const timeIndicator = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.timeIndicator) ?? "true") === "true";
    return { startHour, endHour, intervals, timeIndicator };
  } catch {
    return DEFAULT_SCHEDULER_CONFIG;
  }
}

export function saveSchedulerConfig(config: Partial<SchedulerConfig>) {
  if (typeof window === "undefined") return;
  if (config.startHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.startHour, String(config.startHour));
  if (config.endHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.endHour, String(config.endHour));
  if (config.intervals !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.interval, JSON.stringify(config.intervals));
  if (config.timeIndicator !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.timeIndicator, String(config.timeIndicator));
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
