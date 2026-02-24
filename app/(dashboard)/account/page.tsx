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
  type ProfileFormData,
  type PasswordFormData,
} from "@/lib/validations/account";
import { toast } from "sonner";
import {
  Loader2,
  User,
  Camera,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";

export default function AccountPage() {
  const { user, loading: userLoading } = useUser();
  const { t } = useLanguage();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Profile form
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: "", phone: "" },
  });

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
        .select("full_name, phone, avatar_url")
        .eq("id", user.id)
        .single();

      reset({
        full_name: data?.full_name ?? user.user_metadata?.full_name ?? "",
        phone: data?.phone ?? "",
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

    // Remove from storage (best effort, try common extensions)
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
        <h1 className="text-3xl font-bold tracking-tight">
          {t("account.title")}
        </h1>
        <p className="text-muted-foreground">{t("account.subtitle")}</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Avatar + info */}
        <div className="rounded-xl border border-border bg-card p-6">
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
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-xs font-mono text-muted-foreground truncate">
                {user?.id}
              </p>
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
        </div>

        {/* Profile form */}
        <form
          onSubmit={handleSubmit(onSubmitProfile)}
          className="rounded-xl border border-border bg-card p-6 space-y-5"
        >
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("account.saving") : t("account.save")}
          </button>
        </form>

        {/* Password form */}
        <form
          onSubmit={handleSubmitPwd(onSubmitPassword)}
          className="rounded-xl border border-border bg-card p-6 space-y-5"
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
                className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
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
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("account.change_password")}
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
