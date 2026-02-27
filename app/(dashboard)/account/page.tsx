"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useLanguage } from "@/components/language-provider";
import { getInitials } from "@/lib/utils";
import {
  profileSchema,
  passwordSchema,
  PROFESSIONAL_TITLES,
  type ProfileFormData,
  type PasswordFormData,
  type ProfessionalTitle,
} from "@/lib/validations/account";
import { usePlan } from "@/hooks/use-plan";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2,
  User,
  Camera,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Crown,
  Rocket,
  CalendarDays,
  Users,
  Stethoscope,
  Building2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const PLAN_ICONS: Record<string, typeof Zap> = {
  starter: Zap,
  professional: Rocket,
  enterprise: Crown,
};

const PLAN_BADGE: Record<string, string> = {
  starter: "bg-emerald-500/10 text-emerald-500",
  professional: "bg-blue-500/10 text-blue-500",
  enterprise: "bg-amber-500/10 text-amber-500",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Activo", color: "bg-emerald-500/10 text-emerald-500" },
  trialing: { label: "Prueba gratuita", color: "bg-blue-500/10 text-blue-500" },
  past_due: { label: "Pago pendiente", color: "bg-amber-500/10 text-amber-500" },
  cancelled: { label: "Cancelado", color: "bg-muted text-muted-foreground" },
  expired: { label: "Expirado", color: "bg-destructive/10 text-destructive" },
};

export default function AccountPage() {
  const { user, loading: userLoading } = useUser();
  const { t } = useLanguage();
  const { plan, subscription, usage, daysRemaining, loading: planLoading } = usePlan();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Profile form
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: "", phone: "", professional_title: null },
  });

  const currentTitle = watch("professional_title");

  // Password form
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const {
    register: registerPwd,
    handleSubmit: handleSubmitPwd,
    reset: resetPwd,
    formState: { errors: errorsPwd },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { new_password: "", confirm_password: "" },
  });

  // Avatar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("user_profiles")
        .select("full_name, phone, avatar_url, professional_title")
        .eq("id", user.id)
        .single();

      reset({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        phone: data?.phone ?? "",
        professional_title: (data?.professional_title as ProfessionalTitle) ?? null,
      });
      setAvatarUrl(data?.avatar_url ?? null);
      setProfileLoaded(true);
    };

    fetchProfile();
  }, [user, reset]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Max 2MB");
      return;
    }

    setUploadingAvatar(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      console.error("Avatar upload error:", uploadError);
      toast.error(uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const url = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);

    setUploadingAvatar(false);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    setAvatarUrl(url);
    toast.success(t("account.save_success"));
  };

  const handleAvatarRemove = async () => {
    if (!user) return;

    setUploadingAvatar(true);
    const supabase = createClient();

    await supabase.storage
      .from("avatars")
      .remove([
        `${user.id}/avatar.jpg`,
        `${user.id}/avatar.png`,
        `${user.id}/avatar.webp`,
      ]);

    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);

    setUploadingAvatar(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setAvatarUrl(null);
    toast.success(t("account.save_success"));
  };

  const onSubmitProfile = async (values: ProfileFormData) => {
    if (!user) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from("user_profiles").upsert({
      id: user.id,
      full_name: values.full_name,
      phone: values.phone || null,
      professional_title: values.professional_title || null,
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

  const onSubmitPassword = async (values: PasswordFormData) => {
    setSavingPwd(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: values.new_password,
    });

    setSavingPwd(false);

    if (error) {
      console.error("Password update error:", error.message);
      toast.error(t("account.password_error") + ": " + error.message);
      return;
    }

    toast.success(t("account.password_updated"));
    resetPwd();
    setShowPwd(false);
  };

  const displayName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "";

  if (userLoading || !profileLoaded) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {t("account.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("account.subtitle")}</p>
      </div>

      {/* TOP ROW: User info + Plan — side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: Avatar + personal data form */}
        <form
          onSubmit={handleSubmit(onSubmitProfile)}
          className="rounded-2xl border border-border/60 bg-card p-6 space-y-5"
        >
          {/* Avatar */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover border-2 border-border"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold border-2 border-border">
                  {getInitials(displayName) || <User className="h-6 w-6" />}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="text-xs text-primary hover:underline"
                >
                  {t("account.upload_photo")}
                </button>
                {avatarUrl && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      disabled={uploadingAvatar}
                      className="text-xs text-destructive hover:underline"
                    >
                      {t("account.remove_photo")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <hr className="border-border/40" />

          {/* Personal data fields */}
          <h2 className="text-lg font-semibold">
            {t("account.personal_data")}
          </h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="full_name">
              {t("account.full_name")}
            </label>
            <input
              id="full_name"
              type="text"
              placeholder={t("account.full_name_placeholder")}
              {...register("full_name")}
              className="w-full rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">
                {errors.full_name.message}
              </p>
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
              className="w-full rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
            />
            {errors.phone && (
              <p className="text-xs text-destructive">
                {errors.phone.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !isDirty}
            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("account.saving") : t("account.save")}
          </button>
        </form>

        {/* RIGHT: Plan actual */}
        <div className="space-y-6">
          {!planLoading && plan && subscription && (
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const PlanIcon = PLAN_ICONS[plan.slug] ?? Zap;
                    return <PlanIcon className="h-5 w-5 text-primary" />;
                  })()}
                  <h2 className="text-lg font-semibold">Plan actual</h2>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    STATUS_LABELS[subscription.status]?.color ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {STATUS_LABELS[subscription.status]?.label ?? subscription.status}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold",
                    PLAN_BADGE[plan.slug] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {plan.name}
                </span>
                {plan.price_monthly > 0 && (
                  <span className="text-sm text-muted-foreground">
                    ${plan.price_monthly}/mes
                  </span>
                )}
                {plan.price_monthly === 0 && (
                  <span className="text-sm text-muted-foreground">Gratis</span>
                )}
              </div>

              {/* Days remaining */}
              {daysRemaining !== null && (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm",
                    daysRemaining <= 3
                      ? "bg-destructive/10 text-destructive"
                      : daysRemaining <= 7
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {daysRemaining <= 7 && <AlertTriangle className="h-4 w-4" />}
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    {daysRemaining === 0
                      ? "Tu plan vence hoy"
                      : daysRemaining === 1
                        ? "Tu plan vence manana"
                        : `${daysRemaining} dias restantes`}
                  </span>
                </div>
              )}

              {/* Usage summary */}
              {usage && (
                <div className="grid grid-cols-3 gap-3">
                  <UsageStat
                    icon={Users}
                    label="Miembros"
                    current={usage.members}
                    limit={plan.max_members}
                  />
                  <UsageStat
                    icon={Stethoscope}
                    label="Doctores"
                    current={usage.doctors}
                    limit={plan.max_doctors}
                  />
                  <UsageStat
                    icon={Building2}
                    label="Consultorios"
                    current={usage.offices}
                    limit={plan.max_offices}
                  />
                </div>
              )}

              {/* CHANGE PLAN BUTTON — eye-catching */}
              <a
                href="/plans"
                className="flex w-full items-center justify-center gap-2.5 rounded-xl gradient-warm px-5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl"
              >
                <Sparkles className="h-4 w-4" />
                Cambiar plan
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          )}

          {/* Password form */}
          <form
            onSubmit={handleSubmitPwd(onSubmitPassword)}
            className="rounded-2xl border border-border/60 bg-card p-6 space-y-5"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {t("account.change_password")}
              </h2>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new_password">
                {t("account.new_password")}
              </label>
              <div className="relative">
                <input
                  id="new_password"
                  type={showPwd ? "text" : "password"}
                  placeholder={t("account.password_min")}
                  {...registerPwd("new_password")}
                  className="w-full rounded-xl border border-input bg-background/50 px-4 py-2.5 pr-10 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errorsPwd.new_password && (
                <p className="text-xs text-destructive">
                  {errorsPwd.new_password.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="confirm_password">
                {t("account.confirm_password")}
              </label>
              <input
                id="confirm_password"
                type={showPwd ? "text" : "password"}
                placeholder={t("account.confirm_password")}
                {...registerPwd("confirm_password")}
                className="w-full rounded-xl border border-input bg-background/50 px-4 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
              />
              {errorsPwd.confirm_password && (
                <p className="text-xs text-destructive">
                  {errorsPwd.confirm_password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={savingPwd}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("account.change_password")}
            </button>
          </form>
        </div>
      </div>

      {/* Danger Zone — full width at bottom */}
      <div className="rounded-2xl border border-destructive/30 bg-card p-6">
        <h2 className="text-lg font-semibold text-destructive mb-2">
          {t("account.danger_zone")}
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("account.danger_description")}
        </p>
        <button className="rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
          {t("account.delete_account")}
        </button>
      </div>
    </div>
  );
}

function UsageStat({
  icon: Icon,
  label,
  current,
  limit,
}: {
  icon: typeof Users;
  label: string;
  current: number;
  limit: number | null;
}) {
  const pct = limit ? (current / limit) * 100 : 0;
  const isNear = limit !== null && pct >= 80;
  const isAt = limit !== null && current >= limit;

  return (
    <div className="rounded-xl border border-border/60 bg-background p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-lg font-bold", isAt && "text-destructive", isNear && !isAt && "text-amber-500")}>
          {current}
        </span>
        <span className="text-xs text-muted-foreground">
          / {limit ?? "\u221E"}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isAt ? "bg-destructive" : isNear ? "bg-amber-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
