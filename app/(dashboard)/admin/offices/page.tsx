"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { RoleGate } from "@/components/role-gate";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { usePlan } from "@/hooks/use-plan";

export default function OfficesPage() {
  const { t, language } = useLanguage();
  const { isAdmin } = useOrgRole();
  const confirm = useConfirm();
  const { plan, usage, isAtLimit, getLimit } = usePlan();
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const officeLimitReached = isAtLimit("offices");
  const isIndependientePlan = plan?.target_audience === "independiente";

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
      toast.error(t("offices.save_error") + ": " + error.message);
      return;
    }
    toast.success(t("offices.save_success"));
    fetchOffices();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: t("offices.delete_confirm"),
      confirmText: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;

    const supabase = createClient();
    const { error } = await supabase.from("offices").delete().eq("id", id);

    if (error) {
      toast.error(t("offices.save_error") + ": " + error.message);
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
      {/* Upgrade banner for independiente plan */}
      {plan?.slug === "independiente" && (
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-transparent p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="h-5 w-5 text-emerald-500" />
            <h3 className="text-lg font-semibold">
              {language === "es" ? "Amplía tu clínica" : "Expand your clinic"}
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-start">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {language === "es" ? "Tu plan actual" : "Your current plan"}
              </p>
              <p className="text-sm">1 {language === "es" ? "consultorio" : "office"}</p>
              <p className="text-sm">1 {language === "es" ? "doctor" : "doctor"}</p>
              <p className="text-sm">100 {language === "es" ? "citas/mes" : "appointments/mo"}</p>
            </div>
            <div className="hidden sm:flex items-center justify-center self-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-emerald-500 mb-2">Centro Médico</p>
              <p className="text-sm font-medium">3 {language === "es" ? "consultorios" : "offices"}</p>
              <p className="text-sm font-medium">3 {language === "es" ? "doctores" : "doctors"}</p>
              <p className="text-sm font-medium">500 {language === "es" ? "citas/mes" : "appointments/mo"}</p>
            </div>
          </div>
          <div className="mt-5">
            <a
              href="/plans"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            >
              {language === "es" ? "Mejorar plan" : "Upgrade plan"} — S/349/{language === "es" ? "mes" : "mo"}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("offices.title")}</h1>
          <p className="text-muted-foreground">{t("offices.subtitle")}</p>
        </div>
        <RoleGate minRole="admin">
          <div className="relative group">
            <button
              onClick={() => {
                if (!officeLimitReached) {
                  setShowAddForm(true);
                  setEditingId(null);
                }
              }}
              disabled={officeLimitReached}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity ${
                officeLimitReached
                  ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              }`}
            >
              <Plus className="h-4 w-4" />
              {t("offices.add")}
            </button>
            {officeLimitReached && (
              <div className="absolute right-0 top-full z-50 pt-1">
                <div className="w-72 rounded-lg border border-border bg-popover p-3 shadow-lg text-sm opacity-0 translate-y-1 scale-[0.98] group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 transition-all duration-200 ease-out pointer-events-none group-hover:pointer-events-auto">
                  {isIndependientePlan ? (
                    <p className="text-muted-foreground">
                      {language === "es"
                        ? "Cambie su plan para agregar más consultorios."
                        : "Upgrade your plan to add more offices."}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-muted-foreground">
                        {language === "es"
                          ? `Consultorios llenos (${usage?.offices ?? 0}/${getLimit("offices") ?? 0}). Añada más cupos desde su panel de cuenta.`
                          : `Offices full (${usage?.offices ?? 0}/${getLimit("offices") ?? 0}). Add more slots from your account panel.`}
                      </p>
                      <a
                        href="/account"
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {language === "es" ? "Añadir cupos extra" : "Add extra slots"}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </RoleGate>
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
                    onClick={() => isAdmin && handleToggleActive(office)}
                    disabled={!isAdmin}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      office.is_active
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    } ${!isAdmin ? "cursor-default" : ""}`}
                  >
                    {office.is_active ? t("common.active") : t("common.inactive")}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setEditingId(office.id);
                        setShowAddForm(false);
                      }}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(office.id)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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
    if (!office && !organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
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
        toast.error(t("offices.save_error") + ": " + error.message);
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
        toast.error(t("offices.save_error") + ": " + error.message);
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
