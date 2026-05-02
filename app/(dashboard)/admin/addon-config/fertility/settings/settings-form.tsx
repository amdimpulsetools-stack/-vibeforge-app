"use client";

import { useEffect, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const SettingsSchema = z.object({
  delay_days_first_consultation: z.coerce.number().int().min(5).max(60),
  delay_days_second_consultation: z.coerce.number().int().min(5).max(60),
  delay_days_budget_acceptance: z.coerce.number().int().min(3).max(30),
  max_attempts: z.coerce.number().int().min(1).max(10),
  auto_contact_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/u, "Formato inválido (HH:MM)"),
  auto_send_email: z.boolean(),
  auto_send_whatsapp: z.boolean(),
  default_message_tone: z.enum(["amable", "directo"]),
  ltv_promedio_paciente: z.coerce.number().nonnegative().max(1_000_000),
});

type SettingsValues = z.infer<typeof SettingsSchema>;

const DEFAULTS: SettingsValues = {
  delay_days_first_consultation: 21,
  delay_days_second_consultation: 14,
  delay_days_budget_acceptance: 7,
  max_attempts: 3,
  auto_contact_time: "08:00",
  auto_send_email: true,
  auto_send_whatsapp: true,
  default_message_tone: "amable",
  ltv_promedio_paciente: 5000,
};

export function SettingsForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SettingsValues>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/fertility/settings", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as Partial<SettingsValues>;
          reset({ ...DEFAULTS, ...json });
        } else {
          // Endpoint not ready yet → use defaults
          reset(DEFAULTS);
        }
      } catch {
        if (!cancelled) reset(DEFAULTS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reset]);

  const onSubmit = async (values: SettingsValues) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/fertility/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Configuración guardada");
      reset(values);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar configuración"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-14 animate-pulse rounded-lg border border-border/40 bg-muted/40"
          />
        ))}
      </div>
    );
  }

  const autoSendEmail = watch("auto_send_email");
  const autoSendWhatsapp = watch("auto_send_whatsapp");
  const tone = watch("default_message_tone");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <Section title="Plazos de los seguimientos automáticos">
        <NumberRow
          label="Primera consulta → Segunda consulta"
          help="Días que esperamos antes de disparar el recordatorio (5–60)."
          error={errors.delay_days_first_consultation?.message}
          register={register("delay_days_first_consultation")}
          suffix="días"
          min={5}
          max={60}
        />
        <NumberRow
          label="Segunda consulta → Decisión de tratamiento"
          help="Días de espera antes del segundo recordatorio (5–60)."
          error={errors.delay_days_second_consultation?.message}
          register={register("delay_days_second_consultation")}
          suffix="días"
          min={5}
          max={60}
        />
        <NumberRow
          label="Presupuesto pendiente → Aceptación"
          help="Días que esperamos antes del recordatorio del presupuesto (3–30)."
          error={errors.delay_days_budget_acceptance?.message}
          register={register("delay_days_budget_acceptance")}
          suffix="días"
          min={3}
          max={30}
        />
      </Section>

      <Section title="Reintentos y horario">
        <NumberRow
          label="Intentos máximos por seguimiento"
          help="Después de este número, el caso pasa a Sin respuesta (1–10)."
          error={errors.max_attempts?.message}
          register={register("max_attempts")}
          suffix=""
          min={1}
          max={10}
        />
        <Field
          label="Hora de envío automático"
          help="Hora local en la que se disparan los contactos automáticos."
          error={errors.auto_contact_time?.message}
        >
          <Input
            type="time"
            className="max-w-[160px]"
            {...register("auto_contact_time")}
          />
        </Field>
      </Section>

      <Section title="Canales activos">
        <SwitchRow
          label="Enviar correo automático"
          help="Si está activo, el sistema envía el correo del recordatorio en la hora configurada."
          checked={autoSendEmail}
          onCheckedChange={(v) =>
            setValue("auto_send_email", v, { shouldDirty: true })
          }
        />
        <SwitchRow
          label="Enviar WhatsApp automático"
          help="Si está activo, el sistema usa la plantilla aprobada de WhatsApp Business."
          checked={autoSendWhatsapp}
          onCheckedChange={(v) =>
            setValue("auto_send_whatsapp", v, { shouldDirty: true })
          }
        />
      </Section>

      <Section title="Tono y métricas">
        <Field
          label="Tono por defecto del mensaje"
          help="Aplica a todas las plantillas salvo configuración explícita por regla."
          error={errors.default_message_tone?.message}
        >
          <div className="flex gap-2">
            {(["amable", "directo"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setValue("default_message_tone", value, {
                    shouldDirty: true,
                  })
                }
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors",
                  tone === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:bg-accent"
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </Field>
        <NumberRow
          label="LTV promedio del paciente (S/)"
          help="Se usa para calcular el revenue atribuido en el dashboard de Recuperados."
          error={errors.ltv_promedio_paciente?.message}
          register={register("ltv_promedio_paciente")}
          suffix="S/"
          step="0.01"
        />
      </Section>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-6">
        {isDirty && (
          <span className="text-xs text-muted-foreground">
            Hay cambios sin guardar
          </span>
        )}
        <button
          type="submit"
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Guardar configuración
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex justify-start sm:justify-end">{children}</div>
    </div>
  );
}

function NumberRow({
  label,
  help,
  error,
  register,
  suffix,
  min,
  max,
  step,
}: {
  label: string;
  help?: string;
  error?: string;
  register: UseFormRegisterReturn;
  suffix?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <Field label={label} help={help} error={error}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step ?? "1"}
          className="w-28 text-right"
          {...register}
        />
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </Field>
  );
}

function SwitchRow({
  label,
  help,
  checked,
  onCheckedChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <Field label={label} help={help}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  );
}
