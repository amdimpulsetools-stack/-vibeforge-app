// ============================================================
// User-Agent → human-readable device label.
//
// Minimal parser — we don't need precise browser version, just
// "Chrome en macOS" / "Safari en iPhone" / "Firefox en Windows"
// so the user recognizes their device in /account/devices.
// Avoids pulling a heavyweight UA library.
// ============================================================

function detectBrowser(ua: string): string {
  // Order matters: Edge contains "Chrome", Opera contains "Chrome",
  // etc. Check the more specific ones first.
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Navegador";
}

function detectOs(ua: string): string {
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "dispositivo";
}

export function deviceLabelFromUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Dispositivo desconocido";
  const browser = detectBrowser(userAgent);
  const os = detectOs(userAgent);
  return `${browser} en ${os}`;
}
