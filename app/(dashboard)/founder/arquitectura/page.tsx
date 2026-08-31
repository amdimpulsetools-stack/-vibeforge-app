"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";

/**
 * Mapa de arquitectura de Yenda — herramienta interna del founder.
 *
 * React Flow mide el DOM al montar, así que el lienzo entra sin SSR: en
 * el servidor no hay tamaños y el primer render saldría con el grafo
 * colapsado en una esquina.
 */
const ArchitectureMap = dynamic(
  () => import("@/components/architecture/architecture-map").then((m) => m.ArchitectureMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#080b11]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
      </div>
    ),
  }
);

export default function ArquitecturaPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [authorized, setAuthorized] = useState(false);

  // Mismo guard que el resto del panel del founder (is_founder en
  // user_profiles): esta vista describe el sistema completo y no tiene
  // por qué verla el equipo de una clínica.
  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const check = async () => {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("is_founder")
        .eq("id", user.id)
        .single();

      if (!profile?.is_founder) {
        router.push("/dashboard");
        return;
      }
      setAuthorized(true);
    };

    void check();
  }, [user, userLoading, router]);

  if (!authorized) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Alto fijo por viewport: el lienzo necesita un contenedor con altura
  // real (un `h-full` sobre un padre sin altura le da 0px).
  return (
    <div className="h-[calc(100vh-4rem)] w-full overflow-hidden rounded-xl border border-slate-800">
      <ArchitectureMap />
    </div>
  );
}
