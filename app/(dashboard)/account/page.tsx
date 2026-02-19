"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";

const accountSchema = z.object({
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

type AccountFormData = z.infer<typeof accountSchema>;

export default function AccountPage() {
  const { user, loading: userLoading } = useUser();
  const [saving, setSaving] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: { full_name: "", phone: "" },
  });

  // Cargar perfil existente desde user_profiles
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

  const onSubmit = async (values: AccountFormData) => {
    if (!user) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from("user_profiles").upsert(
      {
        id: user.id,
        full_name: values.full_name,
        phone: values.phone || null,
      },
      { onConflict: "id" }
    );

    setSaving(false);

    if (error) {
      toast.error("Error al guardar los cambios");
      return;
    }

    toast.success("Perfil actualizado correctamente");
    reset(values); // limpia isDirty
  };

  if (userLoading || !profileLoaded) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="max-w-lg space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mi Cuenta</h1>
        <p className="text-muted-foreground">
          Actualiza tu información personal
        </p>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Info de solo lectura */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">{user?.email}</p>
              <p className="text-xs text-muted-foreground font-mono">{user?.id}</p>
            </div>
          </div>
        </div>

        {/* Formulario editable */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-xl border border-border bg-card p-6 space-y-5"
        >
          <h2 className="text-lg font-semibold">Datos personales</h2>

          {/* Nombre */}
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

          {/* Celular */}
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

          {/* Botón guardar */}
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>
      </div>
    </div>
  );
}
