"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";

/**
 * ¿El usuario actual es asesora de fertilidad?
 * (`organization_members.is_fertility_advisor`, mig 137)
 *
 * Las asesoras (obstetras coordinadoras) funcionan como asistentes:
 * aunque su rol base sea `doctor`, agendan y gestionan citas de
 * CUALQUIER doctor de la org — como recepción. Este hook permite
 * relajar las restricciones "solo mis citas" del rol doctor sin
 * crear un 5.º rol.
 */
export function useIsFertilityAdvisor() {
  const { user, loading: userLoading } = useUser();
  const [isAdvisor, setIsAdvisor] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      setIsAdvisor(false);
      setLoading(false);
      return;
    }
    const fetchFlag = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("organization_members")
        .select("is_fertility_advisor")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      setIsAdvisor(Boolean(data?.is_fertility_advisor));
      setLoading(false);
    };
    fetchFlag();
  }, [user, userLoading]);

  return { isAdvisor, loading };
}
