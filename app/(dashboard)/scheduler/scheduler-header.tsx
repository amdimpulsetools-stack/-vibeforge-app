"use client";

import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations } from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import type { ViewMode } from "./page";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  Users,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SchedulerHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onNewAppointment: () => void;
  appointments: AppointmentWithRelations[];
}

export function SchedulerHeader({
  currentDate,
  viewMode,
  onDateChange,
  onViewModeChange,
  onNewAppointment,
  appointments,
}: SchedulerHeaderProps) {
  const { t } = useLanguage();

  const totalSlots =
    ((SCHEDULER_END_HOUR - SCHEDULER_START_HOUR) * 60) / SCHEDULER_INTERVAL;
  const todayAppointments = appointments.filter(
    (a) => a.appointment_date === format(currentDate, "yyyy-MM-dd")
  );
  const pending = todayAppointments.filter(
    (a) => a.status === "scheduled" || a.status === "confirmed"
  ).length;
  const occupationPercent =
    totalSlots > 0
      ? Math.round((todayAppointments.length / (totalSlots * 2)) * 100)
      : 0;

  const navigateDate = (direction: number) => {
    if (viewMode === "day") {
      onDateChange(direction > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    } else {
      onDateChange(direction > 0 ? addDays(currentDate, 7) : subDays(currentDate, 7));
    }
  };

  const goToToday = () => onDateChange(new Date());

  return (
    <div className="border-b border-border bg-card px-4 py-3 space-y-3">
      {/* Top row: navigation + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateDate(-1)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <h2 className="text-lg font-semibold min-w-[200px] text-center capitalize">
            {viewMode === "day"
              ? format(currentDate, "EEEE, d MMMM yyyy", { locale: es })
              : `${format(currentDate, "d MMM", { locale: es })} — ${format(addDays(currentDate, 6), "d MMM yyyy", { locale: es })}`}
          </h2>

          <button
            onClick={() => navigateDate(1)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <button
            onClick={goToToday}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {t("scheduler.today")}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => onViewModeChange("day")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === "day"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("scheduler.day_view")}
            </button>
            <button
              onClick={() => onViewModeChange("week")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                viewMode === "week"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("scheduler.week_view")}
            </button>
          </div>

          <button
            onClick={onNewAppointment}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            {t("scheduler.new_appointment")}
          </button>
        </div>
      </div>

      {/* Overview counters */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">{t("scheduler.overview_total")}:</span>
          <span className="text-sm font-semibold">{todayAppointments.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="text-sm text-muted-foreground">{t("scheduler.overview_pending")}:</span>
          <span className="text-sm font-semibold">{pending}</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5">
          <Percent className="h-4 w-4 text-emerald-500" />
          <span className="text-sm text-muted-foreground">{t("scheduler.overview_occupation")}:</span>
          <span className="text-sm font-semibold">{occupationPercent}%</span>
        </div>
      </div>
    </div>
  );
}
