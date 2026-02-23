"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
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
import { X, Loader2, AlertTriangle, Search, UserCheck, UserPlus, CheckCircle2 } from "lucide-react";

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
  doctorSchedules: Pick<DoctorSchedule, "doctor_id" | "day_of_week" | "start_time" | "end_time">[];
  lookupOrigins: LookupValue[];
  lookupPayments: LookupValue[];
  lookupResponsibles: LookupValue[];
  existingAppointments: AppointmentWithRelations[];
  organizationId: string;
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
  organizationId,
  onClose,
  onSaved,
}: AppointmentFormModalProps) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [foundPatient, setFoundPatient] = useState<Patient | null>(null);
  const [patientSearched, setPatientSearched] = useState(false);

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
      patient_phone: "",
      patient_dni: "",
      patient_id: "",
      doctor_id: "",
      office_id: defaults?.officeId ?? "",
      service_id: "",
      appointment_date: defaults?.date ?? "",
      start_time: defaults?.startTime ?? "",
      status: "scheduled",
      origin: "",
      payment_method: "",
      responsible: "",
      notes: "",
    },
  });

  const selectedServiceId = watch("service_id");
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const duration = selectedService?.duration_minutes ?? 30;

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

  // Search patient by DNI
  const searchPatientByDni = useCallback(async (dni: string) => {
    if (!dni || dni.trim().length < 3) return;
    setSearchingPatient(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("patients")
      .select("*")
      .eq("dni", dni.trim())
      .single();

    setSearchingPatient(false);
    setPatientSearched(true);

    if (data) {
      setFoundPatient(data as Patient);
      setValue("patient_id", data.id);
      setValue("patient_name", `${data.first_name} ${data.last_name}`);
      setValue("patient_phone", data.phone ?? "");
    } else {
      setFoundPatient(null);
      setValue("patient_id", "");
    }
  }, [setValue]);

  const checkConflicts = () => {
    if (!watchedDate || !watchedStartTime || !endTime) return null;

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

    // Auto-create patient if DNI provided but not found
    let patientId = values.patient_id || null;
    if (!patientId && values.patient_dni && values.patient_dni.trim()) {
      const nameParts = values.patient_name.trim().split(" ");
      const firstName = nameParts[0] || values.patient_name;
      const lastName = nameParts.slice(1).join(" ") || "-";

      const { data: newPatient, error: patientError } = await supabase
        .from("patients")
        .insert({
          dni: values.patient_dni.trim(),
          first_name: firstName,
          last_name: lastName,
          phone: values.patient_phone || null,
          organization_id: organizationId,
        })
        .select()
        .single();

      if (patientError) {
        // If DNI already exists, try to find the patient
        if (patientError.code === "23505") {
          const { data: existingPatient } = await supabase
            .from("patients")
            .select("*")
            .eq("dni", values.patient_dni.trim())
            .single();
          if (existingPatient) patientId = existingPatient.id;
        }
      } else if (newPatient) {
        patientId = newPatient.id;
      }
    }

    // Capture service price at appointment creation time
    const serviceForPrice = services.find((s) => s.id === values.service_id);
    const priceSnapshot = serviceForPrice ? Number(serviceForPrice.base_price) : null;

    const { error } = await supabase.from("appointments").insert({
      patient_name: values.patient_name,
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
      notes: values.notes || null,
      price_snapshot: priceSnapshot,
      organization_id: organizationId,
    });

    setSaving(false);

    if (error) {
      toast.error(t("scheduler.save_error") + ": " + error.message);
      return;
    }

    toast.success(t("scheduler.save_success"));
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
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
          className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4"
        >
          {/* Conflict warning */}
          {conflict && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {conflict}
            </div>
          )}

          {/* DNI Search */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("scheduler.patient_dni")}</label>
            <div className="flex gap-2">
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
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    {t("patients.patient_new")}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Patient Name & Phone */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.patient_name")} *</label>
              <input
                {...register("patient_name")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="Juan Pérez"
              />
              {errors.patient_name && (
                <p className="text-xs text-destructive">{errors.patient_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("scheduler.patient_phone")}</label>
              <input
                {...register("patient_phone")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="+51 999 999 999"
              />
            </div>
          </div>

          {/* Hidden patient_id */}
          <input type="hidden" {...register("patient_id")} />

          {/* Date & Time */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
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
                step="1800"
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
                {doctors.map((d) => (
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
                {offices.map((o) => (
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
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={saving || !!conflict?.includes("Conflicto") || doctorDayError}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
