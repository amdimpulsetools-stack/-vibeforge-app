"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { AvatarOption as AvatarOptionType } from "@/hooks/use-user-avatar";
import { useTour } from "@/components/onboarding/tour-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  Smartphone,
  RefreshCw,
  CreditCard,
  AlertTriangle,
  Sparkles,
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
  const { organization, organizationId, orgRole, isOrgAdmin } = useOrganization();
  const { plan, subscription, usage, daysRemaining, getLimit, isNearLimit, isAtLimit, loading: planLoading, refetch } = usePlan();
  const { startTour, resetTour } = useTour();
  const confirm = useConfirm();
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Subscription cancellation state (Danger Zone). When the cancel
  // call succeeds we flip into a "cancelled — acceso hasta X" view
  // without a full reload (the next page nav triggers usePlan refetch).
  const [cancelling, setCancelling] = useState(false);
  const [cancelledAccessUntil, setCancelledAccessUntil] = useState<string | null>(null);
  const [isSubscriptionCancelled, setIsSubscriptionCancelled] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarOption, setAvatarOption] = useState<AvatarOptionType | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [platformRole, setPlatformRole] = useState<string | null>(null);

  // Active addons surface in the cancel-subscription confirmation so
  // the owner sees exactly what they're losing before clicking through.
  const { billing: billingData } = useBilling();

  // Reactivation state (Sprint 3). When the owner clicks "Reactivar
  // suscripción" we POST to /api/billing/reactivate and redirect to MP.
  const [reactivating, setReactivating] = useState(false);

  // Hydrate the cancelled flag on first load — the existing flow only
  // flipped it during the cancel click. Without this, a user that
  // cancelled in a previous session lands on /account and sees the
  // active-state UI by mistake.
  useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("organization_subscriptions")
        .select("status, cancelled_at, expires_at, mp_next_payment_date")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.status === "cancelled") {
        setIsSubscriptionCancelled(true);
        setCancelledAccessUntil(
          (data.expires_at as string | null) ??
            (data.mp_next_payment_date as string | null) ??
            null,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

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
    defaultValues: { full_name: "", phone: "", whatsapp_phone: "", professional_title: null },
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
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("full_name, phone, whatsapp_phone, avatar_url, avatar_option, is_founder, role")
          .eq("id", user.id)
          .single(),
        // professional_title lives per-org on organization_members (mig 146).
        // We read it from the user's active membership so the form edits the
        // title for the current clinic only.
        organizationId
          ? supabase
              .from("organization_members")
              .select("professional_title")
              .eq("user_id", user.id)
              .eq("organization_id", organizationId)
              .maybeSingle()
          : Promise.resolve({ data: null as { professional_title: ProfessionalTitle | null } | null }),
      ]);

      reset({
        full_name: profile?.full_name ?? user.user_metadata?.full_name ?? "",
        phone: profile?.phone ?? "",
        whatsapp_phone: profile?.whatsapp_phone ?? "",
        professional_title: (membership?.professional_title as ProfessionalTitle) ?? null,
      });
      setAvatarUrl(profile?.avatar_url ?? null);
      setAvatarOption((profile?.avatar_option as AvatarOptionType) ?? null);
      setIsFounder(profile?.is_founder ?? false);
      setPlatformRole(profile?.role ?? null);
      setProfileLoaded(true);
    };

    fetchProfile();
  }, [user, reset, organizationId]);

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

    // Las cuatro escrituras son independientes entre sí (ninguna lee lo que
    // escribe otra), pero iban encadenadas: el botón Guardar costaba ~4
    // roundtrips en serie. En paralelo baja a uno solo de espera percibida.
    const [{ error }, titleRes] = await Promise.all([
      supabase.from("user_profiles").upsert({
        id: user.id,
        full_name: values.full_name,
        phone: values.phone || null,
        whatsapp_phone: values.whatsapp_phone || null,
      }),

      // professional_title is per-org (mig 146): a narrow RPC updates the
      // title on the caller's own doctor membership in the current org. We
      // can't UPDATE organization_members directly because the table policy
      // is admin-only (mig 013) and widening it would allow role escalation.
      organizationId && orgRole === "doctor"
        ? supabase.rpc("update_my_professional_title", {
            p_org_id: organizationId,
            p_title: values.professional_title || null,
          })
        : Promise.resolve(null),

      // Sync name to linked doctor record (trigger handles this too,
      // but explicit update ensures it works even without the trigger)
      supabase
        .from("doctors")
        .update({ full_name: values.full_name })
        .eq("user_id", user.id),

      // Sync name to auth metadata so otros componentes que leen
      // user.user_metadata.full_name (sidebar/topbar/displayName del header)
      // se refrescan inmediatamente sin esperar al próximo refresh.
      supabase.auth.updateUser({
        data: { full_name: values.full_name },
      }),
    ]);

    if (titleRes?.error) {
      console.error("Failed to update professional_title:", titleRes.error);
    }

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

  // Reactive: refleja lo que el user tipea en vivo + tras guardar.
  // Fallback: auth metadata, después local-part del email.
  const watchedFullName = watch("full_name");
  const displayName =
    (watchedFullName && watchedFullName.trim()) ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "";

  // ── Cancel subscription (Danger Zone, owner only) ──
  // Wires `/api/billing/cancel` (POST). Confirmation dialog explains
  // the 3 grace guarantees: access until paid period ends, data
  // retained 90 days, reactivation possible. After success we flip
  // the UI into a read-only "cancelada — acceso hasta {date}" badge
  // until the user reloads.
  const handleCancelSubscription = async () => {
    const accessUntil = subscription?.expires_at || subscription?.trial_ends_at || null;
    const accessUntilLabel = accessUntil
      ? new Date(accessUntil).toLocaleDateString("es-PE", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "el final del período pagado";

    // Build a breakdown of plan price + active addons so the owner
    // sees what they're walking away from in soles, not a vague
    // "tu suscripción" string.
    const addons = billingData?.addons ?? [];
    const planPrice = Number(plan?.price_monthly ?? 0);
    const addonsTotal = addons.reduce(
      (sum, a) => sum + Number(a.unit_price) * Number(a.quantity),
      0,
    );
    const monthlyTotal = planPrice + addonsTotal;

    const addonLines = addons.length
      ? "\n\nCupos extra que dejarás de pagar:\n" +
        addons
          .map((a) => {
            const label =
              a.addon_type === "extra_member"
                ? "Miembro extra"
                : "Consultorio extra";
            const lineTotal = Number(a.unit_price) * Number(a.quantity);
            return `• ${a.quantity}× ${label} — S/${lineTotal.toFixed(2)}/mes`;
          })
          .join("\n")
      : "";

    const description =
      `Mantienes acceso hasta ${accessUntilLabel} (lo que ya pagaste).` +
      ` Tus datos se conservan 90 días y puedes reactivar la cuenta en ese plazo.` +
      ` Después no se realizarán nuevos cobros.\n\n` +
      `Total que dejarás de pagar: S/${monthlyTotal.toFixed(2)}/mes` +
      (planPrice ? ` (plan ${plan?.name ?? ""}: S/${planPrice.toFixed(2)})` : "") +
      addonLines;

    const ok = await confirm({
      title: "¿Cancelar tu suscripción?",
      description,
      variant: "destructive",
      confirmText: "Confirmar cancelación",
      cancelText: "Volver",
    });
    if (!ok) return;

    setCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const body: { ok?: boolean; access_until?: string | null; message?: string; error?: string } =
        await res.json().catch(() => ({}));

      if (!res.ok || !body.ok) {
        toast.error(
          body.message || "No se pudo cancelar. Intenta de nuevo o contacta soporte.",
        );
        return;
      }

      setIsSubscriptionCancelled(true);
      setCancelledAccessUntil(body.access_until ?? accessUntil);
      toast.success(body.message || "Suscripción cancelada.");
      refetch();
    } catch (err) {
      console.error("[account] cancel failed", err);
      toast.error("Error de red. Intenta de nuevo.");
    } finally {
      setCancelling(false);
    }
  };

  // ── Reactivate subscription (Sprint 3) ──────────────────────────
  // POSTs to /api/billing/reactivate. On success we redirect to MP's
  // init_point so the owner can authorize a fresh preApproval — the
  // old one was killed on /api/billing/cancel and cannot be revived.
  // 410 from the API means the 90-day window expired; we tell the
  // user to pick a plan from scratch.
  const handleReactivate = async () => {
    const ok = await confirm({
      title: "¿Reactivar tu suscripción?",
      description:
        "Te llevamos a Mercado Pago para autorizar nuevamente el cobro recurrente. Tus datos siguen donde los dejaste. Si tenías cupos extra, podrás volver a comprarlos desde Mi Cuenta después de la reactivación.",
      confirmText: "Sí, reactivar",
      cancelText: "Volver",
    });
    if (!ok) return;

    setReactivating(true);
    try {
      const res = await fetch("/api/billing/reactivate", { method: "POST" });
      const body: {
        ok?: boolean;
        init_point?: string;
        message?: string;
        error?: string;
      } = await res.json().catch(() => ({}));

      if (!res.ok || !body.ok || !body.init_point) {
        if (res.status === 410) {
          toast.error(
            body.message ||
              "Pasaron más de 90 días desde tu cancelación. Elige un plan desde /select-plan para volver.",
            { duration: 8000 },
          );
        } else if (body.error === "org_in_deletion") {
          toast.error(body.message || "Revierte la eliminación primero.");
        } else {
          toast.error(body.message || "No pudimos iniciar la reactivación. Intenta de nuevo.");
        }
        setReactivating(false);
        return;
      }

      window.location.href = body.init_point;
    } catch (err) {
      console.error("[account] reactivate failed", err);
      toast.error("Error de red. Intenta de nuevo.");
      setReactivating(false);
    }
  };

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
        <div className="rounded-2xl border border-border/60 bg-card px-5 py-8 space-y-4">
          {/* Avatar row */}
          <div className="flex flex-wrap items-center gap-4 sm:flex-nowrap">
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
              <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:flex-nowrap sm:shrink-0">
                {AVATAR_OPTIONS.map(({ key }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleAvatarOptionSelect(key)}
                    className={cn(
                      "flex items-center justify-center rounded-lg border p-2.5 transition-all sm:p-1.5",
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
                <label className="text-xs font-medium text-muted-foreground" htmlFor="whatsapp_phone">
                  WhatsApp personal
                </label>
                <input
                  id="whatsapp_phone"
                  type="tel"
                  placeholder="+51 987 654 321"
                  {...register("whatsapp_phone")}
                  className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary/50 transition-all"
                />
                {errors.whatsapp_phone && (
                  <p className="text-[11px] text-destructive">{errors.whatsapp_phone.message}</p>
                )}
              </div>

              {orgRole !== "receptionist" && (
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
              )}

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
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 items-start">
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

      {/* Cupos extra activos — owner-only. Le permite al owner soltar
          un slot pagado (extra doctor / consultorio) para que MP deje
          de cobrarlo en el próximo ciclo. */}
      {orgRole === "owner" && <ActiveAddonsCard />}

      {/* Secciones "ligeras" — se muestran/agrupan según el role:
          - Owner/admin: grupo "Seguridad" con 2FA + Dispositivos en grid 2-col
          - Doctor/recep: solo card "Mis dispositivos" full-width
          (2FA en v1 es opt-in solo para owner+admin; mostrar la card
          a otros roles abre /account/security que devuelve 403 y
          confunde al usuario sin valor).
      */}
      {(orgRole === "owner" || orgRole === "admin") ? (
        <section>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2 px-1 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Seguridad
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {/* 2FA */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col">
              <h3 className="text-base font-semibold mb-2">
                Autenticación en dos pasos (2FA)
              </h3>
              <p className="text-sm text-muted-foreground mb-4 flex-1">
                Protegé tu cuenta con un código de tu app de autenticación cada vez que inicies sesión.
              </p>
              <a
                href="/account/security"
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Configurar 2FA
              </a>
            </div>

            {/* Mis dispositivos */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col">
              <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                Mis dispositivos
              </h3>
              <p className="text-sm text-muted-foreground mb-4 flex-1">
                Revisá en qué dispositivos hay sesiones activas y cerrá las que no reconozcas.
              </p>
              <a
                href="/account/devices"
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Ver dispositivos
              </a>
            </div>
          </div>
        </section>
      ) : (
        /* Doctor / recepción: solo dispositivos, full-width. No mostramos
           2FA porque no está disponible para esos roles. */
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            Mis dispositivos
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Revisá en qué dispositivos hay sesiones activas y cerrá las que no reconozcas.
          </p>
          <a
            href="/account/devices"
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Ver dispositivos
          </a>
        </div>
      )}

      {/* Ayuda — link discreto al final, no merece su propia card.
          Visible para todos los roles. */}
      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={async () => {
            resetTour();
            await startTour();
          }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Ver tour de bienvenida nuevamente
        </button>
      </div>

      {/* Danger Zone — solo owner. Para otros roles el bloque NO se
          renderiza (antes mostraba un disclaimer "Solo el propietario
          puede cancelar..." que era ruido visual frustrante). */}
      {orgRole === "owner" && (
      <div className="rounded-2xl border border-destructive/30 bg-card p-6">
        <h2 className="text-lg font-semibold text-destructive mb-2">
          Zona peligrosa
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Cancelar tu suscripción detiene los cobros automáticos. Mantienes acceso hasta el fin del período que ya pagaste y tus datos se conservan 90 días.
        </p>

        {/* orgRole === "owner" check at the outer wrap already
            guarantees we're rendering for owner; the only remaining
            branch is cancelled vs active subscription. */}
        {isSubscriptionCancelled ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <span>
                Cancelada
                {cancelledAccessUntil
                  ? ` — acceso hasta ${new Date(cancelledAccessUntil).toLocaleDateString("es-PE", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}`
                  : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={handleReactivate}
              disabled={reactivating}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {reactivating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirigiendo a Mercado Pago…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Reactivar suscripción
                </>
              )}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCancelSubscription}
            disabled={cancelling || !subscription}
            className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelling ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelando…
              </>
            ) : (
              "Cancelar suscripción"
            )}
          </button>
        )}
      </div>
      )}

      {/* Eliminar clínica — Ley 29733 compliance (right to be forgotten).
          Owner-only. Requires the subscription to be already cancelled.
          Pre-cron action is soft-delete; after 30 days the cron runs
          the IRREVERSIBLE anonymization. */}
      {orgRole === "owner" && (
        <DeleteOrgCard
          subscriptionStatus={
            (subscription?.status as string | undefined) ?? null
          }
          isSubscriptionCancelled={isSubscriptionCancelled}
        />
      )}
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
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full max-w-sm p-0 gap-0 [&>button]:hidden">
        <DialogDescription className="sr-only">Comprar cupo extra</DialogDescription>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("rounded-lg bg-primary/10 p-1.5")}>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-sm font-semibold">
              {step === "select" ? "Añadir cupos extra" : "Confirmar cargo"}
            </DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}

/* ─── Plan Section (owner/admin only) ─── */

const PLAN_BADGE_STYLES: Record<string, string> = {
  independiente: "bg-success-500/10 text-success-400 border-success-500/20",
  professional: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  enterprise: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Activo", color: "text-success-400" },
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
                    {/* Los "+" de límites del plan son acciones de
                        monetización (añadir doctor / comprar cupo) y medían
                        20px: por debajo del mínimo táctil. 32px en móvil,
                        desde md los 20px de siempre. */}
                    <div className="flex items-center gap-2">
                      {/* Not at limit: navigate to add page */}
                      {addHref && !atLimit && (
                        <a
                          href={addHref}
                          title={addLabel}
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors md:h-5 md:w-5"
                        >
                          <Plus className="h-3 w-3" />
                        </a>
                      )}
                      {/* At limit + addon available: open purchase modal */}
                      {atLimit && hasAddon && (
                        <button
                          onClick={() => setAddonModal(addonKey)}
                          title={`Comprar más ${label.toLowerCase()}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors md:h-5 md:w-5"
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
        : "stroke-success-500";

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
                  : "text-success-400"
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

/* ─── Delete-org card ───────────────────────────────────────────────
   Soft-delete with 30-day grace + IRREVERSIBLE anonymization (mig 149).
   The owner can revert via /api/account/delete-cancel while the grace
   window is open. Hard-gated on subscription being cancelled first —
   the RPC re-checks this server-side. */

function DeleteOrgCard({
  subscriptionStatus,
  isSubscriptionCancelled,
}: {
  subscriptionStatus: string | null;
  isSubscriptionCancelled: boolean;
}) {
  const { organization } = useOrganization();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [deletionState, setDeletionState] = useState<{
    deleted_at: string | null;
    delete_grace_until: string | null;
    anonymized_at: string | null;
  } | null>(null);
  const [working, setWorking] = useState(false);

  const fetchState = useCallback(async () => {
    if (!organization?.id) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("organizations")
      .select("deleted_at, delete_grace_until, anonymized_at")
      .eq("id", organization.id)
      .maybeSingle();
    setDeletionState(
      (data as {
        deleted_at: string | null;
        delete_grace_until: string | null;
        anonymized_at: string | null;
      } | null) ?? null,
    );
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-card p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  // Already anonymized — should be unreachable from /account (the
  // session-check RPC blocks anonymized orgs) but render defensively.
  if (deletionState?.anonymized_at) {
    return null;
  }

  const inGrace = Boolean(
    deletionState?.deleted_at && deletionState.delete_grace_until,
  );

  const handleRequest = async () => {
    const ok = await confirm({
      title: "¿Eliminar tu clínica de Yenda?",
      description:
        "Esta acción es IRREVERSIBLE después de 30 días. Los nombres, teléfonos, correos y DNI de pacientes, doctores y miembros serán reemplazados por identificadores anónimos. Las facturas y historias clínicas se conservan anónimas por ley (SUNAT 5 años, salud 15 años). Tienes 30 días para revertir antes de que el cambio sea definitivo.",
      confirmText: "Sí, eliminar mi clínica",
      cancelText: "Volver",
      variant: "destructive",
    });
    if (!ok) return;

    setWorking(true);
    try {
      const res = await fetch("/api/account/delete-request", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = (data?.error as string | undefined) ?? "";
        const messages: Record<string, string> = {
          subscription_still_active:
            "Primero cancela tu suscripción desde el botón de arriba.",
          forbidden_owner_only: "Solo el propietario puede eliminar la clínica.",
          already_deleted: "Tu clínica ya está marcada para eliminación.",
        };
        toast.error(messages[code] ?? data?.message ?? "No pudimos procesar tu solicitud.");
        setWorking(false);
        return;
      }
      toast.success(data?.message ?? "Solicitud recibida.", { duration: 8000 });
      await fetchState();
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
    }
    setWorking(false);
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: "¿Revertir la eliminación?",
      description:
        "Tu clínica volverá a estar completamente activa. No perderás nada.",
      confirmText: "Sí, revertir",
      cancelText: "Mantener eliminación",
    });
    if (!ok) return;

    setWorking(true);
    try {
      const res = await fetch("/api/account/delete-cancel", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "No pudimos revertir. Intenta de nuevo.");
        setWorking(false);
        return;
      }
      toast.success(data?.message ?? "Eliminación revertida.");
      await fetchState();
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
    }
    setWorking(false);
  };

  // ── Render: in-grace state ────────────────────────────────────────
  if (inGrace) {
    const graceDate = new Date(deletionState!.delete_grace_until!);
    const daysLeft = Math.max(
      0,
      Math.ceil((graceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    );
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h2 className="text-lg font-semibold text-destructive">
            Clínica marcada para eliminación
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Tu clínica se anonimizará permanentemente el{" "}
          <span className="font-medium text-foreground">
            {graceDate.toLocaleDateString("es-PE", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </span>{" "}
          ({daysLeft} {daysLeft === 1 ? "día restante" : "días restantes"}). Puedes revertir hasta esa fecha.
        </p>
        <button
          type="button"
          onClick={handleCancel}
          disabled={working}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        >
          {working && <Loader2 className="h-4 w-4 animate-spin" />}
          Revertir eliminación
        </button>
      </div>
    );
  }

  // ── Render: not deleted yet ───────────────────────────────────────
  // The RPC re-validates this server-side; the UI guard only avoids
  // showing a button that we know will 400. Blocked: active / trialing
  // / grace (these are paid or future-paid; user must cancel first).
  const blockedStatuses = ["active", "trialing", "grace"];
  const canRequest =
    isSubscriptionCancelled ||
    !subscriptionStatus ||
    !blockedStatuses.includes(subscriptionStatus);

  return (
    <div className="rounded-2xl border border-destructive/30 bg-card p-6">
      <h2 className="text-lg font-semibold text-destructive mb-2">
        Eliminar clínica
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Solicita la eliminación de los datos personales de tu clínica (Ley 29733). Tienes 30 días para revertir; después del plazo la anonimización es IRREVERSIBLE. Las facturas y historias clínicas se conservan anónimas según retención legal.
      </p>

      {canRequest ? (
        <button
          type="button"
          onClick={handleRequest}
          disabled={working}
          className="inline-flex items-center gap-2 rounded-xl border border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
        >
          {working && <Loader2 className="h-4 w-4 animate-spin" />}
          Eliminar clínica
        </button>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Primero cancela tu suscripción desde el botón de arriba antes de eliminar la clínica.
        </p>
      )}
    </div>
  );
}

/* ─── Active Addons card ───────────────────────────────────────────
   Lists every plan_addons row with is_active=true and lets the owner
   release a slot. The cancel button calls /api/addons/cancel which
   pushes the lower transaction_amount to Mercado Pago — the slot is
   only billed until the end of the current cycle. */

const ADDON_TYPE_LABEL: Record<string, string> = {
  extra_member: "Miembro extra (doctor/recepcionista)",
  extra_office: "Consultorio extra",
  // Módulos de pago (mig 210): plan_addons.addon_type = 'module_<key>'
  module_almacen: "Módulo Almacén",
  module_caja: "Módulo Caja",
  module_captacion: "Módulo Captación",
};

/** Etiqueta legible para un addon_type; los module_* no mapeados caen a
 *  "Módulo <key>" en vez de mostrar el identificador crudo. */
function addonTypeLabel(type: string): string {
  if (ADDON_TYPE_LABEL[type]) return ADDON_TYPE_LABEL[type];
  if (type.startsWith("module_")) {
    const key = type.slice("module_".length).replace(/_/g, " ");
    return `Módulo ${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  }
  return type;
}

function ActiveAddonsCard() {
  const { billing, cancelAddon, loading } = useBilling();
  const confirm = useConfirm();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const addons = billing?.addons ?? [];

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (addons.length === 0) {
    return null;
  }

  const handleCancel = async (
    addonId: string,
    label: string,
    amount: number,
  ) => {
    const ok = await confirm({
      title: "¿Cancelar este cupo extra?",
      description: `Al cancelar dejarás de pagar S/${amount.toFixed(2)}/mes por ${label.toLowerCase()}. El cambio aplica en tu próximo ciclo de facturación.`,
      confirmText: "Sí, cancelar",
      cancelText: "Volver",
      variant: "destructive",
    });
    if (!ok) return;

    setCancellingId(addonId);
    const result = await cancelAddon(addonId);
    setCancellingId(null);

    if (result.success) {
      toast.success(result.message, { duration: 6000 });
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center gap-2 mb-2">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Cupos extra activos</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Cada cupo es un slot pagado independiente del personal que lo ocupa. Cancelar un cupo no desactiva a nadie — solo libera el costo en tu próxima factura.
      </p>
      <ul className="space-y-2">
        {addons.map((a) => {
          const total = Number(a.unit_price) * Number(a.quantity);
          const label = addonTypeLabel(a.addon_type);
          return (
            <li
              key={a.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {a.quantity}× {label}
                </p>
                <p className="text-xs text-muted-foreground">
                  S/{Number(a.unit_price).toFixed(2)} por unidad · {" "}
                  <span className="font-medium text-foreground">S/{total.toFixed(2)}/mes</span>
                </p>
              </div>
              <button
                onClick={() => handleCancel(a.id, label, total)}
                disabled={cancellingId === a.id}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-600 transition-all hover:bg-red-500/10 disabled:opacity-50"
              >
                {cancellingId === a.id && <Loader2 className="h-3 w-3 animate-spin" />}
                Cancelar cupo
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

