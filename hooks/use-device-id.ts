"use client";

import { useEffect, useState } from "react";

const LOCAL_KEY = "yenda_device_id";
const COOKIE_KEY = "yenda_device_id";
// Match cookie max-age set by /api/auth/session/register (1 year).
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// RFC4122 v4 UUID generator that doesn't depend on crypto.randomUUID
// (which isn't available on every older browser we may see in clinics).
function generateUuidV4(): string {
  // Use crypto.getRandomValues for entropy where available.
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  // Fallback — Math.random is fine for an opaque local identifier.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[2]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Returns a stable per-device UUID. Persists across logins/logouts
 * for the same browser. Used as input to the device-limit
 * session registration endpoint.
 *
 * On first mount: reads localStorage, falls back to cookie (in
 * case localStorage was wiped), generates a new UUID if neither
 * exists, and writes back to both stores so they stay in sync.
 *
 * Returns null until hydration is complete to avoid SSR mismatch.
 */
export function useDeviceId(): string | null {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let id = window.localStorage.getItem(LOCAL_KEY);
    if (!id) {
      // Recover from cookie if localStorage was cleared but cookie
      // survived (rare, but happens when a user clears site data
      // partially via DevTools).
      id = readCookie(COOKIE_KEY);
    }
    if (!id) {
      id = generateUuidV4();
    }
    // Always rewrite both stores — corrects drift.
    try {
      window.localStorage.setItem(LOCAL_KEY, id);
    } catch {
      // Some browsers in private mode throw on localStorage writes.
      // The cookie alone is enough for the middleware path.
    }
    writeCookie(COOKIE_KEY, id);
    setDeviceId(id);
  }, []);

  return deviceId;
}
