"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";

export type AvatarOption = "doctor-male" | "doctor-female" | "admin" | "receptionist";

interface UserAvatar {
  avatarUrl: string | null;
  avatarOption: AvatarOption | null;
  loading: boolean;
}

export function useUserAvatar(): UserAvatar {
  const { user } = useUser();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarOption, setAvatarOption] = useState<AvatarOption | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase
      .from("user_profiles")
      .select("avatar_url, avatar_option")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setAvatarUrl(data?.avatar_url ?? null);
        setAvatarOption(data?.avatar_option ?? null);
        setLoading(false);
      });
  }, [user]);

  return { avatarUrl, avatarOption, loading };
}
