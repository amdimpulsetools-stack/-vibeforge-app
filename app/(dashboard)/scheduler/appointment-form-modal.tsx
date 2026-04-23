"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { sendNotification } from "@/lib/send-notification";
import { appointmentSchema, type AppointmentFormData } from "@/lib/validations/appointment";
import type {
  Office,
  Doctor,
  Service,
  LookupValue,
  AppointmentWithRelations,
  Patient,
  DoctorSchedule,
} from "@/types/admin";
import { DAYS_OF_WEEK } from "@/types/admin";
import {
  X,
  Loader2,
  AlertTriangle,
  Search,
  UserCheck,
  UserPlus,
  CheckCircle2,
  Wallet,
  Banknote,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PERU_DEPARTAMENTOS, PERU_DEPARTAMENTO_LIST } from "@/lib/peru-locations";
import { ZoomIcon } from "@/components/icons/zoom-icon";
import { getPaymentIcon } from "@/lib/payment-icons";
import { RecurringBadge } from "@/components/patients/recurring-badge";
import { loadWaClipboardConfig, type AppointmentVariables } from "@/lib/whatsapp-clipboard-config";
import { WhatsAppClipboardModal } from "./whatsapp-clipboard-modal";

interface DoctorServiceEntry {
  doctor_id: string;
  service_id: string;
}

interface AppointmentFormModalProps {
  defaults: {
    date?: string;
    startTime?: string;
    officeId?: string;
  } | null;
  offices: Office[];
  doctors: Doctor[];
  services: Service[];
  doctorServices: DoctorServiceEntry[];
  doctorSchedules: Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time" | "office_id">[];
  lookupOrigins: LookupValue[];
  lookupPayments: LookupValue[];
  lookupResponsibles: { id: string; user_id?: string; label: string }[];
  existingAppointments: AppointmentWithRelations[];
  blocks?: { block_date: string; start_time: string | null; end_time: string | null; all_day: boolean; office_id: string | null }[];
  /** Org schedule hours — appointments outside this range are rejected */
  scheduleStartHour?: number;
  scheduleEndHour?: number;
  organizationId: string;
  organizationName: string;
  organizationAddress: string;
  /** If the current user is a doctor, pre-select (and optionally restrict to) their own record */
  currentDoctorId?: string | null;
  /** When true, only show the current doctor in the doctor select (default: true for backwards compat) */
  restrictToDoctor?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AppointmentFormModal({
  defaults,
  offices,
  doctors,
  services,
  doctorServices,
  doctorSchedules,
  lookupOrigins,
  lookupPayments,
  lookupResponsibles,
  existingAppointments,
  blocks = [],
  scheduleStartHour = 8,
  scheduleEndHour = 20,
  organizationId,
  organizationName,
  organizationAddress,
  currentDoctorId,
  restrictToDoctor = true,
  onClose,
  onSaved,
}: AppointmentFormModalProps) {
  const { t, language } = useLanguage();

  // If current user is a doctor and restricted, only show their own record
  const availableDoctors = currentDoctorId && restrictToDoctor
    ? doctors.filter((d) => d.id === currentDoctorId)
    : doctors;
  const [saving, setSaving] = useState(false);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [foundPatient, setFoundPatient] = useState<Patient | null>(null);
  const [patientSearched, setPatientSearched] = useState(false);

  // Patient extra fields (used when auto-creating patient)
  const [docType, setDocType] = useState<"DNI" | "CE" | "Pasaporte">("DNI");
  const [patientEmail, setPatientEmail] = useState("");
  const [patientBirthDate, setPatientBirthDate] = useState("");
  const [patientDepartamento, setPatientDepartamento] = useState("");
  const [patientDistrito, setPatientDistrito] = useState("");

  // WhatsApp clipboard modal
  const [showWaModal, setShowWaModal] = useState(false);
  const [waVariables, setWaVariables] = useState<AppointmentVariables | null>(null);

  // Anticipo / reserva anticipada
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState("");
  const [depositRef, setDepositRef] = useState("");

  // Treatment plan linking — populated after a patient is found.
  // Each entry represents a session pending to be scheduled (no appointment yet).
  const [activePlanSessions, setActivePlanSessions] = useState<Array<{
    session_id: string;
    plan_id: string;
    plan_title: string;
    session_number: number;
    total_sessions: number;
    service_id: string | null;
    session_price: number | null;
    service_name?: string | null;
  }>>([]);
  const [selectedPlanSessionId, setSelectedPlanSessionId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_name: "",
      patient_last_name: "",
      patient_phone: "",
      patient_dni: "",
      patient_id: "",
      doctor_id: currentDoctorId ?? "",
      office_id: defaults?.officeId ?? "",
      service_id: "",
      appointment_date: defaults?.date ?? new Date().toISOString().split("T")[0],
      start_time: defaults?.startTime ?? "",
      status: "scheduled",
      origin: "",
      payment_method: "",
      responsible: "",
      notes: "",
      meeting_url: "",
    },
  });

  const selectedServiceId = watch("service_id");
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const duration = selectedService?.duration_minutes ?? 30;
  const servicePrice = selectedService ? Number(selectedService.base_price) : 0;
  const serviceModality = (selectedService as any)?.modality as string | undefined;
  const isVirtualService = serviceModality === "virtual" || serviceModality === "both";

  // Auto-set deposit to 50% when service changes
  useEffect(() => {
    if (servicePrice > 0) {
      setDepositAmount((servicePrice * 0.5).toFixed(2));
    }
  }, [selectedServiceId, servicePrice]);

  const watchedStartTime = watch("start_time");
  const endTime = useMemo(() => {
    if (!watchedStartTime) return "";
    const [h, m] = watchedStartTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + duration;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
  }, [watchedStartTime, duration]);

  const watchedDate = watch("appointment_date");
  const watchedOffice = watch("office_id");
  const watchedDoctor = watch("doctor_id");

  // Auto-fill meeting URL from doctor's default when virtual service is selected
  useEffect(() => {
    if (isVirtualService && watchedDoctor) {
      const doctor = doctors.find((d) => d.id === watchedDoctor);
      const doctorUrl = (doctor as any)?.default_meeting_url;
      if (doctorUrl) {
        setValue("meeting_url", doctorUrl);
      }
    } else {
      setValue("meeting_url", "");
    }
  }, [isVirtualService, watchedDoctor, doctors, setValue]);

  // ─── Reset service when doctor changes ───────────────────────────────────
  const prevDoctorRef = useRef(watchedDoctor);
  useEffect(() => {
    if (prevDoctorRef.current !== watchedDoctor) {
      setValue("service_id", "");
      prevDoctorRef.current = watchedDoctor;
    }
  }, [watchedDoctor, setValue]);

  // ─── Service filter by doctor ─────────────────────────────────────────────
  const doctorServiceIds = useMemo(() => {
    if (!watchedDoctor) return new Set<string>();
    return new Set(
      doctorServices
        .filter((ds) => ds.doctor_id === watchedDoctor)
        .map((ds) => ds.service_id)
    );
  }, [watchedDoctor, doctorServices]);

  const filteredServices = watchedDoctor
    ? services.filter((s) => doctorServiceIds.has(s.id))
    : [];

  // ─── Doctor schedule validation ───────────────────────────────────────────
  const appointmentDow = useMemo(() => {
    if (!watchedDate) return null;
    return new Date(watchedDate + "T12:00:00").getDay();
  }, [watchedDate]);

  const doctorScheduleForDay = useMemo(() => {
    if (!watchedDoctor || appointmentDow === null) return null;
    return (
      doctorSchedules.find(
        (ds) => ds.doctor_id === watchedDoctor && ds.day_of_week === appointmentDow
      ) ?? null
    );
  }, [watchedDoctor, appointmentDow, doctorSchedules]);

  const doctorAvailableDays = useMemo(() => {
    if (!watchedDoctor) return [];
    const dows = new Set(
      doctorSchedules
        .filter((ds) => ds.doctor_id === watchedDoctor)
        .map((ds) => ds.day_of_week)
    );
    return DAYS_OF_WEEK.filter((d) => dows.has(d.value)).map((d) => d.label);
  }, [watchedDoctor, doctorSchedules]);

  const doctorDayError =
    !!watchedDoctor &&
    !!watchedDate &&
    appointmentDow !== null &&
    !doctorScheduleForDay;

  // Filter offices based on doctor's schedule for the selected day
  const filteredOffices = useMemo(() => {
    if (!watchedDoctor || appointmentDow === null) return offices;
    const scheduleOfficeIds = doctorSchedules
      .filter((ds) => ds.doctor_id === watchedDoctor && ds.day_of_week === appointmentDow && ds.office_id)
      .map((ds) => ds.office_id!);
    // If no office restriction set in any schedule block for this day, show all offices
    if (scheduleOfficeIds.length === 0) return offices;
    return offices.filter((o) => scheduleOfficeIds.includes(o.id));
  }, [watchedDoctor, appointmentDow, doctorSchedules, offices]);

  // Auto-select office when only one is available, or reset if current selection is no longer valid
  useEffect(() => {
    if (filteredOffices.length === 1) {
      setValue("office_id", filteredOffices[0].id);
    } else if (watchedOffice && !filteredOffices.some((o) => o.id === watchedOffice)) {
      setValue("office_id", "");
    }
  }, [filteredOffices, watchedOffice, setValue]);

  // Search patient by DNI
  const searchPatientByDni = useCallback(async (dni: string) => {
    if (!dni || dni.trim().length < 3) return;
    setSearchingPatient(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("patients")
      .select("id, first_name, last_name, phone, email, birth_date, document_type, departamento, distrito, dni, is_recurring, organization_id")
      .eq("dni", dni.trim())
      .single();

    setSearchingPatient(false);
    setPatientSearched(true);

    if (data) {
      setFoundPatient(data as Patient);
      setValue("patient_id", data.id);
      setValue("patient_name", data.first_name);
      setValue("patient_last_name", data.last_name);
      setValue("patient_phone", data.phone ?? "");
      setPatientEmail(data.email ?? "");
      setPatientBirthDate(data.birth_date ?? "");
      if (data.document_type) setDocType(data.document_type as "DNI" | "CE" | "Pasaporte");
      setPatientDepartamento(data.departamento ?? "");
      setPatientDistrito(data.distrito ?? "");

      // Look up active treatment plans with pending unscheduled sessions
      const { data: planRows } = await supabase
        .from("treatment_plans")
        .select("id, title, total_sessions, treatment_sessions(id, session_number, status, appointment_id, service_id, session_price, treatment_plan_item_id, treatment_plan_items(services(id, name)))")
        .eq("patient_id", data.id)
        .eq("status", "active");
      const availableSessions: typeof activePlanSessions = [];
      for (const plan of (planRows as unknown as Array<{
        id: string;
        title: string;
        total_sessions: number | null;
        treatment_sessions: Array<{
          id: string;
          session_number: number;
          status: string;
          appointment_id: string | null;
          service_id: string | null;
          session_price: number | null;
          treatment_plan_item_id: string | null;
          treatment_plan_items?: { services?: { id: string; name: string } | null } | null;
        }>;
      }> | null) ?? []) {
        const pending = (plan.treatment_sessions || [])
          .filter((s) => s.status === "pending" && !s.appointment_id)
          .sort((a, b) => a.session_number - b.session_number);
        for (const s of pending) {
          availableSessions.push({
            session_id: s.id,
            plan_id: plan.id,
            plan_title: plan.title,
            session_number: s.session_number,
            total_sessions: plan.total_sessions ?? 0,
            service_id: s.service_id,
            session_price: s.session_price != null ? Number(s.session_price) : null,
            service_name: s.treatment_plan_items?.services?.name ?? null,
          });
        }
      }
      setActivePlanSessions(availableSessions);
      setSelectedPlanSessionId(null);
    } else {
      setFoundPatient(null);
      setValue("patient_id", "");
      setActivePlanSessions([]);
      setSelectedPlanSessionId(null);
    }
  }, [setValue]);

  const checkConflicts = () => {
    if (!watchedDate || !watchedStartTime || !endTime) return null;

    // Check if appointment is outside org schedule hours
    const startHourStr = `${String(scheduleStartHour).padStart(2, "0")}:00`;
    const endHourStr = `${String(scheduleEndHour).padStart(2, "0")}:00`;
    if (watchedStartTime < startHourStr || endTime > endHourStr) {
      return language === "es"
        ? `Fuera del horario de atención (${startHourStr} - ${endHourStr}). Ajusta la hora.`
        : `Outside business hours (${startHourStr} - ${endHourStr}). Adjust the time.`;
    }

    // Check schedule blocks (time blocks that prevent appointments)
    const blockConflict = blocks.find((b) => {
      if (b.block_date !== watchedDate) return false;
      if (b.office_id && b.office_id !== watchedOffice) return false;
      if (b.all_day) return true;
      const bStart = b.start_time?.slice(0, 5) ?? "00:00";
      const bEnd = b.end_time?.slice(0, 5) ?? "23:59";
      return watchedStartTime < bEnd && endTime > bStart;
    });

    if (blockConflict) {
      return language === "es"
        ? "Este horario está bloqueado. Selecciona otro horario o consultorio."
        : "This time slot is blocked. Select another time or office.";
    }

    const officeConflict = existingAppointments.find(
      (a) =>
        a.appointment_date === watchedDate &&
        a.office_id === watchedOffice &&
        a.start_time.slice(0, 5) < endTime &&
        a.end_time.slice(0, 5) > watchedStartTime
    );

    if (officeConflict) {
      return t("scheduler.conflict_error");
    }

    if (watchedDoctor) {
      const doctorConflict = existingAppointments.find(
        (a) =>
          a.appointment_date === watchedDate &&
          a.doctor_id === watchedDoctor &&
          a.office_id !== watchedOffice &&
          a.start_time.slice(0, 5) < endTime &&
          a.end_time.slice(0, 5) > watchedStartTime
      );

      if (doctorConflict) {
        return t("scheduler.conflict_doctor");
      }
    }

    return null;
  };

  const conflict = checkConflicts();

  const onSubmit = async (values: AppointmentFormData) => {
    if (conflict) {
      toast.error(conflict);
      return;
    }
    if (doctorDayError) {
      toast.error("El doctor no atiende en el día seleccionado");
      return;
    }

    const officeConflict = existingAppointments.find(
      (a) =>
        a.appointment_date === values.appointment_date &&
        a.office_id === values.office_id &&
        a.start_time.slice(0, 5) < endTime &&
        a.end_time.slice(0, 5) > values.start_time
    );

    if (officeConflict) {
      toast.error(t("scheduler.conflict_error"));
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: { user: currentUser } } = await supabase.auth.getUser();

    // Build full name for appointment record
    const fullName = `${values.patient_name.trim()} ${values.patient_last_name.trim()}`.trim();

    // Auto-create patient if DNI provided but not found
    let patientId = values.patient_id || null;
    if (!patientId && values.patient_dni && values.patient_dni.trim()) {
      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({
          dni: values.patient_dni.trim(),
          document_type: docType,
          first_name: values.patient_name.trim(),
          last_name: values.patient_last_name.trim(),
          phone: values.patient_phone || null,
          email: patientEmail || null,
          birth_date: patientBirthDate || null,
          departamento: patientDepartamento || null,
          distrito: patientDistrito || null,
          organization_id: organizationId,
          created_by: currentUser?.id ?? null,
        })
        .select()
        .single();

      if (patientError) {
        // If DNI already exists, try to find the patient
        if (patientError.code === "23505") {
          const { data: existingPatient } = await supabase
            .from("patients")
            .select("id")
            .eq("dni", values.patient_dni.trim())
            .single();
          if (existingPatient) patientId = existingPatient.id;
        }
      } else if (newPatient) {
        patientId = newPatient.id;
      }
    }

    // Update birth_date for found patient if they didn't have one
    if (patientId && patientBirthDate && foundPatient && !foundPatient.birth_date) {
      await supabase
        .from("patients")
        .update({ birth_date: patientBirthDate })
        .eq("id", patientId);
    }

    // Update departamento/distrito for found patient if they didn't have them
    if (patientId && foundPatient) {
      const updates: Record<string, string> = {};
      if (patientDepartamento && !foundPatient.departamento) updates.departamento = patientDepartamento;
      if (patientDistrito && !foundPatient.distrito) updates.distrito = patientDistrito;
      if (Object.keys(updates).length > 0) {
        await supabase.from("patients").update(updates).eq("id", patientId);
      }
    }

    // Capture service price at appointment creation time. If the cita is
    // linked to a treatment plan session, use that session's snapshot price
    // so the budget math stays consistent even if service.base_price moves.
    const planSession = activePlanSessions.find(
      (s) => s.session_id === selectedPlanSessionId
    );
    const serviceForPrice = services.find((s) => s.id === values.service_id);
    const priceSnapshot =
      planSession?.session_price != null
        ? Number(planSession.session_price)
        : serviceForPrice
          ? Number(serviceForPrice.base_price)
          : null;

    const { data: newAppt, error } = await supabase
      .from("appointments")
      .insert({
        patient_name: fullName,
        patient_phone: values.patient_phone || null,
        patient_id: patientId,
        doctor_id: values.doctor_id,
        office_id: values.office_id,
        service_id: values.service_id,
        appointment_date: values.appointment_date,
        start_time: values.start_time,
        end_time: endTime,
        status: values.status,
        origin: values.origin || null,
        payment_method: values.payment_method || null,
        responsible: values.responsible || null,
        responsible_user_id: lookupResponsibles.find((r) => r.label === values.responsible)?.user_id || null,
        notes: values.notes || null,
        meeting_url: values.meeting_url || null,
        price_snapshot: priceSnapshot,
        treatment_session_id: planSession?.session_id ?? null,
        organization_id: organizationId,
      } as Record<string, unknown>)
      .select("id")
      .single();

    // If we linked to a plan session, mirror the link on the session row too
    // (1:1 bidirectional). Done after the appointment insert succeeds.
    if (!error && newAppt && planSession) {
      await supabase
        .from("treatment_sessions")
        .update({ appointment_id: newAppt.id })
        .eq("id", planSession.session_id);
    }

    // Register advance deposit if configured
    if (!error && newAppt && depositEnabled && Number(depositAmount) > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: payError } = await supabase
        .from("patient_payments")
        .insert({
          patient_id: patientId || null,
          appointment_id: newAppt.id,
          amount: Number(depositAmount),
          payment_method: depositMethod || null,
          notes: depositRef ? `Anticipo — ${depositRef}` : "Anticipo",
          payment_date: new Date().toISOString().split("T")[0],
          organization_id: organizationId,
        } as any);

      if (payError) {
        toast.error("Cita creada, pero error al registrar anticipo: " + (payError.message || JSON.stringify(payError)));
      } else {
        // Notification: payment registered at appointment creation
        supabase.from("notifications").insert({
          organization_id: organizationId,
          type: "payment_received",
          title: "Pago registrado",
          body: `S/. ${Number(depositAmount).toFixed(2)} — ${fullName}`,
          action_url: `/scheduler`,
        }).then(({ error: nErr }) => { if (nErr) console.error("[Notification] insert error:", nErr); });
      }
    }

    setSaving(false);

    if (error) {
      toast.error(t("scheduler.save_error") + ": " + error.message);
      return;
    }

    // Notification: new appointment created
    if (newAppt) {
      const doctor = doctors.find((d) => d.id === values.doctor_id);
      supabase.from("notifications").insert({
        organization_id: organizationId,
        type: "appointment_created",
        title: "Nueva cita agendada",
        body: `${fullName} — ${values.appointment_date} ${values.start_time?.slice(0, 5)}${doctor ? ` · ${doctor.full_name}` : ""}`,
        action_url: `/scheduler`,
      }).then(({ error: nErr }) => { if (nErr) console.error("[Notification] insert error:", nErr); });
    }

    // Send appointment confirmation email to patient
    if (newAppt) {
      const isVirtual = isVirtualService && values.meeting_url;
      sendNotification({
        type: isVirtual ? "appointment_confirmation_virtual" : "appointment_confirmation",
        appointment_id: newAppt.id,
        extra_variables: {
          ...(patientEmail ? { patient_email: patientEmail } : {}),
          ...(values.meeting_url ? { "{{link_reunion}}": values.meeting_url } : {}),
        },
      });
    }

    toast.success(t("scheduler.save_success"));

    // Check if WhatsApp clipboard modal is enabled
    const waConfig = loadWaClipboardConfig();
    if (waConfig.enabled) {
      const doctor = doctors.find((d) => d.id === values.doctor_id);
      const service = services.find((s) => s.id === values.service_id);
      // Format date to dd/mm/yyyy
      const [y, m, d] = values.appointment_date.split("-");
      const formattedDate = `${d}/${m}/${y}`;
      setWaVariables({
        patientName: fullName,
        date: formattedDate,
        time: values.start_time,
        doctorName: doctor?.full_name ?? "",
        serviceName: service?.name ?? "",
        clinicName: organizationName,
        clinicAddress: organizationAddress,
      });
      setShowWaModal(true);
    } else {
      onSaved();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl max-h-[95vh] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 md:px-6 py-3 md:py-4">
          <h3 className="text-lg font-semibold">{t("scheduler.new_appointment")}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="max-h-[70vh] overflow-y-auto px-4 md:px-6 py-4 space-y-4"
        >
          {/* Conflict warning */}
          {conflict && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {conflict}
            </div>
          )}

          {/* DNI Search with document type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("scheduler.patient_dni")}</label>
            <div className="flex gap-2">
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as "DNI" | "CE" | "Pasaporte")}
                className="w-[80px] sm:w-[100px] shrink-0 rounded-lg border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="DNI">DNI</option>
                <option value="CE">CE</option>
                <option value="Pasaporte">Pasaporte</option>
              </select>
              <input
                {...register("patient_dni")}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="12345678"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchPatientByDni(watch("patient_dni") ?? "");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => searchPatientByDni(watch("patient_dni") ?? "")}
                disabled={searchingPatient}
                className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {searchingPatient ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </button>
            </div>
            {/* Patient search result indicator */}
            {patientSearched && (
              <div className={`flex items-center gap-1.5 text-xs ${foundPatient ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`}>
                {foundPatient ? (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    {t("patients.patient_found")}: {foundPatient.first_name} {foundPatient.last_name}
                    {(foundPatient as { is_recurring?: boolean }).is_recurring && (
                      <RecurringBadge size="xs" />
                    )}
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    {t("patients.patient_new")}
                  </>
                )}
              </div>
            )}

            {/* Treatment plan linking banner — only when patient has pending sessions */}
            {foundPatient && activePlanSessions.length > 0 && (
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
                    🔗 Este paciente tiene un plan activo
                  </div>
                  {selectedPlanSessionId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlanSessionId(null);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Desvincular
                    </button>
                  )}
                </div>

                {(() => {
                  // Group by plan and pick the next pending session per plan for the quick action
                  const plans = new Map<string, { title: string; total: number; next: typeof activePlanSessions[number] }>();
                  for (const s of activePlanSessions) {
                    if (!plans.has(s.plan_id)) {
                      plans.set(s.plan_id, { title: s.plan_title, total: s.total_sessions, next: s });
                    }
                  }
                  const planList = Array.from(plans.values());
                  const selected = activePlanSessions.find((s) => s.session_id === selectedPlanSessionId);

                  return (
                    <>
                      {planList.map((p) => (
                        <div
                          key={p.next.plan_id}
                          className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate">
                              {p.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Sesión {p.next.session_number}
                              {p.total > 0 ? ` de ${p.total}` : ""}
                              {p.next.service_name ? ` · ${p.next.service_name}` : ""}
                              {p.next.session_price != null
                                ? ` · S/ ${Number(p.next.session_price).toFixed(2)}`
                                : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPlanSessionId(p.next.session_id);
                              if (p.next.service_id) {
                                setValue("service_id", p.next.service_id);
                              }
                            }}
                            className={cn(
                              "shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                              selectedPlanSessionId === p.next.session_id
                                ? "bg-blue-600 text-white"
                                : "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 dark:text-blue-400"
                            )}
                          >
                            {selectedPlanSessionId === p.next.session_id
                              ? "✓ Vinculada"
                              : "Agendar sesión"}
                          </button>
                        </div>
                      ))}

                      {selected && (
                        <p className="text-[10px] text-blue-700 dark:text-blue-400">
                          Esta cita se vinculará a la sesión {selected.session_number} del plan “{selected.plan_title}”.
                          El servicio y precio se tomarán automáticamente.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Patient Name & Last Name */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.first_name")} *</label>
              <input
                {...register("patient_name")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="Juan"
              />
              {errors.patient_name && (
                <p className="text-xs text-destructive">{errors.patient_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.last_name")} *</label>
              <input
                {...register("patient_last_name")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="Pérez"
              />
              {errors.patient_last_name && (
                <p className="text-xs text-destructive">{errors.patient_last_name.message}</p>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("scheduler.patient_phone")}</label>
            <input
              {...register("patient_phone")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="+51 999 999 999"
            />
          </div>

          {/* Email & Fecha de nacimiento */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="paciente@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Fecha de nacimiento</label>
              <input
                type="date"
                value={patientBirthDate}
                onChange={(e) => setPatientBirthDate(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Departamento & Distrito */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Departamento</label>
              <select
                value={patientDepartamento}
                onChange={(e) => {
                  setPatientDepartamento(e.target.value);
                  setPatientDistrito("");
                }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">-- Departamento --</option>
                {PERU_DEPARTAMENTO_LIST.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Distrito</label>
              <select
                value={patientDistrito}
                onChange={(e) => setPatientDistrito(e.target.value)}
                disabled={!patientDepartamento}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <option value="">-- Distrito --</option>
                {(PERU_DEPARTAMENTOS[patientDepartamento] ?? []).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Hidden patient_id */}
          <input type="hidden" {...register("patient_id")} />

          {/* Date & Time */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <div className="space-y-1.5 col-span-2 md:col-span-1">
              <label className="text-sm font-medium">{t("scheduler.date")} *</label>
              <input
                type="date"
                {...register("appointment_date")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {errors.appointment_date && (
                <p className="text-xs text-destructive">{errors.appointment_date.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.time")} *</label>
              <input
                type="time"
                step="900"
                {...register("start_time")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
              {errors.start_time && (
                <p className="text-xs text-destructive">{errors.start_time.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("schedule.end_time")}</label>
              <input
                type="time"
                value={endTime}
                disabled
                className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">{duration} {t("common.minutes_short")}</p>
            </div>
          </div>

          {/* Doctor schedule alert */}
          {doctorDayError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">El doctor no atiende este día</p>
                {doctorAvailableDays.length > 0 && (
                  <p className="text-xs mt-0.5 text-destructive/80">
                    Días disponibles: {doctorAvailableDays.join(", ")}
                  </p>
                )}
                {doctorAvailableDays.length === 0 && (
                  <p className="text-xs mt-0.5 text-destructive/80">
                    No tiene días de atención configurados
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Doctor schedule info (valid day) */}
          {!doctorDayError && doctorScheduleForDay && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Horario del doctor: {doctorScheduleForDay.start_time.slice(0, 5)} — {doctorScheduleForDay.end_time.slice(0, 5)}
            </div>
          )}

          {/* Doctor, Office, Service */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.doctor")} *</label>
              <select
                {...register("doctor_id")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">-- {t("scheduler.doctor")} --</option>
                {availableDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
              {errors.doctor_id && (
                <p className="text-xs text-destructive">{errors.doctor_id.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.office")} *</label>
              <select
                {...register("office_id")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">-- {t("scheduler.office")} --</option>
                {filteredOffices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {errors.office_id && (
                <p className="text-xs text-destructive">{errors.office_id.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("scheduler.service")} *</label>
            <select
              {...register("service_id")}
              disabled={!watchedDoctor}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {!watchedDoctor ? (
                <option value="">— Primero selecciona un doctor —</option>
              ) : filteredServices.length === 0 ? (
                <option value="">— Sin servicios asignados —</option>
              ) : (
                <>
                  <option value="">-- {t("scheduler.service")} --</option>
                  {filteredServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} {t("common.minutes_short")}) — S/. {Number(s.base_price).toFixed(2)}
                    </option>
                  ))}
                </>
              )}
            </select>
            {errors.service_id && (
              <p className="text-xs text-destructive">{errors.service_id.message}</p>
            )}
          </div>

          {/* Meeting URL — shown when virtual service selected */}
          {isVirtualService && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <ZoomIcon className="h-4 w-4" />
                Link de reunión (Zoom / Meet)
              </label>
              <input
                {...register("meeting_url")}
                type="url"
                placeholder="https://zoom.us/j/1234567890"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-colors"
              />
              {errors.meeting_url && (
                <p className="text-xs text-destructive">{errors.meeting_url.message}</p>
              )}
              {watch("meeting_url") && (
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Video className="h-3 w-3" />
                  Este link se enviará al paciente por correo
                </p>
              )}
            </div>
          )}

          {/* Anticipo / Reserva anticipada */}
          {servicePrice > 0 && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
              {/* Price + toggle row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Total servicio</span>
                </div>
                <span className="text-base font-bold text-primary">
                  S/. {servicePrice.toFixed(2)}
                </span>
              </div>

              {/* Toggle */}
              <button
                type="button"
                onClick={() => setDepositEnabled((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Banknote className="h-4 w-4" />
                  Registrar anticipo (reserva)
                </span>
                <div
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    depositEnabled ? "bg-primary" : "bg-muted"
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                      depositEnabled && "translate-x-4"
                    )}
                  />
                </div>
              </button>

              {depositEnabled && (
                <div className="space-y-3">
                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Monto del anticipo
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">S/.</span>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        min="0"
                        max={servicePrice}
                        step="0.50"
                        className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setDepositAmount((servicePrice * 0.5).toFixed(2))}
                        className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositAmount(servicePrice.toFixed(2))}
                        className="rounded-lg bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors"
                      >
                        100%
                      </button>
                    </div>
                  </div>

                  {/* Payment method chips */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Método de pago
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {lookupPayments.map((pm) => {
                        const Icon = getPaymentIcon(pm.icon);
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => {
                              const next = depositMethod === pm.label ? "" : pm.label;
                              setDepositMethod(next);
                              setValue("payment_method", next);
                            }}
                            className={cn(
                              "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium transition-all",
                              depositMethod === pm.label
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
                            )}
                          >
                            <Icon className="h-3 w-3" />
                            {pm.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reference */}
                  <input
                    type="text"
                    value={depositRef}
                    onChange={(e) => setDepositRef(e.target.value)}
                    placeholder="Nro. operación o referencia (opcional)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />

                  {/* Summary */}
                  {Number(depositAmount) > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        Pendiente al día de la cita
                      </span>
                      <span className="font-bold text-amber-700 dark:text-amber-400">
                        S/. {Math.max(0, servicePrice - Number(depositAmount)).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lookups: Origin, Payment, Responsible */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.origin")}</label>
              <select
                {...register("origin")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">--</option>
                {lookupOrigins.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.payment_method")}</label>
              <select
                {...register("payment_method")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">--</option>
                {lookupPayments.map((p) => (
                  <option key={p.id} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.responsible")}</label>
              <select
                {...register("responsible")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="">--</option>
                {lookupResponsibles.map((r) => (
                  <option key={r.id} value={r.label}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("scheduler.notes")}</label>
            <textarea
              {...register("notes")}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
              placeholder="Observaciones..."
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-4 md:px-6 py-3 md:py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={saving || !!conflict || doctorDayError}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </div>

      {/* WhatsApp clipboard modal */}
      {waVariables && (
        <WhatsAppClipboardModal
          open={showWaModal}
          variables={waVariables}
          onClose={() => {
            setShowWaModal(false);
            onSaved();
          }}
        />
      )}
    </div>
  );
}
