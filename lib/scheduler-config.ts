// Scheduler configuration — persisted in localStorage

export const SCHEDULER_CONFIG_KEYS = {
  startHour: "vibeforge_scheduler_start",
  endHour: "vibeforge_scheduler_end",
  interval: "vibeforge_scheduler_interval",
  timeIndicator: "vibeforge_time_indicator",
};

export interface SchedulerConfig {
  startHour: number;
  endHour: number;
  interval: 15 | 30 | 60;
  timeIndicator: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  startHour: 8,
  endHour: 20,
  interval: 30,
  timeIndicator: true,
};

export function loadSchedulerConfig(): SchedulerConfig {
  if (typeof window === "undefined") return DEFAULT_SCHEDULER_CONFIG;
  try {
    const startHour = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.startHour) ?? "") || DEFAULT_SCHEDULER_CONFIG.startHour;
    const endHour = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.endHour) ?? "") || DEFAULT_SCHEDULER_CONFIG.endHour;
    const rawInterval = parseInt(localStorage.getItem(SCHEDULER_CONFIG_KEYS.interval) ?? "");
    const interval: 15 | 30 | 60 = rawInterval === 15 ? 15 : rawInterval === 60 ? 60 : 30;
    const timeIndicator = (localStorage.getItem(SCHEDULER_CONFIG_KEYS.timeIndicator) ?? "true") === "true";
    return { startHour, endHour, interval, timeIndicator };
  } catch {
    return DEFAULT_SCHEDULER_CONFIG;
  }
}

export function saveSchedulerConfig(config: Partial<SchedulerConfig>) {
  if (typeof window === "undefined") return;
  if (config.startHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.startHour, String(config.startHour));
  if (config.endHour !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.endHour, String(config.endHour));
  if (config.interval !== undefined) localStorage.setItem(SCHEDULER_CONFIG_KEYS.interval, String(config.interval));
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
