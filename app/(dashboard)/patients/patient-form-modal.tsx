"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { patientSchema, type PatientFormData } from "@/lib/validations/patient";
import { X, Loader2 } from "lucide-react";

interface PatientFormModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function PatientFormModal({ onClose, onSaved }: PatientFormModalProps) {
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      dni: "",
      first_name: "",
      last_name: "",
      phone: "",
      email: "",
      status: "active",
      origin: "",
      adicional_1: "",
      adicional_2: "",
      viene_desde: "",
      notes: "",
    },
  });

  const onSubmit = async (values: PatientFormData) => {
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from("patients").insert({
      dni: values.dni || null,
      first_name: values.first_name,
      last_name: values.last_name,
      phone: values.phone || null,
      email: values.email || null,
      status: values.status,
      origin: values.origin || null,
      adicional_1: values.adicional_1 || null,
      adicional_2: values.adicional_2 || null,
      viene_desde: values.viene_desde || null,
      notes: values.notes || null,
    });

    setSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("DNI ya existe en el sistema");
      } else {
        toast.error(t("patients.save_error") + ": " + error.message);
      }
      return;
    }

    toast.success(t("patients.save_success"));
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-lg font-semibold">{t("patients.add")}</h3>
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
          {/* DNI */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("patients.dni")}</label>
            <input
              {...register("dni")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="12345678"
            />
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
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="Pérez"
              />
              {errors.last_name && (
                <p className="text-xs text-destructive">{errors.last_name.message}</p>
              )}
            </div>
          </div>

          {/* Phone & Email */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.phone")}</label>
              <input
                {...register("phone")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="+51 999 999 999"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("patients.email")}</label>
              <input
                {...register("email")}
                type="email"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="paciente@email.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          {/* Origin & Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("patients.notes")}</label>
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
            disabled={saving}
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
