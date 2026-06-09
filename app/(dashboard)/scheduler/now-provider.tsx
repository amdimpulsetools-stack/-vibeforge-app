"use client";

/**
 * Shared minute ticker for the scheduler.
 *
 * Problem: time-relative UI (current-time line, future live-status
 * states like "overdue" or "stale consultation") needs a re-render
 * every minute. Naively giving each card its own setInterval — or
 * holding `now` in the page component's state — re-renders the whole
 * grid every tick. With memoized cards, a Context provider lets ONLY
 * the components that actually call useNow() re-render.
 *
 * The provider ticks once per minute, aligned to the wall-clock
 * minute so the time indicator visually matches the user's clock.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const NowContext = createContext<Date>(new Date());

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    // Align the first tick to the next wall-clock minute, then tick
    // every 60 s. Without alignment the indicator can lag the user's
    // clock by up to 59 s.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

/**
 * Current time, updated once per minute. Components calling this hook
 * re-render on every tick — keep it OUT of grid containers and inside
 * the leaf components that actually need the clock.
 */
export function useNow(): Date {
  return useContext(NowContext);
}
