"use client";

import { useState, useRef, useEffect } from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office } from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import type { ViewMode } from "./page";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  Percent,
  Lock,
  Coffee,
  Building2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface SchedulerHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onNewAppointment: () => void;
  onNewBlock?: () => void;
  onBreakTime?: () => void;
  breakTimeEnabled?: boolean;
  appointments: AppointmentWithRelations[];
  offices: Office[];
  selectedOfficeIds: string[];
  onOfficeFilterChange: (officeIds: string[]) => void;
}

export function SchedulerHeader({
  currentDate,
  viewMode,
  onDateChange,
  onViewModeChange,
  onNewAppointment,
  onNewBlock,
  onBreakTime,
  breakTimeEnabled,
  appointments,
  offices,
  selectedOfficeIds,
  onOfficeFilterChange,
}: SchedulerHeaderProps) {
  const { t } = useLanguage();
  const [officeDropdownOpen, setOfficeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOfficeDropdownOpen(false);
      }
    }
    if (officeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [officeDropdownOpen]);

  const allSelected = selectedOfficeIds.length === offices.length;

  const toggleOffice = (officeId: string) => {
    const isSelected = selectedOfficeIds.includes(officeId);
    if (isSelected) {
      // Don't allow deselecting the last one
      if (selectedOfficeIds.length <= 1) return;
      onOfficeFilterChange(selectedOfficeIds.filter((id) => id !== officeId));
    } else {
      onOfficeFilterChange([...selectedOfficeIds, officeId]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      // Select only the first office
      if (offices.length > 0) onOfficeFilterChange([offices[0].id]);
    } else {
      onOfficeFilterChange(offices.map((o) => o.id));
    }
  };

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

  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(date);
      setCalendarOpen(false);
    }
  };

  return (
    <div className="border-b border-border px-4 py-3 space-y-3">
      {/* Top row */}
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

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  isToday(currentDate)
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {t("scheduler.today")}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <div className="flex flex-col">
                <Calendar
                  mode="single"
                  selected={currentDate}
                  onSelect={handleCalendarSelect}
                  defaultMonth={currentDate}
                  locale={es}
                />
                <div className="border-t border-border p-2">
                  <button
                    onClick={() => {
                      onDateChange(new Date());
                      setCalendarOpen(false);
                    }}
                    className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    {t("scheduler.today")}
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Office filter */}
          {offices.length > 1 && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setOfficeDropdownOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  !allSelected
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {allSelected
                    ? "Todos"
                    : selectedOfficeIds.length === 1
                      ? offices.find((o) => o.id === selectedOfficeIds[0])?.name ?? "1"
                      : `${selectedOfficeIds.length} consultorios`}
                </span>
                {!allSelected && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground sm:hidden">
                    {selectedOfficeIds.length}
                  </span>
                )}
              </button>

              {officeDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {/* Select all */}
                  <button
                    onClick={toggleAll}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        allSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {allSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="font-medium">Todos los consultorios</span>
                  </button>

                  <div className="my-1 h-px bg-border" />

                  {offices.map((office) => {
                    const checked = selectedOfficeIds.includes(office.id);
                    return (
                      <button
                        key={office.id}
                        onClick={() => toggleOffice(office.id)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{office.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bloquear button */}
          {onNewBlock && (
            <button
              onClick={onNewBlock}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <Lock className="h-4 w-4" />
              Bloquear
            </button>
          )}

          {/* Break Time button */}
          {onBreakTime && (
            <div className="relative group">
              <button
                onClick={onBreakTime}
                className={cn(
                  "rounded-lg border p-2 transition-colors",
                  breakTimeEnabled
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <Coffee className="h-4 w-4" />
                {breakTimeEnabled && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500" />
                )}
              </button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
                <div className="relative rounded-lg bg-popover border border-border px-3 py-1.5 shadow-lg">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-popover border-l border-t border-border" />
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">Break Time</span>
                </div>
              </div>
            </div>
          )}

          {/* Nueva cita */}
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
