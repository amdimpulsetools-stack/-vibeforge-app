"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
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
} from "lucide-react";

const TIME_INDICATOR_KEY = "vibeforge_time_indicator";

export function loadTimeIndicatorSetting(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const stored = localStorage.getItem(TIME_INDICATOR_KEY);
    return stored !== null ? stored === "true" : true;
  } catch {
    return true;
  }
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const {
    organization,
    organizationId,
    isOrgAdmin,
    refetchOrg,
  } = useOrganization();

  const [saving, setSaving] = useState(false);
  const [timeIndicator, setTimeIndicator] = useState(() => loadTimeIndicatorSetting());
  const [logoUrl, setLogoUrl] = useState<string | null>(
    organization?.logo_url ?? null
  );
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
    },
  });

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
      console.error("Logo upload error:", uploadError);
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

    await supabase.storage
      .from("org-assets")
      .remove([
        `${organizationId}/logo.jpg`,
        `${organizationId}/logo.png`,
        `${organizationId}/logo.webp`,
        `${organizationId}/logo.svg`,
      ]);

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
      .update({ name: values.name, slug: values.slug })
      .eq("id", organizationId);

    setSaving(false);

    if (error) {
      console.error("Org update error:", error);
      toast.error(t("settings.org_save_error") + ": " + error.message);
      return;
    }

    refetchOrg();
    toast.success(t("settings.org_save_success"));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
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

            {isOrgAdmin && (
              <button
                type="submit"
                disabled={saving || !isDirty}
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

        {/* Appearance */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <h2 className="text-lg font-semibold mb-2">
            {t("settings.appearance")}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("settings.appearance_description")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => theme === "light" && toggleTheme()}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  theme === "dark"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Moon className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">
                  {t("settings.theme_dark")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.theme_dark_description")}
                </p>
              </div>
            </button>

            <button
              onClick={() => theme === "dark" && toggleTheme()}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/10 ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30 hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  theme === "light"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Sun className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">
                  {t("settings.theme_light")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.theme_light_description")}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Scheduler */}
        <div className="rounded-2xl border border-border/60 bg-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {language === "es" ? "Agenda" : "Scheduler"}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {language === "es"
              ? "Personaliza el comportamiento de la agenda"
              : "Customize scheduler behavior"}
          </p>

          <label className="flex items-center justify-between select-none">
            <div>
              <p className="text-sm font-medium">
                {language === "es"
                  ? "Línea de hora actual"
                  : "Current time line"}
              </p>
              <p className="text-xs text-muted-foreground">
                {language === "es"
                  ? "Muestra una línea roja que se mueve en tiempo real indicando la hora actual en la agenda"
                  : "Shows a red line that moves in real-time indicating the current time in the scheduler"}
              </p>
            </div>
            <div className="relative ml-4 shrink-0">
              <input
                type="checkbox"
                checked={timeIndicator}
                onChange={(e) => {
                  const val = e.target.checked;
                  setTimeIndicator(val);
                  localStorage.setItem(TIME_INDICATOR_KEY, String(val));
                }}
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
