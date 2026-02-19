"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";
import { Loader2, Sun, Moon, User } from "lucide-react";

const profileSchema = z.object({
  full_name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar 100 caracteres"),
  phone: z
    .string()
    .max(20, "El celular no puede superar 20 caracteres")
    .optional()
    .or(z.literal("")),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function SettingsPage() {
  const { user, loading: userLoading } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

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
      .update({
        full_name: values.full_name,
        phone: values.phone || null,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      console.error("Error updating profile:", error);
      toast.error("Error al guardar los cambios");
      return;
    }

    toast.success("Perfil actualizado correctamente");
    reset(values);
  };

  if (userLoading || !profileLoaded) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="max-w-2xl space-y-4">
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Administra tu cuenta y preferencias
        </p>
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
          <h2 className="text-lg font-semibold">Datos personales</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="full_name">
              Nombre completo
            </label>
            <input
              id="full_name"
              type="text"
              placeholder="Tu nombre"
              {...register("full_name")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
            {errors.full_name && (
              <p className="text-xs text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="phone">
              Celular
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+57 300 000 0000"
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
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>

        {/* Apariencia */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-2">Apariencia</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Elige el tema visual de la aplicación
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
                <p className="text-sm font-medium">Oscuro</p>
                <p className="text-xs text-muted-foreground">
                  Ideal para ambientes con poca luz
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
                <p className="text-sm font-medium">Claro</p>
                <p className="text-xs text-muted-foreground">
                  Ideal para ambientes iluminados
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/30 bg-card p-6">
          <h2 className="text-lg font-semibold text-destructive mb-2">
            Zona de peligro
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Acciones irreversibles sobre tu cuenta.
          </p>
          <button className="rounded-lg border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors">
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
