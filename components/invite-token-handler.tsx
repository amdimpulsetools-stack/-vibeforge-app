"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Handles Supabase invite tokens that arrive as hash fragments.
 * When a user clicks an invitation email, Supabase redirects to:
 *   /#access_token=...&type=invite
 * This component detects that and redirects to /reset-password
 * so the invited user can set their password.
 */
export function InviteTokenHandler() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("type=invite")) return;

    // Parse the hash params
    const params = new URLSearchParams(hash.replace("#", ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) return;

    const handleInvite = async () => {
      // Set the session with the tokens from the invite link
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

      // Clear the hash from the URL
      window.history.replaceState(null, "", "/");

      // Redirect to reset-password so they can create their password
      router.push("/reset-password");
    };

    handleInvite();
  }, [router]);

  return null;
}
