/**
 * Fire-and-forget notification sender.
 * Calls /api/notifications/send in the background.
 * Never throws — logs errors silently to avoid disrupting the UI.
 */
export function sendNotification(params: {
  type: string;
  appointment_id: string;
  extra_variables?: Record<string, string>;
}) {
  fetch("/api/notifications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch((err) => {
    console.warn("[sendNotification] failed:", err);
  });
}
