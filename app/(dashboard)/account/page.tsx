"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { usePlan } from "@/hooks/use-plan";
import { getInitials } from "@/lib/utils";
import {
  profileSchema,
  passwordSchema,
  PROFESSIONAL_TITLES,
  type ProfileFormData,
  type PasswordFormData,
  type ProfessionalTitle,
} from "@/lib/validations/account";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Loader2,
  User,
  Camera,
  Lock,
  Eye,
  EyeOff,
  Crown,
  ShieldCheck,
  Building2,
  Stethoscope,
  Users,
  Zap,
  ArrowRight,
} from "lucide-react";

const ORG_ROLE_LABELS: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  owner: { label: "Propietario", color: "bg-amber-500/10 text-amber-500", icon: Crown },
  admin: { label: "Administrador", color: "bg-blue-500/10 text-blue-500", icon: ShieldCheck },
  receptionist: { label: "Recepcionista", color: "bg-emerald-500/10 text-emerald-500", icon: Users },
  doctor: { label: "Doctor", color: "bg-purple-500/10 text-purple-500", icon: Stethoscope },
};

export default function AccountPage() {
  const { user, loading: userLoading } = useUser();
  const { t } = useLanguage();
  const { organization, orgRole, isOrgAdmin } = useOrganization();
  const { plan, subscription, daysRemaining, loading: planLoading } = usePlan();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [platformRole, setPlatformRole] = useState<string | null>(null);

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
        .select("full_name, phone, avatar_url, professional_title, is_founder, role")
        .eq("id", user.id)
        .single();

      reset({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        phone: data?.phone ?? "",
        professional_title: (data?.professional_title as ProfessionalTitle) ?? null,
      });
      setAvatarUrl(data?.avatar_url ?? null);
      setIsFounder(data?.is_founder ?? false);
      setPlatformRole(data?.role ?? null);
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

    // Sync name to linked doctor record (trigger handles this too,
    // but explicit update ensures it works even without the trigger)
    await supabase
      .from("doctors")
      .update({ full_name: values.full_name })
      .eq("user_id", user.id);

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

        {/* RIGHT: Role & Organization Info */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Mi cuenta</h2>
            </div>

            {/* Founder badge */}
            {isFounder && (
              <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20">
                  <Crown className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-500">Founder</p>
                  <p className="text-xs text-muted-foreground">
                    Acceso completo a la plataforma
                  </p>
                </div>
              </div>
            )}

            {/* Platform role */}
            {platformRole && (
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Rol plataforma</span>
                </div>
                <span className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize",
                  platformRole === "admin" ? "bg-blue-500/10 text-blue-500" : "bg-muted text-muted-foreground"
                )}>
                  {platformRole}
                </span>
              </div>
            )}

            {/* Organization role */}
            {orgRole && (
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const RoleIcon = ORG_ROLE_LABELS[orgRole]?.icon ?? Users;
                    return <RoleIcon className="h-4 w-4 text-muted-foreground" />;
                  })()}
                  <span className="text-sm text-muted-foreground">Rol en organización</span>
                </div>
                <span className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  ORG_ROLE_LABELS[orgRole]?.color ?? "bg-muted text-muted-foreground"
                )}>
                  {ORG_ROLE_LABELS[orgRole]?.label ?? orgRole}
                </span>
              </div>
            )}

            {/* Organization name */}
            {organization && (
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background p-4">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Organización</span>
                </div>
                <span className="text-sm font-medium">{organization.name}</span>
              </div>
            )}

            {/* Plan & Subscription — only for owner/admin */}
            {isOrgAdmin && (
              <PlanSection
                plan={plan}
                subscription={subscription}
                daysRemaining={daysRemaining}
                loading={planLoading}
              />
            )}
          </div>

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

/* ─── Plan Section (owner/admin only) ─── */

const PLAN_BADGE_STYLES: Record<string, string> = {
  independiente: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  professional: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  enterprise: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Activo", color: "text-emerald-400" },
  trialing: { label: "Prueba", color: "text-blue-400" },
  past_due: { label: "Pago pendiente", color: "text-amber-400" },
  cancelled: { label: "Cancelado", color: "text-destructive" },
  expired: { label: "Expirado", color: "text-destructive" },
};

function PlanSection({
  plan,
  subscription,
  daysRemaining,
  loading,
}: {
  plan: ReturnType<typeof usePlan>["plan"];
  subscription: ReturnType<typeof usePlan>["subscription"];
  daysRemaining: number | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-4">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!plan || !subscription) {
    return (
      <div className="rounded-xl border border-border/60 bg-background p-4">
        <div className="flex items-center gap-3 mb-3">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Plan</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          No tienes un plan activo.
        </p>
        <a
          href="/select-plan"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Seleccionar plan
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  const badgeStyle =
    PLAN_BADGE_STYLES[plan.slug] ?? "bg-muted text-muted-foreground border-border";
  const statusInfo = STATUS_LABELS[subscription.status] ?? {
    label: subscription.status,
    color: "text-muted-foreground",
  };

  // Calculate trial progress for the bar
  const trialProgress = (() => {
    if (!subscription.trial_ends_at && !subscription.expires_at) return null;
    const endDate = subscription.trial_ends_at || subscription.expires_at;
    if (!endDate) return null;
    const startDate = subscription.started_at;
    const totalMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const elapsedMs = Date.now() - new Date(startDate).getTime();
    if (totalMs <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
  })();

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4 space-y-4">
      {/* Plan name + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Plan</span>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold",
            badgeStyle
          )}
        >
          {plan.name}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Estado</span>
        <span className={cn("text-xs font-medium", statusInfo.color)}>
          {statusInfo.label}
        </span>
      </div>

      {/* Days remaining + progress bar */}
      {daysRemaining !== null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              {subscription.status === "trialing"
                ? "Prueba restante"
                : "Tiempo restante"}
            </span>
            <span className="text-xs font-semibold">
              {daysRemaining === 0
                ? "Vence hoy"
                : `${daysRemaining} día${daysRemaining !== 1 ? "s" : ""}`}
            </span>
          </div>
          {trialProgress !== null && (
            <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  trialProgress >= 80
                    ? "bg-destructive/70"
                    : trialProgress >= 50
                      ? "bg-amber-500/70"
                      : "bg-primary/60"
                )}
                style={{ width: `${trialProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Change plan button */}
      <a
        href="/select-plan"
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
      >
        Cambiar plan
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

