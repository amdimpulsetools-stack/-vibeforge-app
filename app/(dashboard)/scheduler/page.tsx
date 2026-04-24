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
  ScheduleBlock,
} from "@/types/admin";
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import { useOrgRole } from "@/hooks/use-org-role";
import { useSchedulerMasterData } from "@/hooks/use-scheduler-master-data";
import { SchedulerHeader } from "./scheduler-header";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import {
  loadBreakTimeConfig,
  DEFAULT_BREAK_TIME_CONFIG,
  type BreakTimeConfig,
} from "./break-time-dialog";
import { loadOfficeFilter, saveOfficeFilter, loadSchedulerConfig } from "@/lib/scheduler-config";

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
const AvailableSlotsModal = dynamic(
  () => import("./available-slots-modal").then((m) => ({ default: m.AvailableSlotsModal })),
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
  const { isOwner } = useOrgRole();
  const schedulerConfig = useMemo(() => loadSchedulerConfig(), []);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);

  // ── Master data (cached via React Query — survives page navigations) ──
  const { data: masterData, isLoading: loadingMaster } = useSchedulerMasterData(organizationId);
  const offices = masterData?.offices ?? [];
  const doctors = masterData?.doctors ?? [];
  const services = masterData?.services ?? [];
  const doctorServices = masterData?.doctorServices ?? [];
  const doctorSchedules = masterData?.doctorSchedules ?? [];
  const lookupOrigins = masterData?.lookupOrigins ?? [];
  const lookupPayments = masterData?.lookupPayments ?? [];
  const lookupResponsibles = masterData?.lookupResponsibles ?? [];
  const loading = loadingMaster || loadingAppts;

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

  // Share available slots (lazy-loaded — data fetched only when opened)
  const [showAvailableSlots, setShowAvailableSlots] = useState(false);

  // Office filter
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([]);

  // Initialize office filter when master data loads
  useEffect(() => {
    if (offices.length === 0) return;
    setSelectedOfficeIds((prev) => {
      if (prev.length > 0) return prev; // already initialized
      const saved = loadOfficeFilter();
      if (saved && saved.length > 0) {
        const validIds = saved.filter((id) => offices.some((o) => o.id === id));
        return validIds.length > 0 ? validIds : offices.map((o) => o.id);
      }
      return offices.map((o) => o.id);
    });
  }, [offices]);

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

    // 1. Fetch appointments for the visible date range.
    // PERF: explicit column list instead of `select("*", ...)` — the scheduler
    // only reads ~20 fields per row, not the full 40+. Saves ~50% network
    // transfer and JSON parse time at 500+ appointments/day.
    const apptRes = await supabase
      .from("appointments")
      .select("id, patient_id, patient_name, patient_phone, doctor_id, office_id, service_id, appointment_date, start_time, end_time, status, origin, payment_method, responsible, responsible_user_id, notes, meeting_url, price_snapshot, discount_amount, discount_reason, discount_code_id, treatment_session_id, organization_id, created_at, updated_at, edited_at, edited_by_name, doctors(id, full_name, color, default_meeting_url), offices(id, name), services(id, name, duration_minutes, base_price), patients(is_recurring)")
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .neq("status", "cancelled")
      .order("start_time");

    // Supabase types the joined relations as arrays when an explicit column
    // list is used; at runtime they are single objects for to-one FKs. Cast
    // through unknown is the standard escape hatch for this mismatch.
    const appts = (apptRes.data as unknown as AppointmentWithRelations[]) ?? [];
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

    setLoadingAppts(false);
  }, [getDateRange]);

  // Fetch schedule blocks
  const fetchBlocks = useCallback(async () => {
    const supabase = createClient();
    const { startDate, endDate } = getDateRange();

    const { data } = await supabase
      .from("schedule_blocks")
      .select("id, block_date, start_time, end_time, office_id, all_day, reason, organization_id, created_at")
      .gte("block_date", startDate)
      .lte("block_date", endDate);

    setBlocks((data as ScheduleBlock[]) ?? []);
  }, [getDateRange]);

  useEffect(() => {
    fetchAppointments();
    fetchBlocks();
  }, [fetchAppointments, fetchBlocks]);

  // Office filter handler
  const handleOfficeFilterChange = useCallback((officeIds: string[]) => {
    setSelectedOfficeIds(officeIds);
    // Persist: save null when all are selected (= no filter)
    if (officeIds.length === offices.length) {
      saveOfficeFilter(null);
    } else {
      saveOfficeFilter(officeIds);
    }
  }, [offices.length]);

  // Filtered offices for the grid
  const filteredOffices = useMemo(
    () => offices.filter((o) => selectedOfficeIds.includes(o.id)),
    [offices, selectedOfficeIds]
  );

  // Handlers — wrapped in useCallback to prevent child re-renders
  const handleSlotClick = useCallback((date: Date, time: string, officeId: string) => {
    setFormDefaults({
      date: format(date, "yyyy-MM-dd"),
      startTime: time,
      officeId,
    });
    setShowForm(true);
    setSelectedAppointment(null);
  }, []);

  const handleAppointmentClick = useCallback((appointment: AppointmentWithRelations) => {
    // Doctors cannot view sidebar details of other doctors' appointments
    if (isDoctor && currentDoctorId && appointment.doctor_id !== currentDoctorId) {
      return;
    }
    setSelectedAppointment(appointment);
    setShowForm(false);
  }, [isDoctor, currentDoctorId]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedAppointment(null);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setFormDefaults(null);
  }, []);

  const handleSaved = useCallback(() => {
    fetchAppointments();
    setShowForm(false);
    setFormDefaults(null);
    setSelectedAppointment(null);
    setShowReschedule(false);
  }, [fetchAppointments]);

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
    <div className="flex h-[calc(100vh-7rem)] md:gap-4">
      {/* Left column: header + calendar */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card min-w-0">
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
          onShareAvailableSlots={
            doctors.length > 0 ? () => setShowAvailableSlots(true) : undefined
          }
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
          blocks={allBlocks}
          scheduleStartHour={schedulerConfig.startHour}
          scheduleEndHour={schedulerConfig.endHour}
          organizationId={organizationId ?? ""}
          organizationName={organization?.name ?? ""}
          organizationAddress={organization?.address || ""}
          currentDoctorId={(isDoctor || (isOwner && currentDoctorId)) ? currentDoctorId : null}
          restrictToDoctor={isDoctor && !isOwner}
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
          organizationId={organizationId ?? ""}
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

      {/* Share available slots modal — lazy-loaded and data fetched on open */}
      {showAvailableSlots && (
        <AvailableSlotsModal
          open={showAvailableSlots}
          onClose={() => setShowAvailableSlots(false)}
          doctors={doctors}
          initialDoctorId={isDoctor ? currentDoctorId : null}
        />
      )}
    </div>
  );
}
