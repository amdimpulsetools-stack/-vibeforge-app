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
      // 1. Set the session
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

      // 2. Accept the pending invitation (adds user to org, removes auto-created org)
      try {
        await fetch("/api/auth/accept-invite", { method: "POST" });
      } catch {
        // Non-blocking — invitation might have been accepted already
      }

      // 3. Clear hash and redirect to reset-password
      window.history.replaceState(null, "", "/");
      router.push("/reset-password");
    };

    handleInvite();
  }, [router]);

  return null;
}
