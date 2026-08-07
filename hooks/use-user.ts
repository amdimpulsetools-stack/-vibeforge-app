"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { AUTH_USER_QUERY_KEY } from "@/lib/query-keys";
import type { User } from "@supabase/supabase-js";

/**
 * Usuario autenticado, deduplicado vía React Query.
 *
 * Antes cada montaje de useUser() (y theme-provider, use-notifications,
 * sidebar…) disparaba su propio supabase.auth.getUser() al montar el shell
 * (~6 llamadas paralelas). Ahora todos comparten la clave ['auth','user'],
 * así que getUser() se ejecuta una sola vez y el resto lee del caché.
 *
 * staleTime: Infinity porque el listener onAuthStateChange de abajo es la
 * fuente de verdad para cambios de sesión: escribe directamente en la clave
 * (login, logout, refresh de token), igual que antes hacía setUser local.
 */
export function useUser() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery<User | null>({
    queryKey: AUTH_USER_QUERY_KEY,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
  });

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      queryClient.setQueryData<User | null>(
        AUTH_USER_QUERY_KEY,
        session?.user ?? null
      );
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return { user: data ?? null, loading: isPending };
}
