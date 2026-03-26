"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { usePlan, type OrgUsage } from "@/hooks/use-plan";
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
import { useBilling } from "@/hooks/use-billing";
import { useAiQuota } from "@/hooks/use-ai-quota";
import { BorderAvatar } from "@/components/ui/avatar-border";
import { AvatarSilhouette, AVATAR_OPTIONS } from "@/components/ui/avatar-silhouettes";
import type { AvatarOption as AvatarOptionType } from "@/hooks/use-user-avatar";
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
  DoorOpen,
  UserCheck,
  CalendarDays,
  HardDrive,
  Plus,
  Minus,
  X,
  ShoppingCart,
  Bot,
  RefreshCw,
  CreditCard,
  AlertTriangle,
  type LucideIcon,
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
  const { plan, subscription, usage, daysRemaining, getLimit, isNearLimit, isAtLimit, loading: planLoading, refetch } = usePlan();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarOption, setAvatarOption] = useState<AvatarOptionType | null>(null);
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
        .select("full_name, phone, avatar_url, avatar_option, professional_title, is_founder, role")
        .eq("id", user.id)
        .single();

      reset({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        phone: data?.phone ?? "",
        professional_title: (data?.professional_title as ProfessionalTitle) ?? null,
      });
      setAvatarUrl(data?.avatar_url ?? null);
      setAvatarOption((data?.avatar_option as AvatarOptionType) ?? null);
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

  const handleAvatarOptionSelect = async (option: AvatarOptionType) => {
    if (!user) return;
    const newOption = avatarOption === option ? null : option;
    setAvatarOption(newOption);

    const supabase = createClient();
    const { error } = await supabase
      .from("user_profiles")
      .update({ avatar_option: newOption })
      .eq("id", user.id);

    if (error) {
      toast.error(error.message);
      return;
    }
    // If selecting a silhouette, clear the uploaded photo
    if (newOption && avatarUrl) {
      await supabase.from("user_profiles").update({ avatar_url: null }).eq("id", user.id);
      setAvatarUrl(null);
    }
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

      {/* 3-COLUMN LAYOUT: Profile | Account Info + Plan | AI + Limits */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[1fr_1fr] items-start">
        {/* LEFT COLUMN: Avatar + Personal data + Password (single card) */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          {/* Avatar row */}
          <div className="flex items-center gap-4">
            <div className="relative group shrink-0">
              <BorderAvatar
                src={avatarUrl}
                avatarOption={!avatarUrl ? avatarOption : undefined}
                alt={displayName}
                fallback={getInitials(displayName) || undefined}
                size="lg"
                verified={!!avatarUrl}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : (
                  <Camera className="h-4 w-4 text-white" />
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
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="text-primary hover:underline"
                >
                  Subir foto
                </button>
                {avatarUrl && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      disabled={uploadingAvatar}
                      className="text-destructive hover:underline"
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* Silhouette picker — compact inline */}
            {!avatarUrl && (
              <div className="hidden sm:flex gap-1.5 shrink-0">
                {AVATAR_OPTIONS.map(({ key }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAvatarOptionSelect(key)}
                    className={cn(
                      "flex items-center justify-center rounded-lg border p-1.5 transition-all",
                      avatarOption === key
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/60 hover:bg-accent/50"
                    )}
                  >
                    <AvatarSilhouette option={key} className="h-6 w-6" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <hr className="border-border/40" />

          {/* Personal data form */}
          <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-3">
            <h2 className="text-sm font-semibold">{t("account.personal_data")}</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="full_name">
                  {t("account.full_name")}
                </label>
                <input
                  id="full_name"
                  type="text"
                  placeholder={t("account.full_name_placeholder")}
                  {...register("full_name")}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
                {errors.full_name && (
                  <p className="text-[11px] text-destructive">{errors.full_name.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="phone">
                  Celular
                </label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="+51 987 654 321"
                  {...register("phone")}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="professional_title">
                  Título profesional
                </label>
                <select
                  id="professional_title"
                  value={currentTitle ?? ""}
                  onChange={(e) => setValue("professional_title", (e.target.value || null) as ProfessionalTitle | null, { shouldDirty: true })}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                >
                  <option value="">Sin título</option>
                  {PROFESSIONAL_TITLES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email ?? ""}
                  readOnly
                  className="w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || !isDirty}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? t("account.saving") : t("account.save")}
            </button>
          </form>

          <hr className="border-border/40" />

          {/* Password section — compact */}
          <form onSubmit={handleSubmitPwd(onSubmitPassword)} className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{t("account.change_password")}</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="new_password">
                  {t("account.new_password")}
                </label>
                <div className="relative">
                  <input
                    id="new_password"
                    type={showPwd ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    {...registerPwd("new_password")}
                    className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 pr-9 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {errorsPwd.new_password && (
                  <p className="text-[11px] text-destructive">{errorsPwd.new_password.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="confirm_password">
                  {t("account.confirm_password")}
                </label>
                <input
                  id="confirm_password"
                  type={showPwd ? "text" : "password"}
                  placeholder="Confirmar contraseña"
                  {...registerPwd("confirm_password")}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
                {errorsPwd.confirm_password && (
                  <p className="text-[11px] text-destructive">{errorsPwd.confirm_password.message}</p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPwd}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPwd && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("account.change_password")}
            </button>
          </form>
        </div>

        {/* MIDDLE + RIGHT as a 2x2 sub-grid so rows align horizontally */}
        {/* RIGHT SIDE: 2x2 sub-grid so rows align horizontally */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {/* ROW 1 LEFT: Account info */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
            {/* Founder badge */}
            {isFounder && (
              <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20">
                  <Crown className="h-4.5 w-4.5 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-500">Founder</p>
                  <p className="text-[11px] text-muted-foreground">
                    Acceso completo a la plataforma
                  </p>
                </div>
              </div>
            )}

            {/* Organization role */}
            {orgRole && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Organización</span>
                </div>
                <span className="text-sm font-medium">{organization.name}</span>
              </div>
            )}
          </div>

          {/* ROW 1 RIGHT: AI Quota Ring Card — admin only */}
          {isOrgAdmin && plan?.feature_ai_assistant ? (
            <AiQuotaCard />
          ) : <div />}

          {/* ROW 2 LEFT: Plan + Session stacked together */}
          <div className="space-y-4">
            {isOrgAdmin && (
              <PlanSection
                plan={plan}
                subscription={subscription}
                usage={usage}
                daysRemaining={daysRemaining}
                getLimit={getLimit}
                isNearLimit={isNearLimit}
                isAtLimit={isAtLimit}
                loading={planLoading}
                onRefetchPlan={refetch}
                planInfoOnly
              />
            )}

            {/* Session info — right below Plan */}
            <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Sesión activa</h2>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Proveedor</span>
                <p className="font-semibold">
                  {user?.app_metadata?.provider === "google" ? "Google" : "Email"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Último acceso</span>
                <p className="font-semibold">
                  {user?.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Cuenta creada</span>
                <p className="font-semibold">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">ID</span>
                <p className="font-medium font-mono text-[10px] text-muted-foreground">{user?.id?.slice(0, 8)}</p>
              </div>
            </div>
          </div>
          </div>

          {/* ROW 2 RIGHT: Resource limits — admin only */}
          {isOrgAdmin ? (
            <PlanSection
              plan={plan}
              subscription={subscription}
              usage={usage}
              daysRemaining={daysRemaining}
              getLimit={getLimit}
              isNearLimit={isNearLimit}
              isAtLimit={isAtLimit}
              loading={planLoading}
              onRefetchPlan={refetch}
              limitsOnly
            />
          ) : <div />}
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

/* ─── Add-on Purchase Modal ─── */

interface AddonConfig {
  resourceKey: keyof OrgUsage;
  label: string;
  unitLabel: string;
  icon: LucideIcon;
  iconColor: string;
  addonType: "extra_member" | "extra_office";
  /** Hardcoded price per unit (PEN) — will be replaced by plan pricing later */
  price: number;
}

const ADDON_CONFIG: Record<string, AddonConfig> = {
  doctors: {
    resourceKey: "doctors",
    label: "Doctores / Especialistas",
    unitLabel: "doctor",
    icon: Stethoscope,
    iconColor: "text-purple-400",
    addonType: "extra_member",
    price: 20,
  },
  receptionists: {
    resourceKey: "receptionists",
    label: "Recepcionistas",
    unitLabel: "recepcionista",
    icon: UserCheck,
    iconColor: "text-emerald-400",
    addonType: "extra_member",
    price: 15,
  },
  offices: {
    resourceKey: "offices",
    label: "Consultorios",
    unitLabel: "consultorio",
    icon: DoorOpen,
    iconColor: "text-blue-400",
    addonType: "extra_office",
    price: 20,
  },
};

function AddonPurchaseModal({
  config,
  currentUsage,
  currentLimit,
  onClose,
  onSuccess,
}: {
  config: AddonConfig;
  currentUsage: number;
  currentLimit: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [purchasing, setPurchasing] = useState(false);
  const { addAddon } = useBilling();

  const Icon = config.icon;
  const totalCost = config.price * quantity;
  const newLimit = currentLimit + quantity;

  const handlePurchase = async () => {
    setPurchasing(true);
    const result = await addAddon(config.addonType, quantity);
    setPurchasing(false);

    if (result.success) {
      toast.success(
        `Se añadieron ${quantity} ${quantity === 1 ? config.unitLabel : config.unitLabel + "s"} extra a tu plan. El cargo se aplicará en tu próximo ciclo de facturación.`,
        { duration: 6000 }
      );
      onSuccess();
      onClose();
    } else if (result.error_code === "subscription_required") {
      toast.error("Activa tu suscripción con método de pago antes de comprar cupos extra.", {
        duration: 6000,
      });
    } else {
      toast.error(result.message || "Error al procesar la compra");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("rounded-lg bg-primary/10 p-1.5")}>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">
              {step === "select" ? "Añadir cupos extra" : "Confirmar cargo"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "select" ? (
          <>
            <div className="px-5 py-4 space-y-5">
              {/* Resource info */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
                <Icon className={cn("h-5 w-5", config.iconColor)} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Usando {currentUsage} de {currentLimit} disponibles
                  </p>
                </div>
                <span className="text-xs font-semibold text-red-400">Lleno</span>
              </div>

              {/* Price per unit */}
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">Precio por cada {config.unitLabel} extra</p>
                <p className="text-2xl font-bold">
                  S/{config.price}
                  <span className="text-sm font-normal text-muted-foreground">/mes</span>
                </p>
              </div>

              {/* Quantity selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Cantidad de cupos a añadir</label>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-2xl font-bold tabular-nums w-10 text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(10, quantity + 1))}
                    disabled={quantity >= 10}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {quantity} {config.unitLabel}{quantity > 1 ? "s" : ""} × S/{config.price}/mes
                  </span>
                  <span className="font-medium">S/{totalCost}/mes</span>
                </div>
                <div className="border-t border-border/40 pt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Nuevo límite</span>
                  <span className="font-semibold text-primary">
                    {currentLimit} → {newLimit}
                  </span>
                </div>
              </div>

              {/* Info text */}
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                El costo se añadirá a tu facturación mensual de manera recurrente.
                Puedes cancelar los add-ons en cualquier momento.
              </p>
            </div>

            {/* Footer — Step 1 */}
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => setStep("confirm")}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-all"
              >
                Continuar — S/{totalCost}/mes
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 py-4 space-y-4">
              {/* Charge warning */}
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    Se aplicará un cargo recurrente
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Se añadirán <strong className="text-foreground">S/{totalCost}/mes</strong> a tu
                    suscripción de Mercado Pago. El cargo se reflejará en tu próximo ciclo de facturación.
                  </p>
                </div>
              </div>

              {/* Summary card */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Icon className={cn("h-4 w-4", config.iconColor)} />
                  <span className="text-xs font-medium">
                    {quantity} {config.unitLabel}{quantity > 1 ? "s" : ""} extra
                  </span>
                </div>
                <div className="border-t border-border/40 pt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Cargo mensual adicional</span>
                    <span className="font-semibold">S/{totalCost}/mes</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Nuevo límite</span>
                    <span className="font-semibold text-primary">{currentLimit} → {newLimit}</span>
                  </div>
                </div>
              </div>

              {/* Payment method indicator */}
              <div className="flex items-center gap-2.5 rounded-lg bg-muted/30 p-3">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Se cargará a tu método de pago registrado en Mercado Pago
                </span>
              </div>
            </div>

            {/* Footer — Step 2 (confirmation) */}
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button
                onClick={() => setStep("select")}
                disabled={purchasing}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 transition-colors"
              >
                Volver
              </button>
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {purchasing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>Confirmar cargo — S/{totalCost}/mes</>
                )}
              </button>
            </div>
          </>
        )}
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
  usage,
  daysRemaining,
  getLimit,
  isNearLimit,
  isAtLimit,
  loading,
  onRefetchPlan,
  planInfoOnly,
  limitsOnly,
}: {
  plan: ReturnType<typeof usePlan>["plan"];
  subscription: ReturnType<typeof usePlan>["subscription"];
  usage: ReturnType<typeof usePlan>["usage"];
  daysRemaining: number | null;
  getLimit: ReturnType<typeof usePlan>["getLimit"];
  isNearLimit: ReturnType<typeof usePlan>["isNearLimit"];
  isAtLimit: ReturnType<typeof usePlan>["isAtLimit"];
  loading: boolean;
  onRefetchPlan: () => void;
  planInfoOnly?: boolean;
  limitsOnly?: boolean;
}) {
  const [addonModal, setAddonModal] = useState<string | null>(null);
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

  // Resource limits to display
  const resources: {
    key: keyof OrgUsage;
    label: string;
    icon: LucideIcon;
    iconColor: string;
    addHref?: string;
    addLabel?: string;
    /** Key in ADDON_CONFIG — enables the "buy add-on" modal when at limit */
    addonKey?: string;
  }[] = [
    { key: "doctors", label: "Doctores / Especialistas", icon: Stethoscope, iconColor: "text-purple-400", addHref: "/admin/doctors/new", addLabel: "Añadir doctor", addonKey: "doctors" },
    { key: "receptionists", label: "Recepcionistas", icon: UserCheck, iconColor: "text-emerald-400", addHref: "/admin/members", addLabel: "Añadir recepcionista", addonKey: "receptionists" },
    { key: "offices", label: "Consultorios", icon: DoorOpen, iconColor: "text-blue-400", addHref: "/admin/offices", addLabel: "Añadir consultorio", addonKey: "offices" },
    { key: "patients", label: "Pacientes", icon: Users, iconColor: "text-sky-400" },
    { key: "appointments_this_month", label: "Citas este mes", icon: CalendarDays, iconColor: "text-amber-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Plan info card */}
      {!limitsOnly && (
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
          href="/plans"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all hover:shadow-xl hover:shadow-emerald-600/30 hover:brightness-110"
        >
          <Crown className="h-4 w-4" />
          Cambiar plan
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
      )}

      {/* Resource limits card */}
      {!planInfoOnly && usage && (
        <div className="rounded-xl border border-border/60 bg-background p-4 space-y-4">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Límites del plan</span>
          </div>

          <div className="space-y-3">
            {resources.map(({ key, label, icon: Icon, iconColor, addHref, addLabel, addonKey }) => {
              const current = usage[key];
              const limit = getLimit(key);
              const atLimit = isAtLimit(key);
              const nearLimit = isNearLimit(key);
              const percentage =
                limit !== null && limit > 0
                  ? Math.min(100, Math.round((current / limit) * 100))
                  : 0;
              const isUnlimited = limit === null;
              const hasAddon = !!addonKey && !!ADDON_CONFIG[addonKey] && plan.slug !== "independiente";

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5", iconColor)} />
                      <span className="text-xs text-muted-foreground">
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Not at limit: navigate to add page */}
                      {addHref && !atLimit && (
                        <a
                          href={addHref}
                          title={addLabel}
                          className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </a>
                      )}
                      {/* At limit + addon available: open purchase modal */}
                      {atLimit && hasAddon && (
                        <button
                          onClick={() => setAddonModal(addonKey)}
                          title={`Comprar más ${label.toLowerCase()}`}
                          className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          atLimit
                            ? "text-red-400"
                            : nearLimit
                              ? "text-amber-400"
                              : "text-foreground"
                        )}
                      >
                        {current}
                        <span className="text-muted-foreground font-normal">
                          /{isUnlimited ? "\u221E" : limit}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        atLimit
                          ? "bg-red-500"
                          : nearLimit
                            ? "bg-amber-500"
                            : "bg-primary/70"
                      )}
                      style={{
                        width: isUnlimited
                          ? "5%"
                          : `${Math.max(percentage, 2)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add-on purchase modal */}
          {addonModal && ADDON_CONFIG[addonModal] && usage && (
            <AddonPurchaseModal
              config={ADDON_CONFIG[addonModal]}
              currentUsage={usage[ADDON_CONFIG[addonModal].resourceKey]}
              currentLimit={getLimit(ADDON_CONFIG[addonModal].resourceKey) ?? 0}
              onClose={() => setAddonModal(null)}
              onSuccess={onRefetchPlan}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── AI Quota Ring Card ─── */

function AiQuotaRing({
  used,
  limit,
  size = 100,
  strokeWidth = 8,
}: {
  used: number;
  limit: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percentage = limit > 0 ? Math.min(1, used / limit) : 0;
  const offset = circumference * (1 - percentage);
  const remaining = Math.max(0, limit - used);

  // Color based on usage
  const ringColor =
    percentage >= 1
      ? "stroke-red-500"
      : percentage >= 0.8
        ? "stroke-amber-500"
        : "stroke-emerald-500";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-in-out" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold tabular-nums leading-none">
          {remaining}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">restantes</span>
      </div>
    </div>
  );
}

function AiQuotaCard() {
  const { quota, loading, refetch } = useAiQuota();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 600);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">Consultas IA</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          title="Recargar"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Ring + stats */}
      <div className="flex items-center gap-5">
        <AiQuotaRing used={quota.used} limit={quota.limit} size={90} strokeWidth={7} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Usadas</span>
            <span className="font-semibold tabular-nums">{quota.used}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Límite</span>
            <span className="font-semibold tabular-nums">{quota.limit}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Quedan</span>
            <span className={cn(
              "font-bold tabular-nums",
              quota.remaining === 0
                ? "text-red-400"
                : quota.percentage >= 80
                  ? "text-amber-400"
                  : "text-emerald-400"
            )}>
              {quota.remaining}/{quota.limit}
            </span>
          </div>
        </div>
      </div>

      {/* Warning when near/at limit */}
      {quota.percentage >= 80 && (
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          {quota.remaining === 0
            ? "Has agotado tus consultas IA este mes. Se reinician el 1ro del próximo mes."
            : `Te quedan ${quota.remaining} consultas IA este mes.`}
        </p>
      )}

      {/* Upgrade CTA when at limit */}
      {quota.remaining === 0 && (
        <a
          href="/plans"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Mejorar plan
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

