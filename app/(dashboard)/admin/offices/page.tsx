"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { toast } from "sonner";
import { officeSchema, type OfficeFormData } from "@/lib/validations/office";
import type { Office } from "@/types/admin";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
} from "lucide-react";

export default function OfficesPage() {
  const { t } = useLanguage();
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchOffices = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("offices")
      .select("*")
      .order("display_order");
    setOffices(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOffices();
  }, []);

  const handleToggleActive = async (office: Office) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("offices")
      .update({ is_active: !office.is_active })
      .eq("id", office.id);

    if (error) {
      toast.error(t("offices.save_error"));
      return;
    }
    toast.success(t("offices.save_success"));
    fetchOffices();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("offices.delete_confirm"))) return;

    const supabase = createClient();
    const { error } = await supabase.from("offices").delete().eq("id", id);

    if (error) {
      toast.error(t("offices.save_error"));
      return;
    }
    toast.success(t("offices.delete_success"));
    fetchOffices();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("offices.title")}</h1>
          <p className="text-muted-foreground">{t("offices.subtitle")}</p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingId(null);
          }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          {t("offices.add")}
        </button>
      </div>

      {showAddForm && (
        <OfficeForm
          onSave={() => {
            setShowAddForm(false);
            fetchOffices();
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {offices.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t("offices.no_offices")}</p>
        </div>
      )}

      <div className="space-y-4">
        {offices.map((office) => (
          <div
            key={office.id}
            className="rounded-xl border border-border bg-card p-6"
          >
            {editingId === office.id ? (
              <OfficeForm
                office={office}
                onSave={() => {
                  setEditingId(null);
                  fetchOffices();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{office.name}</h3>
                    {office.description && (
                      <p className="text-sm text-muted-foreground">
                        {office.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleActive(office)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      office.is_active
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {office.is_active ? t("common.active") : t("common.inactive")}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(office.id);
                      setShowAddForm(false);
                    }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(office.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OfficeForm({
  office,
  onSave,
  onCancel,
}: {
  office?: Office;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const { organizationId } = useOrganization();
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OfficeFormData>({
    resolver: zodResolver(officeSchema),
    defaultValues: {
      name: office?.name ?? "",
      description: office?.description ?? "",
      is_active: office?.is_active ?? true,
    },
  });

  const onSubmit = async (values: OfficeFormData) => {
    setSaving(true);
    const supabase = createClient();

    if (office) {
      const { error } = await supabase
        .from("offices")
        .update({
          name: values.name,
          description: values.description || null,
          is_active: values.is_active,
        })
        .eq("id", office.id);

      if (error) {
        toast.error(t("offices.save_error"));
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("offices").insert({
        name: values.name,
        description: values.description || null,
        is_active: values.is_active,
        organization_id: organizationId,
      });

      if (error) {
        toast.error(t("offices.save_error"));
        setSaving(false);
        return;
      }
    }

    toast.success(t("offices.save_success"));
    setSaving(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("offices.name")}</label>
          <input
            {...register("name")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="Consultorio 1"
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("offices.description")}</label>
          <input
            {...register("description")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="Descripción opcional"
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description.message}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_active")} className="rounded" />
          {t("offices.active")}
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("common.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
