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
import {
  getLiveNotificationEvent,
  readLiveNotificationSettings,
  resolveAudiences,
} from "@/lib/live-notifications/catalog";
import { useCurrentDoctor } from "@/hooks/use-current-doctor";
import { useIsFertilityAdvisor } from "@/hooks/use-is-fertility-advisor";
import { useOrgRole } from "@/hooks/use-org-role";
import { useOrgToday } from "@/hooks/use-org-today";
import { useSchedulerMasterData } from "@/hooks/use-scheduler-master-data";
import { SchedulerHeader } from "./scheduler-header";
import {
  RESCHEDULE_MODE_PARAM,
  fetchReschedulePendingSummary,
} from "@/lib/followups/reschedule";
import {
  loadRescheduleContext,
  type RescheduleContext,
} from "@/lib/appointments/reschedule-context";
import { zonedNow } from "@/lib/org-time";
import { RescheduleBanner } from "./reschedule-banner";
import { DayView } from "./day-view";
import { DropConfirmDialog, type PendingDrop } from "./drop-confirm-dialog";
import { WeekView } from "./week-view";
import { NowProvider } from "./now-provider";
import {
  DataLoadError,
  PostgrestLoadError,
  useReportLoadError,
} from "./data-load-error";
import { PrereservaColorProvider } from "./prereserva-context";
import {
  fetchExpiredHolds,
  getHoldExpiresAt,
  holdColumnKnownMissing,
  isMissingColumnError,
  markHoldColumnSupport,
} from "@/lib/appointments/prereserva";
// Solo se renderiza al copiar un mensaje de WhatsApp — fuera del First Load.
const WhatsAppClipboardModal = dynamic(
  () =>
    import("./whatsapp-clipboard-modal").then((m) => m.WhatsAppClipboardModal),
  { ssr: false }
);
import type { AppointmentVariables } from "@/lib/whatsapp-clipboard-config";
import {
  loadOfficeFilter,
  saveOfficeFilter,
  loadSchedulerConfig,
  fetchSchedulerConfig,
  saveSchedulerConfigToDb,
  getScheduleStartMinutes,
  getScheduleEndMinutes,
  breakTimeBlocksInRange,
  DEFAULT_BREAK_TIME_CONFIG,
  type BreakTimeConfig,
} from "@/lib/scheduler-config";

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

export default function SchedulerPage() {
  const { t, language } = useLanguage();
  const loadErrorEn = language === "en";
  const { organizationId, organization } = useOrganization();
  const { doctorId: currentDoctorId, isDoctor } = useCurrentDoctor();
  const { isOwner, isAdmin, isReceptionist } = useOrgRole();
  // Asesoras de fertilidad (obstetras coordinadoras) operan la agenda
  // como recepción: agendan y gestionan citas de cualquier doctor,
  // aunque su rol base sea `doctor`. Relaja los "solo mis citas".
  const { isAdvisor } = useIsFertilityAdvisor();
  const restrictedDoctor = isDoctor && !isAdvisor;
  const { today: orgToday, timezone: orgTimezone } = useOrgToday();
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

  // ── "Receta asignada" en la tarjeta (spec §3.4 / §3.7) ────────────────
  // El interruptor de la función NO es un flag propio: ES la celda
  // "Recepción" del evento `prescription_issued` en la matriz de Ajustes →
  // Notificaciones (`organizations.settings.live_notifications`). Un solo
  // dato, cero migraciones, y ningún "lo activé y no pasa nada" (§5.5).
  //
  // COSTE CERO CUANDO ESTÁ APAGADO — que es el default del catálogo
  // (`defaultAudiences: []`): el JSONB ya viaja al cliente dentro del
  // `organizations(*)` que carga OrganizationProvider (organization-provider
  // .tsx:51), así que resolverlo no cuesta ninguna query nueva; y con `false`
  // el select de la agenda de abajo queda BYTE-IDÉNTICO al de siempre.
  //
  // El icono lo ve TODO el que mire la agenda (la doctora también verá que
  // esa cita tiene receta, y eso es correcto): la celda "recepción" es el
  // interruptor de la FUNCIÓN, no un filtro por rol — §3.7.
  const prescriptionSignalEnabled = useMemo(() => {
    const event = getLiveNotificationEvent("prescription_issued");
    if (!event) return false;
    const settings = readLiveNotificationSettings(
      (organization as { settings?: unknown } | null)?.settings
    );
    return resolveAudiences(event, settings).includes("reception");
  }, [organization]);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  // Deep-link `?date=YYYY-MM-DD` (dashboard de recepcionista, widget "Por
  // confirmar mañana"). Se lee de window.location en un effect de montaje —
  // no useSearchParams: evitaría prerender del árbol sin un Suspense
  // boundary, y leerlo en el initializer del useState causaría hydration
  // mismatch (el server no ve la query).
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const parsed = new Date(`${d}T12:00:00`);
      if (!Number.isNaN(parsed.getTime())) setCurrentDate(parsed);
    }
  }, []);
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
    doctorId?: string;
    patient?: {
      dni: string | null;
      first_name: string;
      last_name: string;
      phone: string | null;
    };
    /** Modo reprogramar (mig 273): cita cancelada que se vuelve a agendar. */
    reschedule?: RescheduleContext;
  } | null>(null);

  // Mig 273 — burbuja "N pacientes por reprogramar": pacientes distintas con
  // tarjeta abierta (una tarjeta por cita cancelada). El punto late solo si
  // hay a quién llamar hoy (no pospuestas a futuro). Es un recordatorio de
  // recepción: el doctor restringido no la ve (no agenda). staleTime corto +
  // refetchOnMount 'always': al volver de la bandeja (contactar, posponer,
  // cerrar) la cifra no queda desfasada; además handleSaved la invalida.
  const showReschedulePill = !restrictedDoctor;
  const { data: reschedulePending } = useQuery({
    queryKey: ["scheduler", "reschedule-pending", organizationId],
    enabled: !!organizationId && showReschedulePill,
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: () => fetchReschedulePendingSummary(createClient(), organizationId!),
  });

  // ── Modo reprogramar (mig 273) ─────────────────────────────────────
  // `/scheduler?reprogramar=<id de la cita CANCELADA>`: la agenda queda en un
  // modo donde tocar un horario libre abre "Nueva cita" con todo precargado
  // desde la cita cancelada. El parámetro se mantiene en la URL mientras dure
  // (recargar no lo pierde) y se quita al salir o al guardar. Se lee en un
  // effect de montaje, mismo criterio que `date` / `new`.
  const [rescheduleParamId, setRescheduleParamId] = useState<string | null>(null);
  const [rescheduleCtx, setRescheduleCtx] = useState<RescheduleContext | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(RESCHEDULE_MODE_PARAM);
    if (id) setRescheduleParamId(id);
  }, []);

  const exitRescheduleMode = useCallback(() => {
    setRescheduleCtx(null);
    setRescheduleParamId(null);
    const params = new URLSearchParams(window.location.search);
    if (params.has(RESCHEDULE_MODE_PARAM)) {
      params.delete(RESCHEDULE_MODE_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
  }, []);

  useEffect(() => {
    if (!rescheduleParamId || !organizationId) return;
    let cancelled = false;
    void loadRescheduleContext(createClient(), rescheduleParamId, organizationId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        toast.error(
          res.reason === "not_cancelled"
            ? "Esa cita ya no está cancelada: no hay nada que reprogramar."
            : res.reason === "not_found"
              ? "No encontramos la cita a reprogramar (puede ser de otra clínica o haber sido eliminada)."
              : "No pudimos cargar la cita a reprogramar."
        );
        exitRescheduleMode();
        return;
      }
      setRescheduleCtx(res.ctx);
      // Móvil: la semana es una lista sin horas ni consultorios → vista día.
      if (window.matchMedia("(max-width: 767px)").matches) setViewMode("day");
    });
    return () => {
      cancelled = true;
    };
  }, [rescheduleParamId, organizationId, exitRescheduleMode]);

  // "Agendar" desde Seguimientos: /scheduler?new=1&patient_id=…&doctor_id=…
  // abre "Nueva cita" con la paciente ya cargada. Se lee una vez al montar
  // (mismo criterio que `date`) y se limpia la URL para que recargar la
  // página no vuelva a abrir el formulario.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") return;
    const patientId = params.get("patient_id");
    const doctorId = params.get("doctor_id") ?? undefined;
    params.delete("new");
    params.delete("patient_id");
    params.delete("doctor_id");
    params.delete("patient_name");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);

    const open = (patient?: NonNullable<typeof formDefaults>["patient"]) => {
      setFormDefaults({ date: orgToday(), doctorId, patient });
      setShowForm(true);
    };
    if (!patientId) {
      open();
      return;
    }
    void createClient()
      .from("patients")
      .select("dni, first_name, last_name, phone")
      .eq("id", patientId)
      .maybeSingle()
      .then(({ data }) => {
        const p = data as { dni: string | null; first_name: string; last_name: string; phone: string | null } | null;
        open(p ?? undefined);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Break time (mig 254): config de la org, no del navegador. Sale de la
  // misma query que el resto de Configuración → Agenda.
  const [showBreakTimeDialog, setShowBreakTimeDialog] = useState(false);
  const breakTimeConfig: BreakTimeConfig = schedulerConfig.breakTime ?? DEFAULT_BREAK_TIME_CONFIG;

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

  // Si la cascada entera falla, el queryFn LANZA (antes devolvía [] y la
  // agenda se veía vacía sin ningún aviso — incidente PGRST201 de la mig
  // 273). Con el error en `error` (no como datos vacíos) la página muestra
  // el aviso con Reintentar y lo reporta a Sentry. `retry: 1`: un segundo
  // intento cubre un fallo de red puntual sin martillar (cada intento ya es
  // una cascada de hasta 8 selects). Con datos OK nada cambia.
  const {
    data: apptsData,
    isPending: apptsPending,
    error: apptsError,
    isError: apptsIsError,
    isFetching: apptsFetching,
    refetch: refetchAppts,
    isPlaceholderData: apptsIsPlaceholder,
  } = useQuery({
    queryKey: ["scheduler", "appts", organizationId, rangeStartKey, rangeEndKey],
    enabled: !!organizationId,
    placeholderData: (prev) => prev,
    retry: 1,
    queryFn: async () => {
      const supabase = createClient();
      // PERF: explicit column list instead of `select("*", ...)` — the
      // scheduler only reads ~20 fields per row, not the full 40+. Saves
      // ~50% network transfer and JSON parse time at 500+ appointments/day.
      // Los montos de pagos vienen embebidos en el mismo select vía la FK
      // anidada (respaldada por idx_patient_payments_appt_amt, mig 103).
      // Columnas de migraciones recientes van en selects propios: si la mig
      // aún no corrió, pedir una columna inexistente tumba TODA la agenda
      // (400), así que se repite sin ella.
      //   - `services.color` (mig 255)
      //   - `appointments.modality` (mig 256; sin ella la modalidad se
      //     deduce por meeting_url — lib/appointment-modality.ts)
      // Tipado como `string` a propósito: con dos interpolaciones el parser
      // de tipos de PostgREST se desborda (TS2589); el resultado ya se
      // castea abajo a AppointmentWithRelations[].
      //
      // `prescriptions` (spec §3.4) NO entra en la cascada de arriba: la
      // tabla, la FK `appointment_id` y `is_active` existen desde la mig 053,
      // mucho antes que 255/256, así que no hay ningún esquema vivo que tenga
      // `modality` y no tenga recetas. Va como tercera bandera del mismo
      // constructor y se recorre la cascada dos veces como mucho (ver abajo),
      // en vez de multiplicar los cuatro casos por ocho.
      // Solo `id`: el CONTEO es lo único que la tarjeta necesita. Mandar
      // `medication` de 200 citas al navegador de cualquiera que abra la
      // agenda sería una divulgación clínica gratuita y además invisible para
      // la auditoría (§3.6) — los nombres se piden al abrir el sidebar.
      // `hold_expires_at` (mig 274, pre-reserva) va como cuarta bandera: se
      // pide primero y, si la columna no existe, se repite sin ella (y se
      // recuerda en la sesión para no pagar el 400 en cada navegación).
      type ApptSelectOpts = { serviceColor: boolean; modality: boolean; prescriptions: boolean; hold?: boolean };
      const apptColumns = ({ serviceColor, modality, prescriptions, hold }: ApptSelectOpts): string =>
        `id, patient_id, patient_name, patient_phone, doctor_id, office_id, service_id, appointment_date, start_time, end_time, status, origin, payment_method, responsible, responsible_user_id, notes, meeting_url${modality ? ", modality" : ""}, price_snapshot, discount_amount, discount_reason, discount_code_id, treatment_session_id, einvoice_id, organization_id, created_at, updated_at, edited_at, edited_by_name, arrived_at, consultation_started_at, consultation_ended_at${hold ? ", hold_expires_at" : ""}, doctors(id, full_name, color, default_meeting_url), offices(id, name), services(id, name, duration_minutes, base_price${serviceColor ? ", color" : ""}), patients(is_recurring, dni, birth_date), patient_payments!patient_payments_appointment_id_fkey(amount)${prescriptions ? ", prescriptions(id)" : ""}`;
      const selectAppts = (opts: ApptSelectOpts) => {
        const q = supabase
          .from("appointments")
          .select(apptColumns(opts))
          .gte("appointment_date", rangeStartKey)
          .lte("appointment_date", rangeEndKey)
          .neq("status", "cancelled");
        // Una receta SUSPENDIDA (`is_active = false`, el Ban/RotateCcw de
        // prescriptions-panel.tsx:289-294) no debe pintar icono. PostgREST sí
        // sabe filtrar dentro del embed: el filtro con ruta punteada se aplica
        // a las filas EMBEBIDAS, no al padre — sin `!inner` la cita sigue
        // viniendo, con `prescriptions: []`. Así no hay que traerse la columna
        // `is_active` al cliente para filtrarla a mano.
        // El `.eq` solo se encadena cuando el embed existe: con la función
        // apagada la query es la de siempre, sin un parámetro de más.
        return (opts.prescriptions ? q.eq("prescriptions.is_active", true) : q).order("start_time");
      };
      // Cascada de fallbacks por columnas que pueden no existir (255/256).
      const runCascade = async (prescriptions: boolean) => {
        const hold = !holdColumnKnownMissing();
        let res = await selectAppts({ serviceColor: true, modality: true, prescriptions, hold });
        if (hold) {
          if (!res.error) markHoldColumnSupport(true);
          else {
            if (isMissingColumnError(res.error, "hold_expires_at")) markHoldColumnSupport(false);
            res = await selectAppts({ serviceColor: true, modality: true, prescriptions });
          }
        }
        if (res.error) res = await selectAppts({ serviceColor: true, modality: false, prescriptions });
        if (res.error) res = await selectAppts({ serviceColor: false, modality: true, prescriptions });
        if (res.error) res = await selectAppts({ serviceColor: false, modality: false, prescriptions });
        return res;
      };
      let apptRes = await runCascade(prescriptionSignalEnabled);
      // Red de seguridad: si lo que rompiera fuese el embed nuevo (caché de
      // esquema de PostgREST recién desplegada, RLS futura…), la AGENDA no se
      // cae — se repite la cascada sin él y lo único que se pierde es el
      // icono. La agenda es la pantalla más caliente del producto.
      if (apptRes.error && prescriptionSignalEnabled) apptRes = await runCascade(false);

      // Ni el select mínimo funcionó: esto NO es "no hay citas". Se lanza con
      // el code / message / hint / details de PostgREST (el del último
      // intento, el más básico) para que la pantalla avise y Sentry lo vea.
      if (apptRes.error) throw new PostgrestLoadError("Agenda (citas)", apptRes.error);

      // Supabase types the joined relations as arrays when an explicit column
      // list is used; at runtime they are single objects for to-one FKs. Cast
      // through unknown is the standard escape hatch for this mismatch.
      return (apptRes.data as unknown as AppointmentWithRelations[]) ?? [];
    },
  });
  const appointments = apptsData ?? [];

  // ── Pre-reservas vencidas (mig 274) ─────────────────────────────────
  // Chip rojo "N pre-reservas vencidas": query liviana por org (conteo + la
  // más antigua), al enfocar y cada minuto. Sin la mig devuelve null y el
  // chip no aparece. El doctor restringido no la ve (no gestiona la agenda
  // de otros).
  const { data: expiredHolds } = useQuery({
    queryKey: ["scheduler", "expired-holds", organizationId],
    enabled: !!organizationId && !restrictedDoctor,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: () => fetchExpiredHolds(createClient(), organizationId!),
  });
  // Clic en el chip: ir al día de la más antigua y abrirla cuando cargue.
  const [pendingOpenApptId, setPendingOpenApptId] = useState<{ id: string; date: string } | null>(null);
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

  // Recetas VIGENTES por cita — mismo patrón exacto que `paymentTotals`:
  // derivado del embed `prescriptions(id)` del mismo select, cero queries.
  // Con la función apagada el embed no viaja, el bucle no encuentra nada y
  // esto es `{}` — cada tarjeta recibe 0 y no pinta nada (que es también su
  // valor por defecto, así que el comportamiento es el de antes de la
  // feature). Las suspendidas ya vienen filtradas por PostgREST (arriba).
  const prescriptionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of appointments) {
      const rx = (a as unknown as { prescriptions?: { id: string }[] | null })
        .prescriptions;
      if (!rx || rx.length === 0) continue;
      counts[a.id] = rx.length;
    }
    return counts;
  }, [appointments]);

  // Igual que las citas: si también falla el select legacy, se lanza en vez
  // de devolver [] (sin bloqueos visibles la recepción podría agendar encima
  // de un horario bloqueado sin enterarse).
  const {
    data: blocksData,
    error: blocksError,
    isError: blocksIsError,
    isFetching: blocksFetching,
    refetch: refetchBlocks,
  } = useQuery({
    queryKey: ["scheduler", "blocks", organizationId, rangeStartKey, rangeEndKey],
    enabled: !!organizationId,
    placeholderData: (prev) => prev,
    retry: 1,
    queryFn: async () => {
      // Mig 254: solo bloqueos vigentes (desbloquear = marca removed_at) y
      // con el nombre de quien bloqueó para el tooltip / menú. Si la mig
      // aún no corrió, las columnas no existen → se repite sin ellas.
      const supabase = createClient();
      const withAudit = await supabase
        .from("schedule_blocks")
        .select("id, block_date, start_time, end_time, office_id, all_day, reason, organization_id, created_at, created_by_name, removed_at")
        .is("removed_at", null)
        .gte("block_date", rangeStartKey)
        .lte("block_date", rangeEndKey);
      if (!withAudit.error) return (withAudit.data as ScheduleBlock[]) ?? [];
      const legacy = await supabase
        .from("schedule_blocks")
        .select("id, block_date, start_time, end_time, office_id, all_day, reason, organization_id, created_at")
        .gte("block_date", rangeStartKey)
        .lte("block_date", rangeEndKey);
      if (legacy.error) throw new PostgrestLoadError("Agenda (bloqueos)", legacy.error);
      return (legacy.data as ScheduleBlock[]) ?? [];
    },
  });
  const blocks = blocksData ?? [];

  // Sentry: una vez por error distinto (no por render ni por reintento que
  // falla igual). El rango visible va como contexto del reporte.
  useReportLoadError(apptsError, {
    area: "agenda",
    query: "appointments",
    extra: { rangeStart: rangeStartKey, rangeEnd: rangeEndKey },
  });
  useReportLoadError(blocksError, {
    area: "agenda",
    query: "schedule_blocks",
    extra: { rangeStart: rangeStartKey, rangeEnd: rangeEndKey },
  });

  // Mismos nombres que las antiguas funciones de fetch: ahora invalidan la
  // caché (el rango visible refetchea al instante; los demás, al volver).
  const fetchAppointments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["scheduler", "appts"] });
  }, [queryClient]);

  const fetchBlocks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["scheduler", "blocks"] });
  }, [queryClient]);

  const loading = loadingMaster || apptsPending;

  useEffect(() => {
    if (!pendingOpenApptId || apptsPending || apptsIsPlaceholder) return;
    if (pendingOpenApptId.date < rangeStartKey || pendingOpenApptId.date > rangeEndKey) return;
    const target = appointments.find((a) => a.id === pendingOpenApptId.id);
    setPendingOpenApptId(null);
    if (target) {
      setShowForm(false);
      setSelectedAppointment(target);
    } else {
      toast.info("Esa pre-reserva ya no está en la agenda (quizá se confirmó o liberó).");
      queryClient.invalidateQueries({ queryKey: ["scheduler", "expired-holds"] });
    }
  }, [pendingOpenApptId, apptsPending, apptsIsPlaceholder, appointments, rangeStartKey, rangeEndKey, queryClient]);

  const handleExpiredHoldsClick = useCallback(() => {
    const oldest = expiredHolds?.oldest;
    if (!oldest) return;
    const parsed = new Date(`${oldest.appointment_date}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setViewMode("day");
    setCurrentDate(parsed);
    setPendingOpenApptId({ id: oldest.id, date: oldest.appointment_date });
  }, [expiredHolds]);

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
      // Pre-reserva (mig 274): si la columna existe viaja también — el merge
      // avanza updated_at, así que un hold confirmado/extendido por otra
      // persona quedaría enmascarado para siempre si no se trae aquí.
      const withHold = !holdColumnKnownMissing();
      const pollColumns = `id, status, arrived_at, consultation_started_at, consultation_ended_at, updated_at${withHold ? ", hold_expires_at" : ""}`;
      let pollRes: { data: unknown; error: { code?: string; message?: string } | null } = await supabase
        .from("appointments")
        .select(pollColumns)
        .gte("appointment_date", startDate)
        .lte("appointment_date", endDate)
        .neq("status", "cancelled");
      if (pollRes.error && withHold && isMissingColumnError(pollRes.error, "hold_expires_at")) {
        markHoldColumnSupport(false);
        pollRes = await supabase
          .from("appointments")
          .select("id, status, arrived_at, consultation_started_at, consultation_ended_at, updated_at")
          .gte("appointment_date", startDate)
          .lte("appointment_date", endDate)
          .neq("status", "cancelled");
      }
      const data = pollRes.data as unknown as Array<{
        id: string;
        status: AppointmentWithRelations["status"];
        arrived_at: string | null;
        consultation_started_at: string | null;
        consultation_ended_at: string | null;
        updated_at: string;
        hold_expires_at?: string | null;
      }> | null;
      if (cancelled || !data) return;

      const apptsKey = ["scheduler", "appts", organizationId, startDate, endDate];
      // Si la carga completa de este rango está en error, no se toca la
      // caché: setQueryData la marcaría como 'success' y escondería el aviso
      // de error sin haber recargado de verdad. Sin error, esto no cambia nada.
      if (queryClient.getQueryState(apptsKey)?.status === "error") return;

      const byId = new Map(
        data.map((r) => [r.id as string, r] as const),
      );
      // Merge directo en la caché de React Query del rango visible — los
      // consumidores re-renderizan solo si alguna fila cambió de verdad.
      queryClient.setQueryData<AppointmentWithRelations[]>(
        apptsKey,
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
              ...("hold_expires_at" in fresh ? { hold_expires_at: fresh.hold_expires_at ?? null } : {}),
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

  // Modo reprogramar: consultorios donde atiende el doctor de la cita
  // original el día que se está mirando (doctor_schedules). Vacío = sin
  // restricción de consultorio (o doctor inactivo).
  const rescheduleDoctorActive =
    !!rescheduleCtx?.doctorId && doctors.some((d) => d.id === rescheduleCtx.doctorId);
  const rescheduleDoctorOfficeIdsFor = useCallback(
    (day: Date): string[] => {
      if (!rescheduleCtx?.doctorId || !rescheduleDoctorActive) return [];
      const dow = day.getDay();
      return Array.from(
        new Set(
          doctorSchedules
            .filter((ds) => ds.doctor_id === rescheduleCtx.doctorId && ds.day_of_week === dow && ds.office_id)
            .map((ds) => ds.office_id!)
        )
      );
    },
    [rescheduleCtx, rescheduleDoctorActive, doctorSchedules]
  );

  // Filtered offices for the grid. En modo reprogramar se muestran SIEMPRE
  // el consultorio de la cita original y los del horario del doctor ese día,
  // sin tocar el filtro guardado (al salir del modo vuelve solo).
  const rescheduleForcedOfficeIds = useMemo(() => {
    if (!rescheduleCtx) return [] as string[];
    const ids = new Set(rescheduleDoctorOfficeIdsFor(currentDate));
    if (rescheduleCtx.officeId) ids.add(rescheduleCtx.officeId);
    return Array.from(ids).filter((id) => offices.some((o) => o.id === id));
  }, [rescheduleCtx, rescheduleDoctorOfficeIdsFor, currentDate, offices]);
  const filteredOffices = useMemo(
    () =>
      offices.filter(
        (o) => selectedOfficeIds.includes(o.id) || rescheduleForcedOfficeIds.includes(o.id)
      ),
    [offices, selectedOfficeIds, rescheduleForcedOfficeIds]
  );
  const rescheduleOfficeNotice = useMemo(() => {
    const extra = rescheduleForcedOfficeIds.filter((id) => !selectedOfficeIds.includes(id));
    if (extra.length === 0) return null;
    const names = extra.map((id) => offices.find((o) => o.id === id)?.name).filter(Boolean);
    return `Mostrando ${names.join(", ")} por la reprogramación`;
  }, [rescheduleForcedOfficeIds, selectedOfficeIds, offices]);

  // Avisos de precarga parcial: doctor o servicio de la cita original que ya
  // no se pueden elegir (inactivos, o el servicio ya no está asignado).
  const rescheduleWarnings = useMemo(() => {
    const ctx = rescheduleCtx;
    if (!ctx) return [] as string[];
    const out: string[] = [];
    if (ctx.doctorId && !rescheduleDoctorActive) {
      out.push(`${ctx.doctorName ?? "El doctor"} ya no está activo — elige otro doctor en el formulario.`);
    }
    if (ctx.serviceId) {
      const serviceListed = services.some((sv) => sv.id === ctx.serviceId);
      if (!serviceListed || !ctx.serviceActive) {
        out.push(`El servicio ${ctx.serviceName ?? ""} ya no está disponible — elige otro servicio.`);
      } else if (
        rescheduleDoctorActive &&
        !doctorServices.some((ds) => ds.doctor_id === ctx.doctorId && ds.service_id === ctx.serviceId)
      ) {
        out.push(
          `El servicio ${ctx.serviceName ?? ""} ya no está disponible para ${ctx.doctorName ?? "ese doctor"} — elige otro servicio o doctor.`
        );
      }
    }
    return out;
  }, [rescheduleCtx, rescheduleDoctorActive, services, doctorServices]);

  // ¿Ese hueco ya pasó? Reloj de pared de la ORG (no del navegador ni UTC).
  // La day-view lo pregunta por cada hueco vacío en cada render: el "ahora"
  // se cachea unos segundos para no construir cientos de Intl.DateTimeFormat.
  const orgNowKeyCacheRef = useRef<{ at: number; tz: string; key: string } | null>(null);
  const isPastSlot = useCallback(
    (dateStr: string, time: string) => {
      const nowMs = Date.now();
      let cache = orgNowKeyCacheRef.current;
      if (!cache || cache.tz !== orgTimezone || nowMs - cache.at > 15_000) {
        cache = { at: nowMs, tz: orgTimezone, key: format(zonedNow(orgTimezone), "yyyy-MM-dd HH:mm") };
        orgNowKeyCacheRef.current = cache;
      }
      return `${dateStr} ${time.slice(0, 5)}` < cache.key;
    },
    [orgTimezone]
  );

  // Motivo por el que un hueco no sirve para reprogramar (null = sirve).
  const rescheduleSlotReason = useCallback(
    (date: Date, time: string, officeId: string | null): string | null => {
      if (!rescheduleCtx) return null;
      if (isPastSlot(format(date, "yyyy-MM-dd"), time)) return "Elige un horario futuro";
      if (officeId) {
        const docOffices = rescheduleDoctorOfficeIdsFor(date);
        if (docOffices.length > 0 && !docOffices.includes(officeId)) {
          const names = docOffices
            .map((id) => offices.find((o) => o.id === id)?.name)
            .filter(Boolean)
            .join(" / ");
          return `${rescheduleCtx.doctorName ?? "El doctor"} atiende en ${names || "otro consultorio"} este día`;
        }
      }
      return null;
    },
    [rescheduleCtx, isPastSlot, rescheduleDoctorOfficeIdsFor, offices]
  );
  const daySlotDisabledReason = useMemo(
    () =>
      rescheduleCtx
        ? (time: string, officeId: string) => rescheduleSlotReason(currentDate, time, officeId)
        : undefined,
    [rescheduleCtx, rescheduleSlotReason, currentDate]
  );

  // Handlers — wrapped in useCallback to prevent child re-renders
  // Nueva cita — compartido por el botón del header (md+) y el FAB móvil.
  const handleNewAppointment = useCallback(() => {
    setFormDefaults({ date: format(currentDate, "yyyy-MM-dd") });
    setShowForm(true);
  }, [currentDate]);

  const handleSlotClick = useCallback((date: Date, time: string, officeId: string) => {
    if (rescheduleCtx) {
      const reason = rescheduleSlotReason(date, time, officeId);
      if (reason) {
        toast.error(reason);
        return;
      }
      setFormDefaults({
        date: format(date, "yyyy-MM-dd"),
        startTime: time,
        officeId,
        reschedule: rescheduleCtx,
      });
      setShowForm(true);
      setSelectedAppointment(null);
      return;
    }
    setFormDefaults({
      date: format(date, "yyyy-MM-dd"),
      startTime: time,
      officeId,
    });
    setShowForm(true);
    setSelectedAppointment(null);
  }, [rescheduleCtx, rescheduleSlotReason]);

  // La semana no tiene columnas por consultorio: manda offices[0]. En modo
  // reprogramar se usa el consultorio de la cita original (o, si ese día el
  // doctor atiende en otro, el suyo). Fuera del modo, igual que siempre.
  const handleWeekSlotClick = useCallback((date: Date, time: string, officeId: string) => {
    if (!rescheduleCtx) {
      handleSlotClick(date, time, officeId);
      return;
    }
    const docOffices = rescheduleDoctorOfficeIdsFor(date);
    const original =
      rescheduleCtx.officeId && offices.some((o) => o.id === rescheduleCtx.officeId)
        ? rescheduleCtx.officeId
        : null;
    const office =
      docOffices.length > 0
        ? original && docOffices.includes(original)
          ? original
          : docOffices[0]
        : original ?? officeId;
    handleSlotClick(date, time, office);
  }, [rescheduleCtx, rescheduleDoctorOfficeIdsFor, offices, handleSlotClick]);

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

  // Refresca la grilla y el chip de pre-reservas vencidas SIN cerrar nada
  // (Extender / Confirmar sin pago desde el panel de la cita).
  const handleRefreshKeepOpen = useCallback(() => {
    fetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["scheduler", "expired-holds"] });
  }, [fetchAppointments, queryClient]);

  const handleSaved = useCallback(() => {
    fetchAppointments();
    queryClient.invalidateQueries({ queryKey: ["scheduler", "reschedule-pending"] });
    queryClient.invalidateQueries({ queryKey: ["scheduler", "expired-holds"] });
    setShowForm(false);
    setFormDefaults(null);
    setSelectedAppointment(null);
    setShowReschedule(false);
  }, [fetchAppointments, queryClient]);

  // Guardar desde el formulario: además, si la cita nueva era la
  // reprogramación, se sale del modo (quita ?reprogramar= de la URL).
  const handleFormSaved = useCallback(() => {
    handleSaved();
    if (rescheduleCtx) exitRescheduleMode();
  }, [handleSaved, rescheduleCtx, exitRescheduleMode]);

  // Fin de una cancelación en el sidebar (el conteo de "Deshacer" termina con
  // un timer que puede disparar cuando recepción ya abrió OTRA cita o el
  // formulario): solo refresca la agenda y la burbuja, sin cerrar nada.
  const handleAppointmentCancelled = useCallback((appointmentId: string) => {
    fetchAppointments();
    // Si recepción cerró y reabrió la misma cita durante el conteo, el panel
    // nuevo (otra instancia por key) seguiría mostrándola "agendada": se
    // cierra solo ese; otra cita abierta o el formulario no se tocan.
    setSelectedAppointment((prev) => (prev?.id === appointmentId ? null : prev));
    queryClient.invalidateQueries({ queryKey: ["scheduler", "reschedule-pending"] });
  }, [fetchAppointments, queryClient]);

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

    // Pre-reserva (mig 274): aún no se le confirmó a la paciente ni está en
    // Google Calendar (eso pasa al confirmarla): moverla no avisa ni sube.
    const movedAppt = appointments.find((a) => a.id === pendingDrop.appointmentId);
    const movedIsHold = !!movedAppt && !!getHoldExpiresAt(movedAppt);

    // Mirror move to Google Calendar (best-effort).
    if (!movedIsHold) syncAppointmentToGoogle(pendingDrop.appointmentId, "upsert");

    // Mismo evento que usa el modal Reprogramar — ahora opt-in explícito.
    if (notifyPatient && !movedIsHold) {
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

    // Mig 254: desbloquear = marca "quitado por X" vía API (cualquier
    // miembro activo), con fila en el registro de auditoría. Antes era un
    // DELETE directo que RLS filtraba en silencio para doctor/recepción y
    // la app decía "desbloqueado" sin haber hecho nada.
    try {
      const res = await fetch(`/api/scheduler/blocks/${blockId}`, { method: "DELETE" });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        const msg =
          res.status === 403
            ? "No tienes permiso para desbloquear este horario"
            : res.status === 404
              ? "Ese bloqueo ya no existe"
              : res.status === 409
                ? "Ese bloqueo ya había sido quitado"
                : j?.error ?? `Error ${res.status}`;
        toast.error("Error al desbloquear: " + msg);
        fetchBlocks();
        return;
      }
    } catch (e) {
      toast.error("Error al desbloquear: " + (e instanceof Error ? e.message : "Sin conexión"));
      return;
    }
    toast.success("Horario desbloqueado");
    fetchBlocks();
  };

  // Break Time (mig 254): persiste en scheduler_settings.break_time por org.
  // El PUT exige owner/admin; el diálogo ya lo muestra en solo-lectura al
  // resto, esto es la red de seguridad.
  const handleSaveBreakTime = async (config: BreakTimeConfig): Promise<boolean> => {
    const ok = await saveSchedulerConfigToDb({ breakTime: config }, organizationId);
    if (!ok) {
      toast.error("No se pudo guardar el descanso. Solo un administrador puede cambiarlo.");
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ["scheduler-config"] });
    setShowBreakTimeDialog(false);
    toast.success(config.enabled ? "Break Time activado para toda la clínica" : "Break Time desactivado");
    return true;
  };

  // Block dialog date pre-selection
  const blockDialogDefaultDate = format(currentDate, "yyyy-MM-dd");

  // Merge DB blocks with virtual break time blocks for rendering
  const { startDate: rangeStart, endDate: rangeEnd } = getDateRange();
  const allBlocks = useMemo<ScheduleBlock[]>(
    () => [...blocks, ...breakTimeBlocksInRange(breakTimeConfig, rangeStart, rangeEnd, organizationId ?? "")],
    [blocks, breakTimeConfig, rangeStart, rangeEnd, organizationId]
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

  // Modo reprogramar: Esc sale, pero solo si no hay ningún panel / modal /
  // popover encima (esos se cierran primero con su propio Esc).
  const overlayOpenRef = useRef(schedulerOverlayOpen);
  overlayOpenRef.current = schedulerOverlayOpen;
  useEffect(() => {
    if (!rescheduleCtx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (overlayOpenRef.current) return;
      if (document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
      exitRescheduleMode();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rescheduleCtx, exitRescheduleMode]);

  // Modo reprogramar en móvil: la semana es una lista sin franjas ni
  // consultorios, así que se fuerza la vista día mientras dure el modo.
  useEffect(() => {
    if (!rescheduleCtx || viewMode !== "week") return;
    if (window.matchMedia("(max-width: 767px)").matches) setViewMode("day");
  }, [rescheduleCtx, viewMode]);

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
          onNewAppointment={rescheduleCtx ? exitRescheduleMode : handleNewAppointment}
          rescheduling={!!rescheduleCtx}
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
          blocks={allBlocks}
          schedulerConfig={schedulerConfig}
          reschedulePending={showReschedulePill ? reschedulePending : undefined}
          expiredHoldsCount={expiredHolds?.count ?? 0}
          onExpiredHoldsClick={handleExpiredHoldsClick}
        />

        {rescheduleCtx && (
          <RescheduleBanner
            ctx={rescheduleCtx}
            warnings={rescheduleWarnings}
            officeNotice={rescheduleOfficeNotice}
            onExit={exitRescheduleMode}
          />
        )}

        {/* Error de carga: franja entre el header y la grilla, sin ocultar
            ninguno de los dos. Los contadores del header se calculan de las
            citas cargadas: si el rango ya estaba en caché conservan los
            últimos valores buenos; si nunca cargó quedarían en 0, y por eso
            el aviso lo dice explícitamente (poner "—" allí exige tocar
            scheduler-header.tsx). También avisa de que el formulario no
            puede detectar cruces: su chequeo es contra estas mismas citas. */}
        {apptsIsError && (
          <DataLoadError
            title={loadErrorEn ? "Appointments could not be loaded." : "No se pudieron cargar las citas."}
            description={
              loadErrorEn
                ? "Your appointments are not lost. Until they load, the calendar and the counters above may look empty or outdated, and new bookings are not checked for overlaps."
                : "Tus citas no se han perdido. Hasta que carguen, la agenda y los contadores de arriba pueden verse vacíos o desactualizados, y al agendar no se detectan cruces de horario."
            }
            labels={loadErrorEn ? { retry: "Retry", retrying: "Retrying…", details: "Technical details" } : undefined}
            error={apptsError}
            onRetry={() => void refetchAppts()}
            retrying={apptsFetching}
          />
        )}
        {blocksIsError && (
          <DataLoadError
            tone="warning"
            title={loadErrorEn ? "Time blocks could not be loaded." : "No se pudieron cargar los bloqueos de horario."}
            description={
              loadErrorEn
                ? "Your time blocks are not lost, but they may not show on the calendar: double-check before booking a slot that should be blocked."
                : "Tus bloqueos no se han perdido, pero podrían no verse en la agenda: revisa antes de agendar en un horario que debería estar bloqueado."
            }
            labels={loadErrorEn ? { retry: "Retry", retrying: "Retrying…", details: "Technical details" } : undefined}
            error={blocksError}
            onRetry={() => void refetchBlocks()}
            retrying={blocksFetching}
          />
        )}

        <div ref={gridScrollRef} className="flex-1 overflow-auto">
          {/* NowProvider: single per-minute ticker shared by the views.
              Memoized AppointmentCards don't re-render on the tick —
              only components calling useNow() do. */}
          <NowProvider>
            <PrereservaColorProvider color={schedulerConfig.prereservaColor}>
            {viewMode === "day" ? (
              <DayView
                date={currentDate}
                appointments={appointments}
                offices={filteredOffices}
                blocks={allBlocks}
                paymentTotals={paymentTotals}
                prescriptionCounts={prescriptionCounts}
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
                slotDisabledReason={daySlotDisabledReason}
              />
            ) : (
              <WeekView
                currentDate={currentDate}
                appointments={appointments}
                offices={filteredOffices}
                blocks={allBlocks}
                paymentTotals={paymentTotals}
                prescriptionCounts={prescriptionCounts}
                selectedAppointmentId={selectedAppointment?.id}
                currentDoctorId={restrictedDoctor ? currentDoctorId : null}
                onSlotClick={handleWeekSlotClick}
                onAppointmentClick={handleAppointmentClick}
                containerHeight={gridContainerHeight}
              />
            )}
            </PrereservaColorProvider>
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
      {!schedulerOverlayOpen && !rescheduleCtx && (
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
          // key: al pasar de una cita a otra el sidebar se remonta (su estado
          // interno —casillas, conteo de cancelación— no se arrastra).
          key={selectedAppointment.id}
          appointment={selectedAppointment}
          onClose={handleCloseSidebar}
          onUpdate={handleSaved}
          onCancelled={handleAppointmentCancelled}
          onRefresh={handleRefreshKeepOpen}
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
          prereservaDefaultMinutes={schedulerConfig.prereservaDefaultMinutes}
          organizationId={organizationId ?? ""}
          organizationName={organization?.name ?? ""}
          organizationAddress={organization?.address || ""}
          currentDoctorId={(isDoctor || (isOwner && currentDoctorId)) ? currentDoctorId : null}
          restrictToDoctor={restrictedDoctor && !isOwner}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
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
          initial={breakTimeConfig}
          canEdit={isOwner || isAdmin}
          scheduleStartMinutes={getScheduleStartMinutes(schedulerConfig)}
          scheduleEndMinutes={getScheduleEndMinutes(schedulerConfig)}
          onClose={() => setShowBreakTimeDialog(false)}
          onSave={handleSaveBreakTime}
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
