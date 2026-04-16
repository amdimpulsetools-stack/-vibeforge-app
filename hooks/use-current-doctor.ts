"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useOrgRole } from "@/hooks/use-org-role";

/**
 * Returns the doctor record linked to the current authenticated user.
 * Only fetches when the user has the "doctor" role.
 */
export function useCurrentDoctor() {
  const { user, loading: userLoading } = useUser();
  const { isDoctor, loading: roleLoading } = useOrgRole();
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Start fetching as soon as user is ready — don't wait for role.
    // If the user isn't a doctor, the query simply returns null.
    if (userLoading) return;

    if (!user) {
      setDoctorId(null);
      setLoading(false);
      return;
    }

    const fetchDoctor = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("doctors")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setDoctorId(data?.id ?? null);
      setLoading(false);
    };

    fetchDoctor();
  }, [user, userLoading]);

  return { doctorId, isDoctor, loading };
}
