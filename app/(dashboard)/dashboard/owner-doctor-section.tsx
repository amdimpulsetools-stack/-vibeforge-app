"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Stethoscope, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// La sección nace colapsada: el owner/admin con ficha de doctor solo ve
// "Mi Consulta" plegado. Cargar DoctorDashboard (y su árbol) de forma
// estática metía ~45-55 kB gz en el First Load de /dashboard para algo que
// la mayoría de las visitas nunca abre.
//
// El fallback replica exactamente el estado de carga que el propio
// DoctorDashboard pinta mientras trae sus datos (doctor-dashboard.tsx:205-214),
// así que al desplegar se ve lo mismo que antes.
const loadDoctorDashboard = () => import("./doctor-dashboard");

const DoctorDashboard = dynamic(
  () => loadDoctorDashboard().then((m) => m.DoctorDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse">
            Cargando tu dashboard...
          </p>
        </div>
      </div>
    ),
  },
);

export function OwnerDoctorSection({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  // Precarga el chunk al acercar el puntero al botón (webpack deduplica la
  // promesa): para cuando el clic llega, el módulo ya está en caché y el
  // desplegado es instantáneo.
  const preload = () => {
    void loadDoctorDashboard();
  };

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
        onPointerEnter={preload}
        onFocus={preload}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <Stethoscope className="h-5 w-5 text-emerald-500" />
        <span className="text-sm font-semibold">Mi Consulta</span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="mt-4">
          <DoctorDashboard userName={userName} />
        </div>
      )}
    </div>
  );
}
