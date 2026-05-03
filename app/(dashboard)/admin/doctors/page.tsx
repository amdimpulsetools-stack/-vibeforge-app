"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { toast } from "sonner";
import type { Doctor } from "@/types/admin";
import Link from "next/link";
import { getInitials } from "@/lib/utils";
import {
  Stethoscope,
  Pencil,
  Search,
  Users,
  Info,
  Plus,
} from "lucide-react";

export default function DoctorsPage() {
  const { t, language } = useLanguage();
  const { isAdmin } = useOrgRole();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchDoctors = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("doctors")
      .select("*, doctor_schedules(day_of_week, start_time, end_time, is_active)")
      .not("user_id", "is", null)
      .order("full_name");
    setDoctors(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleToggleActive = async (doctor: Doctor) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("doctors")
      .update({ is_active: !doctor.is_active })
      .eq("id", doctor.id);
    if (error) {
      toast.error(t("doctors.save_error"));
      return;
    }
    fetchDoctors();
  };

  const filtered = doctors.filter(
    (d) =>
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      d.cmp.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (isAdmin && doctors.length === 0) {
    return <EmptyStateDoctors />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("doctors.title")}</h1>
          <p className="text-muted-foreground">{t("doctors.subtitle")}</p>
        </div>
      </div>

      {/* Info banner: doctors are synced from members */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {language === "es"
              ? "Los doctores, especialistas y licenciados/as se sincronizan automáticamente desde los miembros de la organización. Para agregar nuevos profesionales, invítalos desde el panel de miembros."
              : "Doctors, specialists and professionals are automatically synced from organization members. To add new professionals, invite them from the members panel."}
          </p>
          {isAdmin && (
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Users className="h-4 w-4" />
              {language === "es" ? "Ir a miembros" : "Go to members"}
            </Link>
          )}
        </div>
      </div>

      {doctors.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Stethoscope className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            {doctors.length === 0 ? t("doctors.no_doctors") : t("common.no_results")}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((doctor) => {
          const schedules = (doctor as any).doctor_schedules ?? [];
          const activeDays = new Set(schedules.filter((s: any) => s.is_active).map((s: any) => s.day_of_week));
          const todayDow = new Date().getDay();
          const todaySchedule = schedules.find((s: any) => s.day_of_week === todayDow && s.is_active);
          const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

          return (
            <div
              key={doctor.id}
              className={`rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md ${!doctor.is_active ? "opacity-60" : ""}`}
            >
              {/* Header with avatar + name */}
              <div className="p-4 pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: doctor.color }}
                  >
                    {getInitials(doctor.full_name)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold truncate">{doctor.full_name}</h4>
                    <p className="text-xs text-muted-foreground">CMP: {doctor.cmp}</p>
                  </div>
                </div>
              </div>

              {/* Weekly schedule dots */}
              <div className="px-4 pb-3">
                <div className="flex items-center gap-1">
                  {dayLabels.map((label, idx) => (
                    <div key={idx} className="flex-1 text-center">
                      <p className="text-[9px] text-muted-foreground mb-1">{label}</p>
                      <div
                        className={`mx-auto h-2 w-2 rounded-full ${
                          activeDays.has(idx)
                            ? "bg-emerald-500"
                            : "bg-muted"
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Today status */}
              <div className="px-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">Hoy</span>
                  {todaySchedule ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Disponible</span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">No atiende</span>
                  )}
                </div>
                {todaySchedule && (
                  <span className="text-[10px] text-muted-foreground">
                    {todaySchedule.start_time?.slice(0, 5)} - {todaySchedule.end_time?.slice(0, 5)}
                  </span>
                )}
              </div>

              {/* Footer actions */}
              {isAdmin && (
                <div className="border-t border-border">
                  <Link
                    href={`/admin/doctors/${doctor.id}`}
                    className="flex w-full items-center justify-center gap-2 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar Doctor
                  </Link>
                </div>
              )}
            </div>
          );
        })}

        {/* Add new doctor card */}
        {isAdmin && (
          <Link
            href="/admin/doctors/new"
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card/50 p-8 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors min-h-[200px]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Plus className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium">{t("doctors.add")}</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyStateDoctors() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Stethoscope className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Agrega al primer doctor de tu clínica
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Los doctores son quienes atienden las citas. Cada uno puede tener su
          propio horario, consultorios autorizados y especialidades.
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            href="/admin/doctors/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar primer doctor
          </Link>
        </div>
        <div className="mt-5 flex justify-center">
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Después podrás invitar al doctor por email a Yenda para que él mismo gestione su agenda.
          </span>
        </div>
      </div>
    </div>
  );
}
