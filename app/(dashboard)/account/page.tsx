"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";

export default function AccountPage() {
  const { user, loading: userLoading } = useUser();
  const { t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const profileSchema = z.object({
    full_name: z
      .string()
      .min(2, t("validation.name_min"))
      .max(100, t("validation.name_max")),
    phone: z
      .string()
      .max(20, t("validation.phone_max"))
      .optional()
      .or(z.literal("")),
  });

  type ProfileFormData = z.infer<typeof profileSchema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: "", phone: "" },
  });

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .single();

      reset({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        phone: data?.phone ?? "",
      });
      setProfileLoaded(true);
    };

    fetchProfile();
  }, [user, reset]);

  const onSubmit = async (values: ProfileFormData) => {
    if (!user) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("user_profiles")
      .upsert({
        id: user.id,
        full_name: values.full_name,
        phone: values.phone || null,
      });

    setSaving(false);

    if (error) {
      console.error("Error updating profile:", error.message);
      toast.error(t("account.save_error"));
      return;
    }

    toast.success(t("account.save_success"));
    reset(values);
  };

  if (userLoading || !profileLoaded) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="max-w-2xl space-y-4">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("account.title")}</h1>
        <p className="text-muted-foreground">{t("account.subtitle")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Info de solo lectura */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs font-mono text-muted-foreground">{user?.id}</p>
            </div>
          </div>
        </div>

        {/* Formulario de datos personales */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-xl border border-border bg-card p-6 space-y-5"
        >
          <h2 className="text-lg font-semibold">{t("account.personal_data")}</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="full_name">
              {t("account.full_name")}
            </label>
            <input
              id="full_name"
              type="text"
              placeholder={t("account.full_name_placeholder")}
              {...register("full_name")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="phone">
              {t("account.phone")}
            </label>
            <input
              id="phone"
              type="tel"
              placeholder={t("account.phone_placeholder")}
              {...register("phone")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !isDirty}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("account.saving") : t("account.save")}
          </button>
        </form>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/30 bg-card p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">
            {t("account.danger_zone")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("account.danger_description")}
          </p>
          <button className="rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            {t("account.delete_account")}
          </button>
        </div>
      </div>
    </div>
  );
}
