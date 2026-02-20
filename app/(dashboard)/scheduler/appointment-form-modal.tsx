"use client";

import { useState, useMemo } from "react";
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
} from "@/types/admin";
import { X, Loader2, AlertTriangle } from "lucide-react";

interface AppointmentFormModalProps {
  defaults: {
    date?: string;
    startTime?: string;
    officeId?: string;
  } | null;
  offices: Office[];
  doctors: Doctor[];
  services: Service[];
  lookupOrigins: LookupValue[];
  lookupPayments: LookupValue[];
  lookupResponsibles: LookupValue[];
  existingAppointments: AppointmentWithRelations[];
  onClose: () => void;
  onSaved: () => void;
}

export function AppointmentFormModal({
  defaults,
  offices,
  doctors,
  services,
  lookupOrigins,
  lookupPayments,
  lookupResponsibles,
  existingAppointments,
  onClose,
  onSaved,
}: AppointmentFormModalProps) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      patient_name: "",
      patient_phone: "",
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

  // Calculate end_time based on start_time + service duration
  const watchedStartTime = watch("start_time");
  const endTime = useMemo(() => {
    if (!watchedStartTime) return "";
    const [h, m] = watchedStartTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + duration;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
  }, [watchedStartTime, duration]);

  // Check conflicts on form values
  const watchedDate = watch("appointment_date");
  const watchedOffice = watch("office_id");
  const watchedDoctor = watch("doctor_id");

  const checkConflicts = () => {
    if (!watchedDate || !watchedStartTime || !endTime) return null;

    // Check office conflict
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

    // Check doctor conflict (same doctor, different office, same time)
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
    // Block if office conflict
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

    const { error } = await supabase.from("appointments").insert({
      patient_name: values.patient_name,
      patient_phone: values.patient_phone || null,
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

          {/* Patient */}
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            >
              <option value="">-- {t("scheduler.service")} --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes} {t("common.minutes_short")}) — S/. {Number(s.base_price).toFixed(2)}
                </option>
              ))}
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
            disabled={saving || !!conflict?.includes("Conflicto")}
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
