"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { format, addDays, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
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
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import { SchedulerHeader } from "./scheduler-header";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import {
  loadBreakTimeConfig,
  DEFAULT_BREAK_TIME_CONFIG,
  type BreakTimeConfig,
} from "./break-time-dialog";
import { loadOfficeFilter, saveOfficeFilter } from "@/lib/scheduler-config";

// Lazy-load heavy modal/sidebar components (only downloaded when opened)
const ModalLoader = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <Loader2 className="h-6 w-6 animate-spin text-white" />
  </div>
);

const AppointmentSidebar = dynamic(
  () => import("./appointment-sidebar").then((m) => ({ default: m.AppointmentSidebar })),
  { loading: ModalLoader }
);
const AppointmentFormModal = dynamic(
  () => import("./appointment-form-modal").then((m) => ({ default: m.AppointmentFormModal })),
  { loading: ModalLoader }
);
const RescheduleModal = dynamic(
  () => import("./reschedule-modal").then((m) => ({ default: m.RescheduleModal })),
  { loading: ModalLoader }
);
const BlockDialog = dynamic(
  () => import("./block-dialog").then((m) => ({ default: m.BlockDialog })),
  { loading: ModalLoader }
);
const BreakTimeDialog = dynamic(
  () => import("./break-time-dialog").then((m) => ({ default: m.BreakTimeDialog })),
  { loading: ModalLoader }
);

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
      const dateStr = format(cursor, "yyyy-MM-dd");
      result.push({
        id: `bt-${dateStr}`,
        block_date: dateStr,
        start_time: config.startTime,
        end_time: config.endTime,
        office_id: null,
        all_day: false,
        reason: "__break_time__",
        organization_id: "",
        created_at: "",
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export default function SchedulerPage() {
  const { t } = useLanguage();
  const { organizationId, organization } = useOrganization();
  const { doctorId: currentDoctorId, isDoctor } = useCurrentDoctor();
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
  const [lookupResponsibles, setLookupResponsibles] = useState<{ id: string; label: string }[]>([]);
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

  // Office filter
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([]);

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
        receptionistMembersRes,
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
          .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
          .order("display_order"),
        supabase
          .from("lookup_values")
          .select("*, lookup_categories!inner(slug)")
          .eq("lookup_categories.slug", "payment_method")
          .eq("is_active", true)
          .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
          .order("display_order"),
        // Fetch receptionist members with profile in one query (avoids extra round trip)
        supabase
          .from("organization_members")
          .select("id, user_id, role, user_profiles(full_name, email)")
          .eq("role", "receptionist"),
      ]);

      const fetchedOffices = officesRes.data ?? [];
      setOffices(fetchedOffices);

      // Initialize office filter: use saved selection or default to all
      const saved = loadOfficeFilter();
      if (saved && saved.length > 0) {
        // Only keep IDs that still exist in the fetched offices
        const validIds = saved.filter((id) => fetchedOffices.some((o) => o.id === id));
        setSelectedOfficeIds(validIds.length > 0 ? validIds : fetchedOffices.map((o) => o.id));
      } else {
        setSelectedOfficeIds(fetchedOffices.map((o) => o.id));
      }
      setDoctors(doctorsRes.data ?? []);
      setServices(servicesRes.data ?? []);
      setDoctorServices((doctorServicesRes.data as { doctor_id: string; service_id: string }[]) ?? []);
      setDoctorSchedules((doctorSchedulesRes.data as Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time">[]) ?? []);
      setLookupOrigins((originsRes.data as LookupValue[]) ?? []);
      setLookupPayments((paymentsRes.data as LookupValue[]) ?? []);

      // Build responsibles list from receptionist members (profile joined above)
      const receptionists = receptionistMembersRes.data ?? [];
      setLookupResponsibles(
        receptionists.map((m) => {
          const profile = (m as unknown as { user_profiles: { full_name: string | null; email: string | null } | null }).user_profiles;
          return {
            id: m.id,
            label: profile?.full_name || profile?.email || "Recepcionista",
          };
        })
      );
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

  // Payment totals per appointment (for visual indicators)
  const [paymentTotals, setPaymentTotals] = useState<Record<string, number>>({});

  // Fetch appointments + their payments (filtered by date range)
  const fetchAppointments = useCallback(async () => {
    const supabase = createClient();
    const { startDate, endDate } = getDateRange();

    // 1. Fetch appointments for the visible date range
    const apptRes = await supabase
      .from("appointments")
      .select("*, doctors(id,full_name,color,default_meeting_url), offices(id,name), services(id,name,duration_minutes,base_price)")
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .neq("status", "cancelled")
      .order("start_time");

    const appts = (apptRes.data as AppointmentWithRelations[]) ?? [];
    setAppointments(appts);

    // 2. Fetch payments ONLY for the visible appointments (not all payments in history)
    const apptIds = appts.map((a) => a.id);
    const totals: Record<string, number> = {};

    if (apptIds.length > 0) {
      const payRes = await supabase
        .from("patient_payments")
        .select("appointment_id, amount")
        .in("appointment_id", apptIds);

      for (const p of payRes.data ?? []) {
        if (p.appointment_id) {
          totals[p.appointment_id] = (totals[p.appointment_id] ?? 0) + Number(p.amount);
        }
      }
    }
    setPaymentTotals(totals);

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

  // Office filter handler
  const handleOfficeFilterChange = (officeIds: string[]) => {
    setSelectedOfficeIds(officeIds);
    // Persist: save null when all are selected (= no filter)
    if (officeIds.length === offices.length) {
      saveOfficeFilter(null);
    } else {
      saveOfficeFilter(officeIds);
    }
  };

  // Filtered offices for the grid
  const filteredOffices = offices.filter((o) => selectedOfficeIds.includes(o.id));

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
    // Doctors cannot view sidebar details of other doctors' appointments
    if (isDoctor && currentDoctorId && appointment.doctor_id !== currentDoctorId) {
      return;
    }
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

    // Doctors cannot move other doctors' appointments
    if (isDoctor && currentDoctorId && appt.doctor_id !== currentDoctorId) {
      toast.error("No puedes mover citas de otros doctores");
      return;
    }

    // Compute new end time preserving duration
    const [sh, sm] = appt.start_time.slice(0, 5).split(":").map(Number);
    const [eh, em] = appt.end_time.slice(0, 5).split(":").map(Number);
    const duration = (eh * 60 + em) - (sh * 60 + sm);
    const [nh, nm] = targetTime.split(":").map(Number);
    const newEndMin = nh * 60 + nm + duration;
    const newEndTime = `${Math.floor(newEndMin / 60).toString().padStart(2, "0")}:${(newEndMin % 60).toString().padStart(2, "0")}`;
    const newDateStr = format(targetDate, "yyyy-MM-dd");

    // Check schedule blocks & break time
    const blockHit = allBlocks.find((b) => {
      if (b.block_date !== newDateStr) return false;
      if (b.office_id && b.office_id !== targetOfficeId) return false;
      if (b.all_day) return true;
      const bStart = b.start_time?.slice(0, 5) ?? "00:00";
      const bEnd = b.end_time?.slice(0, 5) ?? "23:59";
      return targetTime < bEnd && newEndTime > bStart;
    });
    if (blockHit) {
      const isBreak = blockHit.reason === "__break_time__";
      toast.error(isBreak ? "No se puede mover: horario de Break Time" : `Horario bloqueado: ${blockHit.reason ?? "Bloqueado"}`);
      return;
    }

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
  const allBlocks = useMemo(
    () => [...blocks, ...generateBreakTimeBlocks(breakTimeConfig, rangeStart, rangeEnd)],
    [blocks, breakTimeConfig, rangeStart, rangeEnd]
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      {/* Left column: header + calendar */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
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
          offices={offices}
          selectedOfficeIds={selectedOfficeIds}
          onOfficeFilterChange={handleOfficeFilterChange}
        />

        <div className="flex-1 overflow-auto">
          {viewMode === "day" ? (
            <DayView
              date={currentDate}
              appointments={appointments}
              offices={filteredOffices}
              blocks={allBlocks}
              paymentTotals={paymentTotals}
              selectedAppointmentId={selectedAppointment?.id}
              currentDoctorId={isDoctor ? currentDoctorId : null}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
              onAppointmentDrop={handleAppointmentDrop}
              onUnblock={handleUnblock}
            />
          ) : (
            <WeekView
              currentDate={currentDate}
              appointments={appointments}
              offices={filteredOffices}
              blocks={allBlocks}
              paymentTotals={paymentTotals}
              selectedAppointmentId={selectedAppointment?.id}
              currentDoctorId={isDoctor ? currentDoctorId : null}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
            />
          )}
        </div>
      </div>

      {/* Appointment detail sidebar — full page height */}
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
          readOnly={isDoctor && currentDoctorId !== null && selectedAppointment.doctor_id !== currentDoctorId}
        />
      )}

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
          organizationId={organizationId}
          organizationName={organization?.name ?? ""}
          organizationAddress={organization?.address || ""}
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
          blocks={allBlocks}
          onClose={() => setShowReschedule(false)}
          onSaved={handleSaved}
        />
      )}

      {/* Block dialog */}
      {showBlockDialog && (
        <BlockDialog
          defaultDate={blockDialogDefaultDate}
          offices={offices}
          organizationId={organizationId}
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
