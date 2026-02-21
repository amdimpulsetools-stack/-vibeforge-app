"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { format, addDays, startOfWeek } from "date-fns";
import { toast } from "sonner";
import type {
  AppointmentWithRelations,
  Office,
  Doctor,
  Service,
  LookupValue,
  ScheduleBlock,
  DoctorSchedule,
} from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import { SchedulerHeader } from "./scheduler-header";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { AppointmentSidebar } from "./appointment-sidebar";
import { AppointmentFormModal } from "./appointment-form-modal";
import { RescheduleModal } from "./reschedule-modal";
import { BlockDialog } from "./block-dialog";
import {
  BreakTimeDialog,
  loadBreakTimeConfig,
  DEFAULT_BREAK_TIME_CONFIG,
  type BreakTimeConfig,
} from "./break-time-dialog";

export type ViewMode = "day" | "week";

function generateBreakTimeBlocks(
  config: BreakTimeConfig,
  startDate: string,
  endDate: string
): ScheduleBlock[] {
  if (!config.enabled) return [];
  const result: ScheduleBlock[] = [];
  // Use noon to avoid DST/timezone edge cases when computing day-of-week
  const cursor = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  while (cursor <= end) {
    const dow = cursor.getDay(); // 0=Sun … 6=Sat
    if (config.days.includes(dow)) {
      const dateStr = cursor.toISOString().split("T")[0];
      result.push({
        id: `bt-${dateStr}`,
        block_date: dateStr,
        start_time: config.startTime,
        end_time: config.endTime,
        office_id: null,
        all_day: false,
        reason: "__break_time__",
        created_at: "",
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export default function SchedulerPage() {
  const { t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [doctorServices, setDoctorServices] = useState<{ doctor_id: string; service_id: string }[]>([]);
  const [doctorSchedules, setDoctorSchedules] = useState<Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time">[]>([]);
  const [lookupOrigins, setLookupOrigins] = useState<LookupValue[]>([]);
  const [lookupPayments, setLookupPayments] = useState<LookupValue[]>([]);
  const [lookupResponsibles, setLookupResponsibles] = useState<LookupValue[]>([]);
  const [loading, setLoading] = useState(true);

  // Sidebar & form state
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDefaults, setFormDefaults] = useState<{
    date?: string;
    startTime?: string;
    officeId?: string;
  } | null>(null);

  // Reschedule modal
  const [showReschedule, setShowReschedule] = useState(false);

  // Block dialog
  const [showBlockDialog, setShowBlockDialog] = useState(false);

  // Break time
  const [showBreakTimeDialog, setShowBreakTimeDialog] = useState(false);
  const [breakTimeConfig, setBreakTimeConfig] = useState<BreakTimeConfig>(DEFAULT_BREAK_TIME_CONFIG);

  // Fetch master data once
  useEffect(() => {
    const fetchMasterData = async () => {
      const supabase = createClient();
      const [
        officesRes,
        doctorsRes,
        servicesRes,
        doctorServicesRes,
        doctorSchedulesRes,
        originsRes,
        paymentsRes,
        responsiblesRes,
      ] = await Promise.all([
        supabase.from("offices").select("*").eq("is_active", true).order("display_order"),
        supabase.from("doctors").select("*").eq("is_active", true).order("full_name"),
        supabase.from("services").select("*").eq("is_active", true).order("name"),
        supabase.from("doctor_services").select("doctor_id, service_id"),
        supabase.from("doctor_schedules").select("doctor_id, day_of_week, start_time, end_time"),
        supabase
          .from("lookup_values")
          .select("*, lookup_categories!inner(slug)")
          .eq("lookup_categories.slug", "origin")
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("lookup_values")
          .select("*, lookup_categories!inner(slug)")
          .eq("lookup_categories.slug", "payment_method")
          .eq("is_active", true)
          .order("display_order"),
        supabase
          .from("lookup_values")
          .select("*, lookup_categories!inner(slug)")
          .eq("lookup_categories.slug", "responsible")
          .eq("is_active", true)
          .order("display_order"),
      ]);

      setOffices(officesRes.data ?? []);
      setDoctors(doctorsRes.data ?? []);
      setServices(servicesRes.data ?? []);
      setDoctorServices((doctorServicesRes.data as { doctor_id: string; service_id: string }[]) ?? []);
      setDoctorSchedules((doctorSchedulesRes.data as Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time">[]) ?? []);
      setLookupOrigins((originsRes.data as LookupValue[]) ?? []);
      setLookupPayments((paymentsRes.data as LookupValue[]) ?? []);
      setLookupResponsibles((responsiblesRes.data as LookupValue[]) ?? []);
    };

    fetchMasterData();
  }, []);

  // Load break time config from localStorage (client-side only)
  useEffect(() => {
    setBreakTimeConfig(loadBreakTimeConfig());
  }, []);

  // Date range helpers
  const getDateRange = useCallback(() => {
    if (viewMode === "day") {
      const d = format(currentDate, "yyyy-MM-dd");
      return { startDate: d, endDate: d };
    }
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return {
      startDate: format(weekStart, "yyyy-MM-dd"),
      endDate: format(addDays(weekStart, 6), "yyyy-MM-dd"),
    };
  }, [currentDate, viewMode]);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    const supabase = createClient();
    const { startDate, endDate } = getDateRange();

    const { data } = await supabase
      .from("appointments")
      .select("*, doctors(*), offices(*), services(*)")
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .neq("status", "cancelled")
      .order("start_time");

    setAppointments((data as AppointmentWithRelations[]) ?? []);
    setLoading(false);
  }, [getDateRange]);

  // Fetch schedule blocks
  const fetchBlocks = useCallback(async () => {
    const supabase = createClient();
    const { startDate, endDate } = getDateRange();

    const { data } = await supabase
      .from("schedule_blocks")
      .select("*")
      .gte("block_date", startDate)
      .lte("block_date", endDate);

    setBlocks((data as ScheduleBlock[]) ?? []);
  }, [getDateRange]);

  useEffect(() => {
    fetchAppointments();
    fetchBlocks();
  }, [fetchAppointments, fetchBlocks]);

  // Handlers
  const handleSlotClick = (date: Date, time: string, officeId: string) => {
    setFormDefaults({
      date: format(date, "yyyy-MM-dd"),
      startTime: time,
      officeId,
    });
    setShowForm(true);
    setSelectedAppointment(null);
  };

  const handleAppointmentClick = (appointment: AppointmentWithRelations) => {
    setSelectedAppointment(appointment);
    setShowForm(false);
  };

  const handleCloseSidebar = () => {
    setSelectedAppointment(null);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setFormDefaults(null);
  };

  const handleSaved = () => {
    fetchAppointments();
    setShowForm(false);
    setFormDefaults(null);
    setSelectedAppointment(null);
    setShowReschedule(false);
  };

  // Drag & drop: update appointment date/time/office
  const handleAppointmentDrop = async (
    appointmentId: string,
    targetDate: Date,
    targetTime: string,
    targetOfficeId: string
  ) => {
    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt) return;

    // Compute new end time preserving duration
    const [sh, sm] = appt.start_time.slice(0, 5).split(":").map(Number);
    const [eh, em] = appt.end_time.slice(0, 5).split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    const [nh, nm] = targetTime.split(":").map(Number);
    const newEndMin = nh * 60 + nm + duration;
    const newEndTime = `${Math.floor(newEndMin / 60).toString().padStart(2, "0")}:${(newEndMin % 60).toString().padStart(2, "0")}`;
    const newDateStr = format(targetDate, "yyyy-MM-dd");

    // Conflict check (exclude self)
    const conflict = appointments.find(
      (a) =>
        a.id !== appointmentId &&
        a.appointment_date === newDateStr &&
        a.office_id === targetOfficeId &&
        a.start_time.slice(0, 5) < newEndTime &&
        a.end_time.slice(0, 5) > targetTime
    );

    if (conflict) {
      toast.error("Conflicto: ya existe una cita en ese horario y consultorio");
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: newDateStr,
        start_time: targetTime,
        end_time: newEndTime,
        office_id: targetOfficeId,
      })
      .eq("id", appointmentId);

    if (error) {
      toast.error("Error al mover la cita: " + error.message);
      return;
    }

    toast.success(`Cita movida a ${newDateStr} ${targetTime}`);
    fetchAppointments();
  };

  // Unblock a schedule block
  const handleUnblock = async (blockId: string) => {
    // Break time virtual blocks → open config dialog instead of deleting
    if (blockId.startsWith("bt-")) {
      setShowBreakTimeDialog(true);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("schedule_blocks")
      .delete()
      .eq("id", blockId);

    if (error) {
      toast.error("Error al desbloquear: " + error.message);
      return;
    }
    toast.success("Horario desbloqueado");
    fetchBlocks();
  };

  // Block dialog date pre-selection
  const blockDialogDefaultDate = format(currentDate, "yyyy-MM-dd");

  // Merge DB blocks with virtual break time blocks for rendering
  const { startDate: rangeStart, endDate: rangeEnd } = getDateRange();
  const allBlocks = [
    ...blocks,
    ...generateBreakTimeBlocks(breakTimeConfig, rangeStart, rangeEnd),
  ];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <SchedulerHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onDateChange={setCurrentDate}
        onViewModeChange={setViewMode}
        onNewAppointment={() => {
          setFormDefaults({ date: format(currentDate, "yyyy-MM-dd") });
          setShowForm(true);
        }}
        onNewBlock={() => setShowBlockDialog(true)}
        onBreakTime={() => setShowBreakTimeDialog(true)}
        breakTimeEnabled={breakTimeConfig.enabled}
        appointments={appointments}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {viewMode === "day" ? (
            <DayView
              date={currentDate}
              appointments={appointments}
              offices={offices}
              blocks={allBlocks}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
              onAppointmentDrop={handleAppointmentDrop}
              onUnblock={handleUnblock}
            />
          ) : (
            <WeekView
              currentDate={currentDate}
              appointments={appointments}
              offices={offices}
              blocks={allBlocks}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
        </div>

        {/* Appointment detail sidebar */}
        {selectedAppointment && (
          <AppointmentSidebar
            appointment={selectedAppointment}
            onClose={handleCloseSidebar}
            onUpdate={handleSaved}
            onReschedule={() => setShowReschedule(true)}
            doctors={doctors}
            services={services}
            lookupOrigins={lookupOrigins}
            lookupPayments={lookupPayments}
            lookupResponsibles={lookupResponsibles}
          />
        )}
      </div>

      {/* New appointment modal */}
      {showForm && (
        <AppointmentFormModal
          defaults={formDefaults}
          offices={offices}
          doctors={doctors}
          services={services}
          doctorServices={doctorServices}
          doctorSchedules={doctorSchedules}
          lookupOrigins={lookupOrigins}
          lookupPayments={lookupPayments}
          lookupResponsibles={lookupResponsibles}
          existingAppointments={appointments}
          onClose={handleFormClose}
          onSaved={handleSaved}
        />
      )}

      {/* Reschedule modal */}
      {showReschedule && selectedAppointment && (
        <RescheduleModal
          appointment={selectedAppointment}
          offices={offices}
          doctors={doctors}
          existingAppointments={appointments}
          onClose={() => setShowReschedule(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Block dialog */}
      {showBlockDialog && (
        <BlockDialog
          defaultDate={blockDialogDefaultDate}
          offices={offices}
          onClose={() => setShowBlockDialog(false)}
          onSaved={() => {
            setShowBlockDialog(false);
            fetchBlocks();
          }}
        />
      )}

      {/* Break time dialog */}
      {showBreakTimeDialog && (
        <BreakTimeDialog
          onClose={() => setShowBreakTimeDialog(false)}
          onSaved={(config) => {
            setBreakTimeConfig(config);
            setShowBreakTimeDialog(false);
            toast.success(
              config.enabled ? "Break Time activado" : "Break Time desactivado"
            );
          }}
        />
      )}
    </div>
  );
}
