"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { usePlan } from "@/hooks/use-plan";
import { RoleGate } from "@/components/role-gate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Crown,
  X,
  Check,
} from "lucide-react";
import type {
  CustomFieldDefinition,
  CustomFieldEntity,
  CustomFieldType,
} from "@/types/custom-fields";

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Texto corto" },
  { value: "textarea", label: "Texto largo" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Lista desplegable" },
  { value: "checkbox", label: "Casilla" },
];

const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Texto",
  textarea: "Texto largo",
  number: "Número",
  date: "Fecha",
  select: "Lista",
  checkbox: "Casilla",
};

const ENTITY_TABS: { value: CustomFieldEntity; label: string }[] = [
  { value: "appointment", label: "Citas" },
  { value: "patient", label: "Pacientes" },
];

const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]{1,49}$/;

function slugifyKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 50);
}

const formSchema = z
  .object({
    label: z.string().min(2, "Mínimo 2 caracteres"),
    field_key: z
      .string()
      .regex(
        FIELD_KEY_REGEX,
        "Debe empezar con letra y usar solo minúsculas, números y guion bajo",
      ),
    field_type: z.enum(["text", "textarea", "number", "date", "select", "checkbox"]),
    options: z.array(z.string().min(1)).default([]),
    placeholder: z.string().optional(),
    help_text: z.string().optional(),
    required: z.boolean().default(false),
    active: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.field_type === "select" && val.options.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Agrega al menos una opción",
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

export default function CustomFieldsPage() {
  const { isAdmin } = useOrgRole();
  const { plan, loading: planLoading } = usePlan();

  if (planLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!plan?.feature_custom_fields) {
    return <UpsellCard />;
  }

  return (
    <RoleGate
      minRole="admin"
      fallback={
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground">
          No tienes permisos para acceder a esta página.
        </div>
      }
    >
      <CustomFieldsContent isAdmin={isAdmin} />
    </RoleGate>
  );
}

function UpsellCard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Campos personalizados</h1>
        <p className="text-muted-foreground">
          Define campos extra para citas y pacientes
        </p>
      </div>
      <div className="relative w-full overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Crown className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Disponible en planes superiores
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Los campos personalizados te permiten capturar información específica de
          tu clínica en citas y pacientes. Esta función está incluida en los planes
          <span className="font-semibold text-foreground"> Centro Médico</span> y{" "}
          <span className="font-semibold text-foreground">Clínica</span>.
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            href="/plans"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Ver planes y mejorar
          </Link>
        </div>
      </div>
    </div>
  );
}

function CustomFieldsContent({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<CustomFieldEntity>("appointment");
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const confirm = useConfirm();

  const fetchData = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("custom_field_definitions")
      .select("*")
      .order("entity_type")
      .order("position");
    if (error) {
      toast.error("No se pudieron cargar los campos: " + error.message);
      setLoading(false);
      return;
    }
    setDefinitions((data as CustomFieldDefinition[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm, editing?.id]);

  const tabDefinitions = useMemo(
    () =>
      definitions
        .filter((d) => d.entity_type === activeTab)
        .sort((a, b) => a.position - b.position),
    [definitions, activeTab],
  );

  const handleDelete = async (def: CustomFieldDefinition) => {
    const ok = await confirm({
      title: "¿Eliminar campo personalizado?",
      description: `Se eliminará "${def.label}". Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("custom_field_definitions")
      .delete()
      .eq("id", def.id);
    if (error) {
      toast.error("No se pudo eliminar: " + error.message);
      return;
    }
    toast.success("Campo eliminado");
    fetchData();
  };

  const handleMove = async (def: CustomFieldDefinition, direction: "up" | "down") => {
    const idx = tabDefinitions.findIndex((d) => d.id === def.id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= tabDefinitions.length) return;
    const other = tabDefinitions[swapIdx];
    const supabase = createClient();
    const [r1, r2] = await Promise.all([
      supabase
        .from("custom_field_definitions")
        .update({ position: other.position })
        .eq("id", def.id),
      supabase
        .from("custom_field_definitions")
        .update({ position: def.position })
        .eq("id", other.id),
    ]);
    if (r1.error || r2.error) {
      toast.error("No se pudo reordenar");
      return;
    }
    fetchData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campos personalizados</h1>
          <p className="text-muted-foreground">
            Define campos extra para citas y pacientes
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {ENTITY_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setActiveTab(tab.value);
              setShowForm(false);
              setEditing(null);
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {isAdmin && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Crear campo
            </button>
          </div>
        )}

        {showForm && (
          <div
            ref={formRef}
            className="rounded-xl border border-border bg-card p-6 scroll-mt-20"
          >
            <FieldForm
              entityType={activeTab}
              definition={editing}
              existing={tabDefinitions}
              onSave={() => {
                setShowForm(false);
                setEditing(null);
                fetchData();
              }}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
            />
          </div>
        )}

        {tabDefinitions.length === 0 && !showForm && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Aún no has creado campos personalizados. Haz clic en &quot;Crear campo&quot;
              para empezar.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {tabDefinitions.map((def, idx) => (
            <div
              key={def.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium truncate">{def.label}</h4>
                    <Badge variant="secondary" className="text-[10px]">
                      {FIELD_TYPE_LABEL[def.field_type]}
                    </Badge>
                    {def.required && (
                      <Badge variant="destructive" className="text-[10px]">
                        Obligatorio
                      </Badge>
                    )}
                    {!def.active && (
                      <Badge variant="outline" className="text-[10px]">
                        Inactivo
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground font-mono">
                    {def.field_key}
                  </div>
                  {def.help_text && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {def.help_text}
                    </div>
                  )}
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleMove(def, "up")}
                    disabled={idx === 0}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                    aria-label="Mover arriba"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMove(def, "down")}
                    disabled={idx === tabDefinitions.length - 1}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                    aria-label="Mover abajo"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(def);
                      setShowForm(true);
                    }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(def)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldForm({
  entityType,
  definition,
  existing,
  onSave,
  onCancel,
}: {
  entityType: CustomFieldEntity;
  definition: CustomFieldDefinition | null;
  existing: CustomFieldDefinition[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const { organizationId } = useOrganization();
  const [saving, setSaving] = useState(false);
  const [optionInput, setOptionInput] = useState("");
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: definition?.label ?? "",
      field_key: definition?.field_key ?? "",
      field_type: definition?.field_type ?? "text",
      options: definition?.options ?? [],
      placeholder: definition?.placeholder ?? "",
      help_text: definition?.help_text ?? "",
      required: definition?.required ?? false,
      active: definition?.active ?? true,
    },
  });

  const fieldType = watch("field_type");
  const labelValue = watch("label");
  const options = watch("options") ?? [];

  useEffect(() => {
    if (!definition && !keyManuallyEdited) {
      setValue("field_key", slugifyKey(labelValue ?? ""), {
        shouldValidate: false,
      });
    }
  }, [labelValue, definition, keyManuallyEdited, setValue]);

  const addOption = () => {
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      toast.error("Esa opción ya existe");
      return;
    }
    setValue("options", [...options, trimmed], { shouldValidate: true });
    setOptionInput("");
  };

  const removeOption = (idx: number) => {
    setValue(
      "options",
      options.filter((_, i) => i !== idx),
      { shouldValidate: true },
    );
  };

  const onSubmit = async (values: FormValues) => {
    if (!definition && !organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      entity_type: entityType,
      label: values.label,
      field_type: values.field_type,
      options: values.field_type === "select" ? values.options : [],
      placeholder:
        values.field_type === "checkbox" ? null : values.placeholder || null,
      help_text: values.help_text || null,
      required: values.required,
      active: values.active,
    };

    if (definition) {
      const { error } = await supabase
        .from("custom_field_definitions")
        .update(payload)
        .eq("id", definition.id);
      if (error) {
        toast.error("No se pudo guardar: " + error.message);
        setSaving(false);
        return;
      }
    } else {
      const maxPosition = existing.reduce(
        (m, d) => (d.position > m ? d.position : m),
        -1,
      );
      const { error } = await supabase.from("custom_field_definitions").insert({
        ...payload,
        organization_id: organizationId,
        field_key: values.field_key,
        position: maxPosition + 1,
      });
      if (error) {
        toast.error("No se pudo guardar: " + error.message);
        setSaving(false);
        return;
      }
    }

    toast.success("Campo guardado");
    setSaving(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Etiqueta</label>
          <input
            {...register("label")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="Ej: Tipo de seguro"
          />
          {errors.label && (
            <p className="text-xs text-destructive">{errors.label.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Identificador (clave)</label>
          <input
            {...register("field_key")}
            readOnly={!!definition}
            onChange={(e) => {
              setKeyManuallyEdited(true);
              setValue("field_key", e.target.value, { shouldValidate: true });
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors disabled:opacity-50 read-only:opacity-70 read-only:cursor-not-allowed"
            placeholder="tipo_de_seguro"
          />
          {errors.field_key && (
            <p className="text-xs text-destructive">{errors.field_key.message}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {definition
              ? "El identificador no se puede cambiar después de crear el campo."
              : "Se genera automáticamente desde la etiqueta. Solo minúsculas, números y guion bajo."}
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tipo de campo</label>
          <select
            {...register("field_type")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          >
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.field_type && (
            <p className="text-xs text-destructive">{errors.field_type.message}</p>
          )}
        </div>
        {fieldType !== "checkbox" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Placeholder</label>
            <input
              {...register("placeholder")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="Texto sugerido dentro del campo"
            />
          </div>
        )}
      </div>

      {fieldType === "select" && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Opciones</label>
          <div className="flex gap-2">
            <input
              value={optionInput}
              onChange={(e) => setOptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="Escribe una opción y presiona Agregar"
            />
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {options.map((opt, idx) => (
                <span
                  key={`${opt}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                >
                  {opt}
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="rounded-full p-0.5 hover:bg-emerald-500/20"
                    aria-label={`Quitar ${opt}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {errors.options && (
            <p className="text-xs text-destructive">
              {errors.options.message as string}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Texto de ayuda</label>
        <input
          {...register("help_text")}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          placeholder="Aparece debajo del campo para guiar al usuario"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("required")} className="rounded" />
          Obligatorio
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("active")} className="rounded" />
          Activo
        </label>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
      </div>
    </form>
  );
}
