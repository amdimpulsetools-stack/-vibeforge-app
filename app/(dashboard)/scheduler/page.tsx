"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { syncAppointmentToGoogle } from "@/lib/google-calendar-client";
import { sendNotification } from "@/lib/send-notification";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { format, addDays, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { Loader2, CalendarPlus, ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type {
  AppointmentWithRelations,
  ScheduleBlock,
} from "@/types/admin";
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import { useIsFertilityAdvisor } from "@/hooks/use-is-fertility-advisor";
import { useOrgRole } from "@/hooks/use-org-role";
import { useSchedulerMasterData } from "@/hooks/use-scheduler-master-data";
import { SchedulerHeader } from "./scheduler-header";
import { DayView } from "./day-view";
import { DropConfirmDialog, type PendingDrop } from "./drop-confirm-dialog";
import { WeekView } from "./week-view";
import { NowProvider } from "./now-provider";
// Solo se renderiza al copiar un mensaje de WhatsApp — fuera del First Load.
const WhatsAppClipboardModal = dynamic(
  () =>
    import("./whatsapp-clipboard-modal").then((m) => m.WhatsAppClipboardModal),
  { ssr: false }
);
import type { AppointmentVariables } from "@/lib/whatsapp-clipboard-config";
import {
  loadBreakTimeConfig,
  DEFAULT_BREAK_TIME_CONFIG,
  type BreakTimeConfig,
} from "./break-time-dialog";
import { loadOfficeFilter, saveOfficeFilter, loadSchedulerConfig, fetchSchedulerConfig, getScheduleStartMinutes, getScheduleEndMinutes } from "@/lib/scheduler-config";

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
  const { isOwner, isAdmin, isReceptionist } = useOrgRole();
  // Asesoras de fertilidad (obstetras coordinadoras) operan la agenda
  // como recepción: agendan y gestionan citas de cualquier doctor,
  // aunque su rol base sea `doctor`. Relaja los "solo mis citas".
  const { isAdvisor } = useIsFertilityAdvisor();
  const restrictedDoctor = isDoctor && !isAdvisor;
  // Config de agenda para los MODALES (ventana, campos requeridos): misma
  // query key que day/week-view — pinta al instante desde localStorage y
  // sincroniza con la BD. Antes era un useMemo([]) solo-localStorage: si la
  // caché del navegador traía una apertura vieja, el aviso de "fuera del
  // horario" comparaba contra otra ventana que la que la grilla dibujaba.
  const { data: schedulerConfig = loadSchedulerConfig() } = useQuery({
    // org en la key: sin ella, un usuario multi-org (founder en la org de
    // un cliente) leía la config de OTRA org vía el limit(1) del API.
    queryKey: ["scheduler-config", organizationId],
    queryFn: () => fetchSchedulerConfig(organizationId),
    placeholderData: () => loadSchedulerConfig(),
    enabled: !!organizationId,
  });
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [totalApptCount, setTotalApptCount] = useState<number | null>(null);

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

  // Sidebar & form state
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithRelations | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formDefaults, setFormDefaults] = useState<{
    date?: string;
    startTime?: string;
    officeId?: string;
  } | null>(null);

  // WhatsApp clipboard modal — controlado en el padre para evitar conflicto de
  // focus trap con el Radix Dialog del form (cuando el modal interno renderizaba
  // arriba del form sin cerrar el Dialog primero, los botones quedaban
  // freezeados y solo el click fuera funcionaba).
  const [waModal, setWaModal] = useState<{
    open: boolean;
    variables: AppointmentVariables | null;
    phone: string | null;
  }>({
    open: false,
    variables: null,
    phone: null,
  });

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

  // ── Citas + bloqueos sobre React Query ───────────────────────────────
  // Key = rango visible: navegar a un día/semana ya visitada dentro del
  // staleTime (5 min) pinta desde caché sin query. `placeholderData` mantiene
  // el rango anterior en pantalla mientras baja el nuevo — exactamente el
  // comportamiento que ya tenía la agenda (no vaciaba la grilla al navegar).
  // Las mutaciones invalidan el prefijo y el poll de live-status escribe
  // directamente en la caché vía setQueryData.
  const { startDate: rangeStartKey, endDate: rangeEndKey } = getDateRange();

  const { data: apptsData, isPending: apptsPending } = useQuery({
    queryKey: ["scheduler", "appts", organizationId, rangeStartKey, rangeEndKey],
    enabled: !!organizationId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const supabase = createClient();
      // PERF: explicit column list instead of `select("*", ...)` — the
      // scheduler only reads ~20 fields per row, not the full 40+. Saves
      // ~50% network transfer and JSON parse time at 500+ appointments/day.
      // Los montos de pagos vienen embebidos en el mismo select vía la FK
      // anidada (respaldada por idx_patient_payments_appt_amt, mig 103).
      const apptRes = await supabase
        .from("appointments")
        .select("id, patient_id, patient_name, patient_phone, doctor_id, office_id, service_id, appointment_date, start_time, end_time, status, origin, payment_method, responsible, responsible_user_id, notes, meeting_url, price_snapshot, discount_amount, discount_reason, discount_code_id, treatment_session_id, einvoice_id, organization_id, created_at, updated_at, edited_at, edited_by_name, arrived_at, consultation_started_at, consultation_ended_at, doctors(id, full_name, color, default_meeting_url), offices(id, name), services(id, name, duration_minutes, base_price), patients(is_recurring, dni, birth_date), patient_payments(amount)")
        .gte("appointment_date", rangeStartKey)
        .lte("appointment_date", rangeEndKey)
        .neq("status", "cancelled")
        .order("start_time");

      // Supabase types the joined relations as arrays when an explicit column
      // list is used; at runtime they are single objects for to-one FKs. Cast
      // through unknown is the standard escape hatch for this mismatch.
      return (apptRes.data as unknown as AppointmentWithRelations[]) ?? [];
    },
  });
  const appointments = apptsData ?? [];

  // Payment totals per appointment (for visual indicators) — derivado del
  // embed patient_payments(amount) del mismo select.
  const paymentTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const a of appointments) {
      const payments = (a as unknown as { patient_payments?: { amount: number | string }[] | null })
        .patient_payments;
      if (!payments || payments.length === 0) continue;
      totals[a.id] = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    }
    return totals;
  }, [appointments]);

  const { data: blocksData } = useQuery({
    queryKey: ["scheduler", "blocks", organizationId, rangeStartKey, rangeEndKey],
    enabled: !!organizationId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data } = await createClient()
        .from("schedule_blocks")
        .select("id, block_date, start_time, end_time, office_id, all_day, reason, organization_id, created_at")
        .gte("block_date", rangeStartKey)
        .lte("block_date", rangeEndKey);
      return (data as ScheduleBlock[]) ?? [];
    },
  });
  const blocks = blocksData ?? [];

  // Mismos nombres que las antiguas funciones de fetch: ahora invalidan la
  // caché (el rango visible refetchea al instante; los demás, al volver).
  const fetchAppointments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["scheduler", "appts"] });
  }, [queryClient]);

  const fetchBlocks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["scheduler", "blocks"] });
  }, [queryClient]);

  const loading = loadingMaster || apptsPending;

  // ── Live status lean poll (Part E) ────────────────────────────────
  // Every 30 s, fetch ONLY the live-status columns for the visible
  // date range (~5 KB vs the 100+ KB full join) and merge them into
  // the existing appointments state. State is only replaced when at
  // least one row actually changed (compared via updated_at), so the
  // memoized cards skip repainting on no-op polls. Paused while the
  // tab is hidden and gated on the org's master toggle.
  const liveStatusEnabled = schedulerConfig.liveStatus;
  useEffect(() => {
    if (!liveStatusEnabled) return;
    let cancelled = false;

    const poll = async () => {
      if (document.hidden || cancelled) return;
      const supabase = createClient();
      const { startDate, endDate } = getDateRange();
      const { data } = await supabase
        .from("appointments")
        .select(
          "id, status, arrived_at, consultation_started_at, consultation_ended_at, updated_at",
        )
        .gte("appointment_date", startDate)
        .lte("appointment_date", endDate)
        .neq("status", "cancelled");
      if (cancelled || !data) return;

      const byId = new Map(
        data.map((r) => [r.id as string, r] as const),
      );
      // Merge directo en la caché de React Query del rango visible — los
      // consumidores re-renderizan solo si alguna fila cambió de verdad.
      queryClient.setQueryData<AppointmentWithRelations[]>(
        ["scheduler", "appts", organizationId, startDate, endDate],
        (prev) => {
          if (!prev) return prev;
          let changed = false;
          const next = prev.map((a) => {
            const fresh = byId.get(a.id);
            if (!fresh || fresh.updated_at === a.updated_at) return a;
            changed = true;
            return {
              ...a,
              // `status` viaja junto a los timestamps a propósito. El merge
              // avanza `updated_at`, así que cualquier campo que se traiga
              // aquí a medias queda enmascarado para siempre: el siguiente
              // sondeo ve las marcas de tiempo iguales y descarta la fila. Sin
              // esto, un "completado" o "confirmado" hecho por otra persona no
              // se veía nunca — ni siquiera al cabo de una hora.
              status: fresh.status,
              arrived_at: fresh.arrived_at,
              consultation_started_at: fresh.consultation_started_at,
              consultation_ended_at: fresh.consultation_ended_at,
              updated_at: fresh.updated_at,
            };
          });
          return changed ? next : prev;
        },
      );
    };

    const interval = setInterval(() => void poll(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [liveStatusEnabled, getDateRange, queryClient, organizationId]);

  // Lightweight org-wide appointments count — used only to decide whether to
  // show the first-time empty state.
  //
  // PERF: el COUNT exact recorre TODAS las citas históricas de la org y solo
  // sirve para un empty-state que además exige `isAdmin && services.length
  // === 0`. Se dispara únicamente cuando esas condiciones ya se cumplen: una
  // clínica con catálogo configurado (el 99% de las cargas) deja de pagar la
  // query. El empty-state se pinta exactamente igual en el caso que sí
  // aplica.
  const needsEmptyStateCount =
    !!organizationId && isAdmin && !loadingMaster && services.length === 0;

  useEffect(() => {
    if (!needsEmptyStateCount) return;
    const supabase = createClient();
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => setTotalApptCount(count ?? 0));
  }, [needsEmptyStateCount]);

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
  // Nueva cita — compartido por el botón del header (md+) y el FAB móvil.
  const handleNewAppointment = useCallback(() => {
    setFormDefaults({ date: format(currentDate, "yyyy-MM-dd") });
    setShowForm(true);
  }, [currentDate]);

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
    // (fertility advisors are exempt — they assist any doctor).
    if (restrictedDoctor && currentDoctorId && appointment.doctor_id !== currentDoctorId) {
      return;
    }
    setSelectedAppointment(appointment);
    setShowForm(false);
  }, [restrictedDoctor, currentDoctorId]);

  const handleCloseSidebar = useCallback(() => {
    setSelectedAppointment(null);
  }, []);

  const handleFormClose = useCallback(() => {
    setShowForm(false);
    setFormDefaults(null);
  }, []);

  // Drop pendiente de confirmación (drag & drop de la agenda). Guarda
  // también lo que el diálogo no muestra pero el update necesita.
  const [pendingDrop, setPendingDrop] = useState<
    (PendingDrop & { newEndTime: string; targetOfficeId: string }) | null
  >(null);

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
    // (fertility advisors are exempt — they assist any doctor).
    if (restrictedDoctor && currentDoctorId && appt.doctor_id !== currentDoctorId) {
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

    // Validaciones superadas → confirmar antes de tocar la cita real.
    // Soltar ya no reprograma al instante: un arrastre accidental movía la
    // cita sin preguntar, y de paso los dos caminos se contradecían (el
    // modal Reprogramar siempre notificaba al paciente; el drag nunca).
    const noChange =
      appt.appointment_date === newDateStr &&
      appt.start_time.slice(0, 5) === targetTime &&
      appt.office_id === targetOfficeId;
    if (noChange) return;

    setPendingDrop({
      appointmentId,
      patientName: appt.patient_name,
      serviceName: appt.services?.name ?? null,
      fromDate: appt.appointment_date,
      fromTime: appt.start_time.slice(0, 5),
      fromOfficeName: offices.find((o) => o.id === appt.office_id)?.name ?? null,
      toDate: newDateStr,
      toTime: targetTime,
      toOfficeName: offices.find((o) => o.id === targetOfficeId)?.name ?? null,
      newEndTime,
      targetOfficeId,
    });
  };

  const confirmPendingDrop = async (notifyPatient: boolean) => {
    if (!pendingDrop) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_date: pendingDrop.toDate,
        start_time: pendingDrop.toTime,
        end_time: pendingDrop.newEndTime,
        office_id: pendingDrop.targetOfficeId,
      })
      .eq("id", pendingDrop.appointmentId);

    if (error) {
      toast.error("No pudimos mover la cita. " + error.message);
      setPendingDrop(null);
      return;
    }

    // Mirror move to Google Calendar (best-effort).
    syncAppointmentToGoogle(pendingDrop.appointmentId, "upsert");

    // Mismo evento que usa el modal Reprogramar — ahora opt-in explícito.
    if (notifyPatient) {
      sendNotification({
        type: "appointment_rescheduled",
        appointment_id: pendingDrop.appointmentId,
      });
    }

    toast.success(`Cita movida a ${pendingDrop.toDate} ${pendingDrop.toTime}`);
    setPendingDrop(null);
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

  // First-time empty state: 0 services AND 0 total appointments AND admin.
  // Doctors/recepcionistas no lo ven — solo el owner/admin que aún no
  // configuró el catálogo de servicios. Si hay servicios pero 0 citas, la
  // grid normal ya alcanza para que el user agende su primera cita.
  const showFirstTimeEmpty =
    isAdmin &&
    !loadingMaster &&
    services.length === 0 &&
    totalApptCount === 0;

  // ¿Hay algún panel/modal del scheduler encima? Con cualquiera abierto el
  // FAB de "Nueva cita" se oculta (mismo criterio que el FAB del IA, que
  // queda debajo de su panel z-50).
  const schedulerOverlayOpen =
    selectedAppointment !== null ||
    showForm ||
    showReschedule ||
    showBlockDialog ||
    showBreakTimeDialog ||
    showAvailableSlots ||
    waModal.open ||
    pendingDrop !== null;

  // Measure the scrollable grid container so DayView/WeekView can stretch
  // rows to fill the viewport on short schedules (e.g. 7am–2pm) instead of
  // leaving a blank gap. Long schedules keep scrolling as before. Declared
  // before the early-return below per the rules of hooks.
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const [gridContainerHeight, setGridContainerHeight] = useState(0);
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setGridContainerHeight(e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (showFirstTimeEmpty) {
    return <EmptyStateScheduler />;
  }

  return (
    /* Móvil: dvh (100vh en iOS incluye la barra de URL colapsable y el
       borde inferior del card quedaba tapado) y resta calibrada al padding
       real de <md (topbar 4rem + p-4 ×2 = 6rem). Desktop sin cambios. */
    <div className="flex h-[calc(100dvh-6rem)] md:h-[calc(100vh-7rem)] md:gap-4">
      {/* Left column: header + calendar */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card min-w-0">
        <SchedulerHeader
          currentDate={currentDate}
          viewMode={viewMode}
          onDateChange={setCurrentDate}
          onViewModeChange={setViewMode}
          onNewAppointment={handleNewAppointment}
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

        <div ref={gridScrollRef} className="flex-1 overflow-auto">
          {/* NowProvider: single per-minute ticker shared by the views.
              Memoized AppointmentCards don't re-render on the tick —
              only components calling useNow() do. */}
          <NowProvider>
            {viewMode === "day" ? (
              <DayView
                date={currentDate}
                appointments={appointments}
                offices={filteredOffices}
                blocks={allBlocks}
                paymentTotals={paymentTotals}
                selectedAppointmentId={selectedAppointment?.id}
                currentDoctorId={restrictedDoctor ? currentDoctorId : null}
                onSlotClick={handleSlotClick}
                onAppointmentClick={handleAppointmentClick}
                onAppointmentDrop={handleAppointmentDrop}
                onUnblock={handleUnblock}
                containerHeight={gridContainerHeight}
                // Finalizar: owner/admin/doctor siempre; recepción según el
                // toggle por-org (mig 227). Reabrir: nunca recepción.
                canEnd={
                  isOwner ||
                  isAdmin ||
                  isDoctor ||
                  (isReceptionist && schedulerConfig.liveStatusReceptionCanEnd)
                }
                canReopen={isOwner || isAdmin || isDoctor}
                onLiveChanged={fetchAppointments}
              />
            ) : (
              <WeekView
                currentDate={currentDate}
                appointments={appointments}
                offices={filteredOffices}
                blocks={allBlocks}
                paymentTotals={paymentTotals}
                selectedAppointmentId={selectedAppointment?.id}
                currentDoctorId={restrictedDoctor ? currentDoctorId : null}
                onSlotClick={handleSlotClick}
                onAppointmentClick={handleAppointmentClick}
                containerHeight={gridContainerHeight}
              />
            )}
          </NowProvider>
        </div>
      </div>

      {/* Confirmación del drag & drop — Cancelar deja la cita donde estaba
          (la tarjeta nunca se movió de verdad: el update ocurre al confirmar). */}
      {pendingDrop && (
        <DropConfirmDialog
          pending={pendingDrop}
          onConfirm={confirmPendingDrop}
          onCancel={() => setPendingDrop(null)}
        />
      )}

      {/* FAB "Nueva cita" — solo <md y solo en la agenda. Se apila JUSTO
          encima del FAB del asistente IA (components/ai-assistant-panel.tsx:
          `bottom: calc(1.5rem + safe-area)`, `right-6`, 3.25 rem de lado), así
          que va a 1.5 + 3.25 + 0.75 (gap) = 5.5 rem sobre la misma safe-area y
          con el mismo tamaño para que ambos queden centrados en la columna.
          z-40 igual que el del IA: los paneles/modales (z-50) lo tapan.
          Además se desmonta mientras hay un panel o modal del scheduler
          abierto, para no estorbar sobre sus acciones. */}
      {!schedulerOverlayOpen && (
        <button
          type="button"
          onClick={handleNewAppointment}
          aria-label="Nueva cita"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-6 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95 md:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

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
          readOnly={restrictedDoctor && currentDoctorId !== null && selectedAppointment.doctor_id !== currentDoctorId}
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
          scheduleStartMinutes={getScheduleStartMinutes(schedulerConfig)}
          scheduleEndMinutes={getScheduleEndMinutes(schedulerConfig)}
          requiredFields={schedulerConfig.requiredFields ?? {}}
          allowCustomDuration={schedulerConfig.allowCustomDuration ?? false}
          organizationId={organizationId ?? ""}
          organizationName={organization?.name ?? ""}
          organizationAddress={organization?.address || ""}
          currentDoctorId={(isDoctor || (isOwner && currentDoctorId)) ? currentDoctorId : null}
          restrictToDoctor={restrictedDoctor && !isOwner}
          onClose={handleFormClose}
          onSaved={handleSaved}
          onShowWhatsAppFollowup={(variables, phone) =>
            setWaModal({ open: true, variables, phone: phone ?? null })
          }
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
          scheduleStartMinutes={getScheduleStartMinutes(schedulerConfig)}
          scheduleEndMinutes={getScheduleEndMinutes(schedulerConfig)}
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
          scheduleStartMinutes={getScheduleStartMinutes(schedulerConfig)}
          scheduleEndMinutes={getScheduleEndMinutes(schedulerConfig)}
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

      {/* WhatsApp clipboard modal — montado a nivel page (no dentro del form
          modal) para que cuando aparezca, el Radix Dialog del form ya esté
          desmontado y no bloquee los clicks por focus trap. */}
      {waModal.variables && (
        <WhatsAppClipboardModal
          open={waModal.open}
          variables={waModal.variables}
          phone={waModal.phone}
          onClose={() => setWaModal({ open: false, variables: null, phone: null })}
        />
      )}
    </div>
  );
}

function EmptyStateScheduler() {
  return (
    <div className="flex min-h-[calc(100dvh-6rem)] md:min-h-[calc(100vh-7rem)] items-center justify-center px-4">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <CalendarPlus className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Antes de agendar, configura tus servicios
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Para crear citas necesitas tener al menos un servicio definido
          (consultas, procedimientos, etc.). Configurá tu catálogo en menos de
          2 minutos.
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            href="/admin/services"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
          >
            Configurar servicios
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          ¿Ya tienes servicios pero el grid se ve vacío? Click en cualquier
          slot del horario para agendar tu primera cita.
        </p>
      </div>
    </div>
  );
}
