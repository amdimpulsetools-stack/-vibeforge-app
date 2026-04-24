"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { patientSchema, type PatientFormData } from "@/lib/validations/patient";
import { X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useOrganization } from "@/components/organization-provider";
import { PERU_DEPARTAMENTOS, PERU_DEPARTAMENTO_LIST, COUNTRIES } from "@/lib/peru-locations";

interface PatientFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function PatientFormModal({ onClose, onSaved }: PatientFormModalProps) {
  const { t } = useLanguage();
  const { organizationId } = useOrganization();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      dni: "",
      document_type: "DNI",
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      birth_date: "",
      departamento: "",
      distrito: "",
      is_foreigner: false,
      nationality: "",
      status: "active",
      origin: "",
      custom_field_1: "",
      custom_field_2: "",
      referral_source: "",
      notes: "",
    },
  });

  const watchedDepartamento = watch("departamento");
  const watchedIsForeigner = watch("is_foreigner");

  const distritos = useMemo(() => {
    if (!watchedDepartamento) return [];
    return PERU_DEPARTAMENTOS[watchedDepartamento] ?? [];
  }, [watchedDepartamento]);

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  const onSubmit = async (values: PatientFormData) => {
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: newPatient, error } = await supabase
      .from("patients")
      .insert({
        organization_id: organizationId,
        created_by: user?.id ?? null,
        dni: values.dni || null,
        document_type: values.document_type,
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone || null,
        email: values.email || null,
        birth_date: values.birth_date || null,
        departamento: values.is_foreigner ? null : (values.departamento || null),
        distrito: values.is_foreigner ? null : (values.distrito || null),
        is_foreigner: values.is_foreigner,
        nationality: values.is_foreigner ? (values.nationality || null) : null,
        status: values.status,
        origin: values.origin || null,
        custom_field_1: values.custom_field_1 || null,
        custom_field_2: values.custom_field_2 || null,
        referral_source: values.referral_source || null,
        notes: values.notes || null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("DNI ya existe en el sistema");
      } else {
        toast.error(t("patients.save_error") + ": " + error.message);
      }
      return;
    }

    // In-app notification for new patient
    supabase.from("notifications").insert({
      organization_id: organizationId,
      type: "info",
      title: "Nuevo paciente registrado",
      body: `${values.first_name} ${values.last_name}`,
      action_url: "/patients",
    }).then(({ error: nErr }) => {
      if (nErr) console.error("[Notification] insert error:", nErr);
    });

    // Send welcome email (fire and forget, only if patient has email)
    if (newPatient?.id && values.email) {
      fetch("/api/notifications/send-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "patient_welcome", patient_id: newPatient.id }),
      }).catch((err) => console.error("[Welcome email]", err));
    }

    toast.success(t("patients.save_success"));
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full max-w-lg max-h-[95vh] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
        <DialogDescription className="sr-only">{t("patients.add")}</DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 md:px-6 py-3 md:py-4">
          <DialogTitle className="text-lg font-semibold">{t("patients.add")}</DialogTitle>
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
          className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4"
        >
          {/* Document type + DNI */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("patients.dni")}</label>
            <div className="flex gap-2">
              <select
                {...register("document_type")}
                className="w-[110px] shrink-0 rounded-lg border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                <option value="DNI">DNI</option>
                <option value="CE">CE</option>
                <option value="Pasaporte">Pasaporte</option>
              </select>
              <input
                {...register("dni")}
                className={`flex-1 ${inputClass.replace("w-full ", "")}`}
                placeholder="12345678"
              />
            </div>
            {errors.dni && (
              <p className="text-xs text-destructive">{errors.dni.message}</p>
            )}
          </div>

          {/* Names */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.first_name")} *</label>
              <input
                {...register("first_name")}
                className={inputClass}
                placeholder="Juan"
              />
              {errors.first_name && (
                <p className="text-xs text-destructive">{errors.first_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.last_name")} *</label>
              <input
                {...register("last_name")}
                className={inputClass}
                placeholder="Pérez"
              />
              {errors.last_name && (
                <p className="text-xs text-destructive">{errors.last_name.message}</p>
              )}
            </div>
          </div>

          {/* Fecha de nacimiento */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fecha de nacimiento</label>
            <input
              type="date"
              {...register("birth_date")}
              className={inputClass}
            />
          </div>

          {/* Phone & Email */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.phone")}</label>
              <input
                {...register("phone")}
                className={inputClass}
                placeholder="+51 999 999 999"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.email")}</label>
              <input
                {...register("email")}
                type="email"
                className={inputClass}
                placeholder="paciente@email.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          {/* Extranjero checkbox */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_foreigner"
              {...register("is_foreigner")}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary/50"
            />
            <label htmlFor="is_foreigner" className="text-sm font-medium cursor-pointer">
              Extranjero
            </label>
          </div>

          {/* Foreigner: Country select */}
          {watchedIsForeigner && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">País de origen</label>
              <select
                {...register("nationality")}
                className={inputClass}
              >
                <option value="">-- Seleccionar país --</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Departamento & Distrito (only for non-foreigners) */}
          {!watchedIsForeigner && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Departamento</label>
                <select
                  {...register("departamento")}
                  onChange={(e) => {
                    setValue("departamento", e.target.value);
                    setValue("distrito", "");
                  }}
                  className={inputClass}
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
                  {...register("distrito")}
                  disabled={!watchedDepartamento}
                  className={`${inputClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <option value="">-- Distrito --</option>
                  {distritos.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("patients.notes")}</label>
            <textarea
              {...register("notes")}
              rows={2}
              className={`${inputClass} resize-none`}
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
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
