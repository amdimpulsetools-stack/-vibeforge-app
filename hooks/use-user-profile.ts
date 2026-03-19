"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";

interface UserProfile {
  full_name: string | null;
  role: "user" | "admin";
}

export function useUserProfile() {
  const { user, loading: userLoading } = useUser();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase
      .from("user_profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setLoading(false);
      });
  }, [user, userLoading]);

  return {
    user,
    profile,
    loading: userLoading || loading,
    isAdmin: profile?.role === "admin",
  };
}
