"use client";

import { useState } from "react";
import { ChevronDown, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { DoctorDashboard } from "./doctor-dashboard";

export function OwnerDoctorSection({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(!open)}
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
