"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Search, Phone, Mail, ChevronRight, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_DOCTORS, MOCK_DOCTOR_SCHEDULES, type Doctor } from "@/lib/clinic-data";

const DAY_NAMES: Record<number, string> = {
  0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb",
};

function getDoctorDays(doctorId: string): number[] {
  return MOCK_DOCTOR_SCHEDULES
    .filter((s) => s.doctor_id === doctorId && s.is_active)
    .map((s) => s.day_of_week);
}

export default function DoctorsPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_DOCTORS.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.specialty ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Doctores</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona el equipo médico y sus horarios
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          <UserPlus className="h-4 w-4" />
          Nuevo doctor
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nombre o especialidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Lista de doctores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((doctor) => {
          const days = getDoctorDays(doctor.id);
          const allDays = [1, 2, 3, 4, 5, 6, 0];

          return (
            <Link
              key={doctor.id}
              href={`/admin/doctors/${doctor.id}`}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white font-bold text-lg"
                    style={{ backgroundColor: doctor.color }}
                  >
                    {doctor.name.split(" ").pop()?.[0] ?? "D"}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground leading-tight">
                      {doctor.name}
                    </h3>
                    {doctor.specialty && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Stethoscope className="h-3 w-3" />
                        {doctor.specialty}
                      </p>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>

              {/* Contacto */}
              <div className="mt-3 space-y-1">
                {doctor.email && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{doctor.email}</span>
                  </p>
                )}
                {doctor.phone && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    {doctor.phone}
                  </p>
                )}
              </div>

              {/* Días de atención */}
              <div className="mt-4">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Días de atención
                </p>
                <div className="flex gap-1">
                  {allDays.map((d) => {
                    const isActive = days.includes(d);
                    return (
                      <div
                        key={d}
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold",
                          isActive
                            ? "text-white"
                            : "bg-muted text-muted-foreground"
                        )}
                        style={isActive ? { backgroundColor: doctor.color } : undefined}
                        title={DAY_NAMES[d]}
                      >
                        {DAY_NAMES[d]}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Estado */}
              <div className="mt-3 flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    doctor.is_active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      doctor.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                    )}
                  />
                  {doctor.is_active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Stethoscope className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">
            No se encontraron doctores
          </p>
        </div>
      )}
    </div>
  );
}
