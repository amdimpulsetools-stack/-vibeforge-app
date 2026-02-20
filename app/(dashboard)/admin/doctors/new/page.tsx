"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { doctorSchema, type DoctorFormData } from "@/lib/validations/doctor";
import { DOCTOR_COLORS } from "@/types/admin";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Check } from "lucide-react";

export default function NewDoctorPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DoctorFormData>({
    resolver: zodResolver(doctorSchema),
    defaultValues: {
      full_name: "",
      cmp: "",
      color: DOCTOR_COLORS[0].value,
      is_active: true,
    },
  });

  const selectedColor = watch("color");

  const onSubmit = async (values: DoctorFormData) => {
    setSaving(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("doctors")
      .insert({
        full_name: values.full_name,
        cmp: values.cmp,
        color: values.color,
        is_active: values.is_active,
      })
      .select("id")
      .single();

    if (error) {
      toast.error(t("doctors.save_error"));
      setSaving(false);
      return;
    }

    toast.success(t("doctors.save_success"));
    router.push(`/admin/doctors/${data.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/doctors"
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("doctors.add")}</h1>
          <p className="text-muted-foreground">{t("doctors.subtitle")}</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-w-2xl space-y-6"
      >
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-lg font-semibold">{t("doctors.profile_tab")}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("doctors.name")}</label>
              <input
                {...register("full_name")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="Dr. Juan Pérez"
              />
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("doctors.cmp")}</label>
              <input
                {...register("cmp")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="12345"
              />
              {errors.cmp && (
                <p className="text-xs text-destructive">{errors.cmp.message}</p>
              )}
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("doctors.color")}</label>
            <div className="flex flex-wrap gap-2">
              {DOCTOR_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setValue("color", c.value)}
                  className={cn(
                    "h-8 w-8 rounded-full border-2 transition-all",
                    selectedColor === c.value
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
            {errors.color && (
              <p className="text-xs text-destructive">{errors.color.message}</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("is_active")} className="rounded" />
            {t("doctors.active")}
          </label>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {t("common.save")}
          </button>
          <Link
            href="/admin/doctors"
            className="flex items-center gap-2 rounded-lg border border-border px-6 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
