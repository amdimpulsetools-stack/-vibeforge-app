"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import {
  organizationSchema,
  type OrganizationFormData,
} from "@/lib/validations/organization";
import { toast } from "sonner";
import {
  Sun,
  Moon,
  Globe,
  Building2,
  Camera,
  Loader2,
  Lock,
  Clock,
  CalendarDays,
  Mail,
  Shield,
  ShieldAlert,
  MessageSquare,
  MapPin,
  Smartphone,
  Globe2,
  Phone,
} from "lucide-react";
import {
  loadSchedulerConfig,
  fetchSchedulerConfig,
  saveSchedulerConfigToDb,
  getHourOptions,
  type SchedulerConfig,
  type IntervalOption,
  type Weekday,
} from "@/lib/scheduler-config";

// Lazy-load heavy tab components — only downloaded when the user opens the tab
const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  </div>
);

const EmailSettingsTab = dynamic(() => import("./email-settings-tab"), { loading: TabLoader });
const PermissionsSettingsTab = dynamic(() => import("./permissions-settings-tab"), { loading: TabLoader });
const WhatsAppClipboardTab = dynamic(() => import("./whatsapp-clipboard-tab"), { loading: TabLoader });
const WhatsAppConfigTab = dynamic(() => import("./whatsapp-config-tab"), { loading: TabLoader });
const WhatsAppTemplatesTab = dynamic(() => import("./whatsapp-templates-tab"), { loading: TabLoader });
const BookingSettingsTab = dynamic(() => import("./booking-settings-tab"), { loading: TabLoader });

type Tab = "general" | "agenda" | "reservas" | "correos" | "whatsapp" | "whatsapp-api" | "permisos";

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const {
    organization,
    organizationId,
    isOrgAdmin,
    refetchOrg,
  } = useOrganization();
  const { isAdmin, loading: roleLoading } = useOrgRole();

  const searchParams = useSearchParams();
  const router = useRouter();
  const VALID_TABS: Tab[] = ["general", "agenda", "reservas", "correos", "whatsapp", "whatsapp-api", "permisos"];
  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "general";
  const setActiveTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "general") params.delete("tab"); else params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(
    organization?.logo_url ?? null
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Revenue goal ─────────────────────────────────────────────────────────
  const [revenueGoal, setRevenueGoal] = useState<string>("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalLoaded, setGoalLoaded] = useState(false);

  // ── Contact info (from global_variables) ─────────────────────────────────
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicEmail, setClinicEmail] = useState("");
  const [contactLoaded, setContactLoaded] = useState(false);
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    if (!organizationId || contactLoaded) return;
    const supabase = createClient();
    supabase
      .from("global_variables")
      .select("key, value")
      .eq("organization_id", organizationId)
      .in("key", ["clinic_phone", "clinic_email"])
      .then(({ data }) => {
        if (data) {
          for (const v of data) {
            if (v.key === "clinic_phone") setClinicPhone(v.value ?? "");
            if (v.key === "clinic_email") setClinicEmail(v.value ?? "");
          }
        }
        setContactLoaded(true);
      });
  }, [organizationId, contactLoaded]);

  const handleSaveContact = async () => {
    if (!organizationId) return;
    setSavingContact(true);
    const supabase = createClient();

    const upserts = [
      { key: "clinic_phone", name: "Teléfono de contacto", value: clinicPhone.trim() },
      { key: "clinic_email", name: "Email de contacto", value: clinicEmail.trim() },
    ];

    for (const u of upserts) {
      const { data: existing } = await supabase
        .from("global_variables")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("key", u.key)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("global_variables")
          .update({ value: u.value })
          .eq("id", existing.id);
      } else {
        await supabase.from("global_variables").insert({
          organization_id: organizationId,
          key: u.key,
          name: u.name,
          value: u.value,
          sort_order: 0,
          is_active: true,
        });
      }
    }

    setSavingContact(false);
    toast.success(t("settings.org_save_success"));
  };

  useEffect(() => {
    if (!organizationId || goalLoaded) return;
    const supabase = createClient();
    supabase
      .from("organizations")
      .select("monthly_revenue_goal")
      .eq("id", organizationId)
      .single()
      .then(({ data }) => {
        if (data?.monthly_revenue_goal != null) {
          setRevenueGoal(String(data.monthly_revenue_goal));
        }
        setGoalLoaded(true);
      });
  }, [organizationId, goalLoaded]);

  const handleSaveGoal = async () => {
    if (!organizationId) return;
    setSavingGoal(true);
    const supabase = createClient();
    const value = parseFloat(revenueGoal) || 0;
    const { error } = await supabase
      .from("organizations")
      .update({ monthly_revenue_goal: value })
      .eq("id", organizationId);
    setSavingGoal(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetchOrg();
    toast.success(t("settings.org_save_success"));
  };

  // ── Agenda / scheduler settings ────────────────────────────────────────────
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>(() =>
    loadSchedulerConfig()
  );

  // Load from DB on mount (localStorage is the fast fallback)
  useEffect(() => {
    fetchSchedulerConfig().then(setSchedulerConfig);
  }, []);

  const updateSchedulerConfig = (patch: Partial<SchedulerConfig>) => {
    const next = { ...schedulerConfig, ...patch };
    setSchedulerConfig(next);
    saveSchedulerConfigToDb(patch);
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
      address: organization?.address ?? "",
      google_maps_url: (organization as any)?.google_maps_url ?? "",
    },
  });

  // Sync form values when organization data loads asynchronously
  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name ?? "",
        slug: organization.slug ?? "",
        address: organization.address ?? "",
        google_maps_url: (organization as any).google_maps_url ?? "",
      });
    }
  }, [organization, reset]);

  // Sync logo URL when organization data loads
  useEffect(() => {
    if (organization) {
      setLogoUrl(organization.logo_url ?? null);
    }
  }, [organization]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Max 2MB");
      return;
    }

    setUploadingLogo(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${organizationId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("org-assets")
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (uploadError) {
      toast.error(uploadError.message);
      setUploadingLogo(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("org-assets").getPublicUrl(path);

    const url = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from("organizations")
      .update({ logo_url: url })
      .eq("id", organizationId);

    setUploadingLogo(false);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    setLogoUrl(url);
    refetchOrg();
    toast.success(t("settings.org_save_success"));
  };

  const handleLogoRemove = async () => {
    if (!organizationId) return;

    setUploadingLogo(true);
    const supabase = createClient();

    // Extract actual file path from the current logo URL
    const pathsToRemove: string[] = [];
    if (logoUrl) {
      const match = logoUrl.match(new RegExp(`${organizationId}/logo\\.[a-z]+`));
      if (match) pathsToRemove.push(match[0]);
    }
    if (pathsToRemove.length > 0) {
      await supabase.storage.from("org-assets").remove(pathsToRemove);
    }

    const { error } = await supabase
      .from("organizations")
      .update({ logo_url: null })
      .eq("id", organizationId);

    setUploadingLogo(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setLogoUrl(null);
    refetchOrg();
    toast.success(t("settings.org_save_success"));
  };

  const onSubmitOrg = async (values: OrganizationFormData) => {
    if (!organizationId) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: values.name,
        slug: values.slug,
        address: values.address || null,
        google_maps_url: values.google_maps_url || null,
      })
      .eq("id", organizationId);

    setSaving(false);

    if (error) {
      // Handle slug uniqueness violation
      if (error.code === "23505" || error.message?.includes("unique")) {
        toast.error(t("settings.org_slug_taken"));
      } else {
        toast.error(t("settings.org_save_error") + ": " + error.message);
      }
      return;
    }

    reset(values);
    refetchOrg();
    toast.success(t("settings.org_save_success"));
  };

  const selectClass =
    "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Building2 className="h-4 w-4" /> },
    { id: "agenda", label: language === "es" ? "Agenda" : "Scheduler", icon: <CalendarDays className="h-4 w-4" /> },
    { id: "reservas", label: language === "es" ? "Reservas" : "Booking", icon: <Globe2 className="h-4 w-4" /> },
    { id: "correos", label: language === "es" ? "Correos" : "Emails", icon: <Mail className="h-4 w-4" /> },
    { id: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" /> },
    { id: "whatsapp-api", label: "WA Business", icon: <Smartphone className="h-4 w-4" /> },
    { id: "permisos", label: language === "es" ? "Permisos" : "Permissions", icon: <Shield className="h-4 w-4" /> },
  ];

  // Show loading spinner while role is being determined
  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Block non-admin users from accessing settings
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">{t("settings.access_denied")}</h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {t("settings.access_denied_description")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header with theme toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("settings.title")}
          </h1>
          <p className="mt-1 text-muted-foreground">{t("settings.subtitle")}</p>
        </div>

        {/* Dark / Light toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-foreground hover:bg-accent"
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
        >
          {theme === "dark" ? (
            <>
              <Sun className="h-4 w-4 text-amber-400" />
              <span className="hidden sm:inline">Modo claro</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 text-indigo-400" />
              <span className="hidden sm:inline">Modo oscuro</span>
            </>
          )}
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-card text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── General tab ──────────────────────────────────────────────────────── */}
      {activeTab === "general" && (
        <div className="space-y-6">
          {/* Organization profile */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">
                  {t("settings.org_profile")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("settings.org_profile_description")}
                </p>
              </div>
            </div>

            {!isOrgAdmin && (
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                {t("settings.org_admin_only")}
              </div>
            )}

            {/* Logo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("settings.org_logo")}
              </label>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      width={56}
                      height={56}
                      loading="lazy"
                      decoding="async"
                      className="h-14 w-14 rounded-lg object-cover border border-border"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10 text-primary border border-border">
                      <Building2 className="h-6 w-6" />
                    </div>
                  )}
                  {isOrgAdmin && (
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <Camera className="h-5 w-5 text-white" />
                      )}
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
                {isOrgAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("settings.org_upload_logo")}
                    </button>
                    {logoUrl && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <button
                          type="button"
                          onClick={handleLogoRemove}
                          disabled={uploadingLogo}
                          className="text-xs text-destructive hover:underline"
                        >
                          {t("settings.org_remove_logo")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Org form */}
            <form onSubmit={handleSubmit(onSubmitOrg)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="org_name">
                    {t("settings.org_name")}
                  </label>
                  <input
                    id="org_name"
                    type="text"
                    disabled={!isOrgAdmin}
                    placeholder={t("settings.org_name_placeholder")}
                    {...register("name")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">
                      {errors.name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="org_slug">
                    {t("settings.org_slug")}
                  </label>
                  <input
                    id="org_slug"
                    type="text"
                    disabled={!isOrgAdmin}
                    placeholder={t("settings.org_slug_placeholder")}
                    {...register("slug")}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {errors.slug && (
                    <p className="text-xs text-destructive">
                      {errors.slug.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="org_address">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("settings.org_address")}
                  </span>
                </label>
                <input
                  id="org_address"
                  type="text"
                  disabled={!isOrgAdmin}
                  placeholder={t("settings.org_address_placeholder")}
                  {...register("address")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {errors.address && (
                  <p className="text-xs text-destructive">
                    {errors.address.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="org_maps_url">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    Link de ubicación (Google Maps)
                  </span>
                </label>
                <input
                  id="org_maps_url"
                  type="url"
                  disabled={!isOrgAdmin}
                  placeholder="https://maps.google.com/?q=..."
                  {...register("google_maps_url")}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  Pega el enlace de Google Maps para incluirlo en los correos de confirmación.
                </p>
                {errors.google_maps_url && (
                  <p className="text-xs text-destructive">
                    {errors.google_maps_url.message}
                  </p>
                )}
              </div>

              {isOrgAdmin && (
                <button
                  type="submit"
                  disabled={saving || !isDirty || !organizationId}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving
                    ? t("settings.org_saving")
                    : t("settings.org_save")}
                </button>
              )}
            </form>
          </div>

          {/* Language */}
          <div className="rounded-2xl border border-border/60 bg-card p-6">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t("settings.language")}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t("settings.language_description")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLanguage("es")}
                className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                  language === "es"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border hover:border-muted-foreground/30 hover:bg-accent"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${
                    language === "es" ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  🇪🇸
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{t("settings.lang_es")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.lang_es_description")}
                  </p>
                </div>
              </button>

              <button
                onClick={() => setLanguage("en")}
                className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                  language === "en"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border hover:border-muted-foreground/30 hover:bg-accent"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${
                    language === "en" ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  🇺🇸
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{t("settings.lang_en")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings.lang_en_description")}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Revenue goal */}
          {isOrgAdmin && (
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                <div>
                  <h2 className="text-lg font-semibold">
                    {language === "es" ? "Meta de ingresos mensual" : "Monthly revenue goal"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {language === "es"
                      ? "Define la meta de ingresos que se muestra en el dashboard"
                      : "Set the revenue target displayed on the dashboard"}
                  </p>
                </div>
              </div>

              <div className="flex items-end gap-3">
                <div className="space-y-1.5 flex-1 max-w-xs">
                  <label className="text-sm font-medium" htmlFor="revenue_goal">
                    {language === "es" ? "Meta (S/.)" : "Goal (S/.)"}
                  </label>
                  <input
                    id="revenue_goal"
                    type="number"
                    min="0"
                    step="100"
                    value={revenueGoal}
                    onChange={(e) => setRevenueGoal(e.target.value)}
                    placeholder="10000"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveGoal}
                  disabled={savingGoal}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingGoal && <Loader2 className="h-4 w-4 animate-spin" />}
                  {savingGoal
                    ? (language === "es" ? "Guardando..." : "Saving...")
                    : (language === "es" ? "Guardar meta" : "Save goal")}
                </button>
              </div>
            </div>
          )}

          {/* Contact info */}
          {isOrgAdmin && (
            <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">
                    {language === "es" ? "Datos de contacto" : "Contact info"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {language === "es"
                      ? "Se muestran en la página de reservas y en las notificaciones"
                      : "Shown on the booking page and in notifications"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="clinic_phone">
                    {language === "es" ? "Teléfono" : "Phone"}
                  </label>
                  <input
                    id="clinic_phone"
                    type="tel"
                    value={clinicPhone}
                    onChange={(e) => setClinicPhone(e.target.value)}
                    placeholder={language === "es" ? "Ej: 51987654321" : "E.g. 51987654321"}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === "es"
                      ? "Con código de país, sin espacios ni guiones"
                      : "With country code, no spaces or dashes"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="clinic_email">
                    Email
                  </label>
                  <input
                    id="clinic_email"
                    type="email"
                    value={clinicEmail}
                    onChange={(e) => setClinicEmail(e.target.value)}
                    placeholder="contacto@tuclinica.com"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveContact}
                disabled={savingContact}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingContact && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingContact
                  ? (language === "es" ? "Guardando..." : "Saving...")
                  : (language === "es" ? "Guardar contacto" : "Save contact")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Agenda tab ───────────────────────────────────────────────────────── */}
      {activeTab === "agenda" && (
        <div className="space-y-6">
          {/* Hours + Slot size — combined card */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">
                  {language === "es" ? "Configuración de la agenda" : "Scheduler settings"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {language === "es"
                    ? "Horario visible y resolución de la grilla"
                    : "Visible hours and grid resolution"}
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Left: Hours */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {language === "es" ? "Horario" : "Hours"}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">
                      {language === "es" ? "Inicio" : "Start"}
                    </label>
                    <select
                      value={schedulerConfig.startHour}
                      onChange={(e) =>
                        updateSchedulerConfig({ startHour: Number(e.target.value) })
                      }
                      className={selectClass + " w-full"}
                    >
                      {getHourOptions(0, 12).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">
                      {language === "es" ? "Fin" : "End"}
                    </label>
                    <select
                      value={schedulerConfig.endHour}
                      onChange={(e) =>
                        updateSchedulerConfig({ endHour: Number(e.target.value) })
                      }
                      className={selectClass + " w-full"}
                    >
                      {getHourOptions(13, 24).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {schedulerConfig.startHour.toString().padStart(2, "0")}:00 —{" "}
                    {schedulerConfig.endHour === 24
                      ? "24:00"
                      : `${schedulerConfig.endHour.toString().padStart(2, "0")}:00`}
                  </span>{" "}
                  ({schedulerConfig.endHour - schedulerConfig.startHour}{" "}
                  {language === "es" ? "horas" : "hours"})
                </p>
              </div>

              {/* Right: Slot size */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  {language === "es" ? "Bloques" : "Slots"}
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {([15, 20, 30, 45, 60] as const).map((mins) => {
                    const isSelected = schedulerConfig.intervals.includes(mins);
                    return (
                      <button
                        key={mins}
                        onClick={() => {
                          let next: IntervalOption[];
                          if (isSelected) {
                            if (schedulerConfig.intervals.length <= 1) return;
                            next = schedulerConfig.intervals.filter((v) => v !== mins);
                          } else {
                            next = [...schedulerConfig.intervals, mins].sort((a, b) => a - b) as IntervalOption[];
                          }
                          updateSchedulerConfig({ intervals: next });
                        }}
                        className={`flex flex-col items-center gap-0.5 rounded-xl border p-2.5 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/30 hover:bg-accent"
                        }`}
                      >
                        <span
                          className={`text-lg font-extrabold ${
                            isSelected
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          {mins === 60 ? "1" : mins}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {mins === 60
                            ? (language === "es" ? "hora" : "hour")
                            : "min"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {language === "es"
                    ? "Resolución visual de la grilla. Las citas siempre usan intervalos de 15 min."
                    : "Visual grid resolution. Appointments always use 15-min intervals."}
                </p>
              </div>
            </div>
          </div>

          {/* Time indicator toggle */}
          <div className="rounded-2xl border border-border/60 bg-card p-6">
            <label className="flex items-center justify-between select-none cursor-pointer">
              <div>
                <p className="text-sm font-semibold">
                  {language === "es" ? "Línea de hora actual" : "Current time line"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "es"
                    ? "Muestra una línea roja en tiempo real indicando la hora actual en la agenda"
                    : "Shows a red line in real-time indicating the current time in the scheduler"}
                </p>
              </div>
              <div className="relative ml-4 shrink-0">
                <input
                  type="checkbox"
                  checked={schedulerConfig.timeIndicator}
                  onChange={(e) =>
                    updateSchedulerConfig({ timeIndicator: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
              </div>
            </label>
          </div>

          {/* Disabled weekdays */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                {language === "es" ? "Días laborables" : "Working days"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {language === "es"
                  ? "Desactiva los días en los que no atiendes. Los días desactivados no se mostrarán en la agenda ni contarán para el cálculo de ocupación."
                  : "Disable the days you don't work. Disabled days won't appear in the scheduler and won't count toward occupancy."}
              </p>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {([
                { day: 1 as Weekday, es: "Lun", en: "Mon" },
                { day: 2 as Weekday, es: "Mar", en: "Tue" },
                { day: 3 as Weekday, es: "Mié", en: "Wed" },
                { day: 4 as Weekday, es: "Jue", en: "Thu" },
                { day: 5 as Weekday, es: "Vie", en: "Fri" },
                { day: 6 as Weekday, es: "Sáb", en: "Sat" },
                { day: 0 as Weekday, es: "Dom", en: "Sun" },
              ]).map(({ day, es, en }) => {
                const isDisabled = schedulerConfig.disabledWeekdays.includes(day);
                const activeCount = 7 - schedulerConfig.disabledWeekdays.length;
                return (
                  <button
                    key={day}
                    onClick={() => {
                      // Don't allow disabling all days — at least 1 must remain active
                      if (!isDisabled && activeCount <= 1) return;
                      const next = isDisabled
                        ? schedulerConfig.disabledWeekdays.filter((d) => d !== day)
                        : [...schedulerConfig.disabledWeekdays, day] as Weekday[];
                      updateSchedulerConfig({ disabledWeekdays: next });
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                      isDisabled
                        ? "border-red-500/30 bg-red-500/5 opacity-60"
                        : "border-primary bg-primary/10 ring-1 ring-primary"
                    }`}
                  >
                    <span
                      className={`text-sm font-bold ${
                        isDisabled
                          ? "text-red-400 line-through"
                          : "text-primary"
                      }`}
                    >
                      {language === "es" ? es : en}
                    </span>
                    <span className={`text-[10px] font-medium ${
                      isDisabled ? "text-red-400" : "text-emerald-400"
                    }`}>
                      {isDisabled
                        ? (language === "es" ? "Cerrado" : "Closed")
                        : (language === "es" ? "Abierto" : "Open")}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {language === "es"
                ? `${7 - schedulerConfig.disabledWeekdays.length} día${7 - schedulerConfig.disabledWeekdays.length !== 1 ? "s" : ""} laborable${7 - schedulerConfig.disabledWeekdays.length !== 1 ? "s" : ""} activo${7 - schedulerConfig.disabledWeekdays.length !== 1 ? "s" : ""} por semana`
                : `${7 - schedulerConfig.disabledWeekdays.length} working day${7 - schedulerConfig.disabledWeekdays.length !== 1 ? "s" : ""} per week`}
            </p>
          </div>
        </div>
      )}

      {/* ── Reservas tab ─────────────────────────────────────────────────────── */}
      {activeTab === "reservas" && <BookingSettingsTab />}

      {/* ── Correos tab ──────────────────────────────────────────────────────── */}
      {activeTab === "correos" && <EmailSettingsTab />}

      {/* ── WhatsApp tab ─────────────────────────────────────────────────────── */}
      {activeTab === "whatsapp" && <WhatsAppClipboardTab />}

      {/* ── WhatsApp Business API tab ──────────────────────────────────────── */}
      {activeTab === "whatsapp-api" && (
        <div className="space-y-6">
          <WhatsAppConfigTab />
          <WhatsAppTemplatesTab />
        </div>
      )}

      {/* ── Permisos tab ─────────────────────────────────────────────────────── */}
      {activeTab === "permisos" && <PermissionsSettingsTab />}
    </div>
  );
}
