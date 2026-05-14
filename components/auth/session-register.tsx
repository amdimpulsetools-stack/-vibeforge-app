"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDeviceId } from "@/hooks/use-device-id";
import { DeviceLimitDialog, type ExistingSession } from "./device-limit-dialog";

/**
 * Mounted once at the top of any authenticated layout. Registers
 * the current (user, device) pair with the session-limits
 * backend on the first render after login, and renders the
 * over-limit modal when the API responds 409.
 *
 * Renders nothing while idle.
 *
 * Key invariants:
 * - We only POST register ONCE per page-load — controlled by the
 *   `registered` ref state. Re-mounts (route changes within the
 *   same tab) skip the call.
 * - We retry the register call automatically after the user
 *   picks a session to close in the dialog (with the now-freed
 *   slot).
 */
export function SessionRegister() {
  const router = useRouter();
  const deviceId = useDeviceId();
  const [registered, setRegistered] = useState(false);
  const [limitExceeded, setLimitExceeded] = useState<{
    limit: number;
    sessions: ExistingSession[];
  } | null>(null);

  const register = useCallback(
    async (deviceIdToUse: string) => {
      try {
        const res = await fetch("/api/auth/session/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_id: deviceIdToUse }),
        });
        if (res.status === 401) {
          // Not logged in — endpoint refused. Render nothing.
          setRegistered(true);
          return;
        }
        if (res.status === 409) {
          const data = (await res.json()) as {
            limit: number;
            sessions: ExistingSession[];
          };
          setLimitExceeded({ limit: data.limit, sessions: data.sessions });
          // Do NOT mark registered yet — the dialog flow will retry.
          return;
        }
        if (!res.ok) {
          // Soft fail — log and move on. Backend is feature-flagged
          // off in cases where this might fail.
          console.warn("[session-register] non-ok status", res.status);
        }
        setRegistered(true);
      } catch (err) {
        // Network blip — don't lock the user out of the app. Retry
        // on the next page load.
        console.warn("[session-register] network error", err);
        setRegistered(true);
      }
    },
    [],
  );

  useEffect(() => {
    if (!deviceId || registered) return;
    void register(deviceId);
  }, [deviceId, registered, register]);

  // Handler called from the dialog when the user picks sessions
  // to close. Revokes each, then re-attempts register.
  const handleCloseAndRetry = useCallback(
    async (sessionIds: string[]) => {
      if (!deviceId) return;
      // Revoke each in parallel — they're independent rows.
      await Promise.all(
        sessionIds.map((id) =>
          fetch("/api/auth/session/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: id,
              reason: "limit_exceeded",
            }),
          }),
        ),
      );
      setLimitExceeded(null);
      // Re-attempt register with the freed slot. We DON'T set
      // registered=true between steps so the effect doesn't fire
      // a third call from the deviceId dependency.
      await register(deviceId);
      // Soft refresh so any server components re-fetch user data.
      router.refresh();
    },
    [deviceId, register, router],
  );

  if (!limitExceeded) return null;

  return (
    <DeviceLimitDialog
      open
      limit={limitExceeded.limit}
      sessions={limitExceeded.sessions}
      onConfirm={handleCloseAndRetry}
    />
  );
}
