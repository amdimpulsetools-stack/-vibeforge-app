"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Handles Supabase invite tokens that arrive as hash fragments.
 * When a user clicks an invitation email, Supabase redirects to:
 *   /#access_token=...&type=invite
 * This component:
 * 1. Sets the auth session from the token
 * 2. Accepts the pending organization invitation (adds user to org)
 * 3. Redirects to /reset-password to set their password
 */
export function InviteTokenHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("type=invite")) return;

    const params = new URLSearchParams(hash.replace("#", ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) return;

    const handleInvite = async () => {
      // 1. Clear hash immediately so user doesn't see the long URL
      window.history.replaceState(null, "", "/");

      // 2. Set the session
      const supabase = createClient();
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("Error setting invite session:", error);
        router.push("/login");
        return;
      }

      // 3. Redirect to reset-password immediately
      router.push("/reset-password");

      // 4. Accept invitation in background (non-blocking)
      fetch("/api/auth/accept-invite", { method: "POST" }).catch(() => {});
    };

    handleInvite();
  }, [router]);

  return null;
}
