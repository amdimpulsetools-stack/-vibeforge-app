"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { RoleGate } from "@/components/role-gate";
import { toast } from "sonner";
import {
  serviceSchema,
  serviceCategorySchema,
  type ServiceFormData,
  type ServiceCategoryFormData,
} from "@/lib/validations/service";
import { DURATION_OPTIONS } from "@/types/admin";
import type { Service, ServiceCategory } from "@/types/admin";
import Link from "next/link";
import {
  ClipboardList,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Clock,
  DollarSign,
  Tag,
  ChevronDown,
} from "lucide-react";

export default function ServicesPage() {
  const { t } = useLanguage();
  const { isAdmin } = useOrgRole();
  const [services, setServices] = useState<(Service & { service_categories: ServiceCategory })[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [activeTab, setActiveTab] = useState<"services" | "categories">("services");

  const fetchData = async () => {
    const supabase = createClient();
    const [servicesRes, categoriesRes] = await Promise.all([
      supabase
        .from("services")
        .select("*, service_categories(*)")
        .order("display_order"),
      supabase
        .from("service_categories")
        .select("*")
        .order("display_order"),
    ]);
    setServices((servicesRes.data as typeof services) ?? []);
    setCategories(categoriesRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteService = async (id: string) => {
    if (!confirm(t("services.delete_confirm"))) return;
    const supabase = createClient();
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      toast.error(t("services.save_error"));
      return;
    }
    toast.success(t("services.delete_success"));
    fetchData();
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm(t("services.category_delete_confirm"))) return;
    const supabase = createClient();
    const { error } = await supabase.from("service_categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("services.category_delete_success"));
    fetchData();
  };

  const handleToggleServiceActive = async (service: Service) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("services")
      .update({ is_active: !service.is_active })
      .eq("id", service.id);
    if (error) {
      toast.error(t("services.save_error"));
      return;
    }
    toast.success(t("services.save_success"));
    fetchData();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // Group services by category
  const servicesByCategory = categories.map((cat) => ({
    category: cat,
    services: services.filter((s) => s.category_id === cat.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("services.title")}</h1>
          <p className="text-muted-foreground">{t("services.subtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setActiveTab("services")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "services"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("services.title")}
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "categories"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("services.categories")}
        </button>
      </div>

      {/* Services Tab */}
      {activeTab === "services" && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowServiceForm(true);
                  setEditingService(null);
                }}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                {t("services.add")}
              </button>
            </div>
          )}

          {showServiceForm && (
            <div className="rounded-xl border border-border bg-card p-6">
              <ServiceForm
                service={editingService}
                categories={categories}
                onSave={() => {
                  setShowServiceForm(false);
                  setEditingService(null);
                  fetchData();
                }}
                onCancel={() => {
                  setShowServiceForm(false);
                  setEditingService(null);
                }}
              />
            </div>
          )}

          {servicesByCategory.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">{t("services.no_services")}</p>
            </div>
          )}

          {servicesByCategory.map(({ category, services: catServices }) => (
            <div key={category.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Tag className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-primary">{category.name}</h3>
                <span className="text-xs text-muted-foreground">({catServices.length})</span>
              </div>
              {catServices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
                  {t("services.no_services")}
                </div>
              ) : (
                <div className="space-y-2">
                  {catServices.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <h4 className="font-medium">{service.name}</h4>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              S/. {Number(service.base_price).toFixed(2)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {service.duration_minutes} {t("common.minutes_short")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => isAdmin && handleToggleServiceActive(service)}
                          disabled={!isAdmin}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            service.is_active
                              ? "bg-emerald-500/10 text-emerald-500"
                              : "bg-muted text-muted-foreground"
                          } ${!isAdmin ? "cursor-default" : ""}`}
                        >
                          {service.is_active ? t("common.active") : t("common.inactive")}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setEditingService(service);
                              setShowServiceForm(true);
                            }}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteService(service.id)}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowCategoryForm(true);
                  setEditingCategory(null);
                }}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                {t("services.add_category")}
              </button>
            </div>
          )}

          {showCategoryForm && (
            <div className="rounded-xl border border-border bg-card p-6">
              <CategoryForm
                category={editingCategory}
                onSave={() => {
                  setShowCategoryForm(false);
                  setEditingCategory(null);
                  fetchData();
                }}
                onCancel={() => {
                  setShowCategoryForm(false);
                  setEditingCategory(null);
                }}
              />
            </div>
          )}

          {categories.length === 0 && !showCategoryForm && (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Tag className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-muted-foreground">{t("common.no_results")}</p>
            </div>
          )}

          <div className="space-y-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <h4 className="font-medium">{cat.name}</h4>
                  {cat.description && (
                    <p className="text-sm text-muted-foreground">{cat.description}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingCategory(cat);
                        setShowCategoryForm(true);
                      }}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceForm({
  service,
  categories,
  onSave,
  onCancel,
}: {
  service: Service | null;
  categories: ServiceCategory[];
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
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name ?? "",
      category_id: service?.category_id ?? "",
      base_price: service?.base_price ?? 0,
      duration_minutes: service?.duration_minutes ?? 30,
      is_active: service?.is_active ?? true,
    },
  });

  const onSubmit = async (values: ServiceFormData) => {
    if (!service && !organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: values.name,
      category_id: values.category_id,
      base_price: values.base_price,
      duration_minutes: values.duration_minutes,
      is_active: values.is_active,
    };

    if (service) {
      const { error } = await supabase
        .from("services")
        .update(payload)
        .eq("id", service.id);
      if (error) {
        console.error("Service update error:", error);
        toast.error(t("services.save_error") + ": " + error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("services").insert({ ...payload, organization_id: organizationId });
      if (error) {
        console.error("Service insert error:", error);
        toast.error(t("services.save_error") + ": " + error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(t("services.save_success"));
    setSaving(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("services.name")}</label>
          <input
            {...register("name")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="FIV, Ecografía..."
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("services.category")}</label>
          <select
            {...register("category_id")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          >
            <option value="">-- {t("services.category")} --</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {errors.category_id && (
            <p className="text-xs text-destructive">{errors.category_id.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("services.base_price")}</label>
          <input
            type="number"
            step="0.01"
            {...register("base_price")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
          {errors.base_price && (
            <p className="text-xs text-destructive">{errors.base_price.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("services.duration")}</label>
          <select
            {...register("duration_minutes")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} {t("common.minutes_short")}
              </option>
            ))}
          </select>
          {errors.duration_minutes && (
            <p className="text-xs text-destructive">{errors.duration_minutes.message}</p>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("is_active")} className="rounded" />
        {t("services.active")}
      </label>
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

function CategoryForm({
  category,
  onSave,
  onCancel,
}: {
  category: ServiceCategory | null;
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
  } = useForm<ServiceCategoryFormData>({
    resolver: zodResolver(serviceCategorySchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });

  const onSubmit = async (values: ServiceCategoryFormData) => {
    if (!category && !organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: values.name,
      description: values.description || null,
    };

    if (category) {
      const { error } = await supabase
        .from("service_categories")
        .update(payload)
        .eq("id", category.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("service_categories").insert({ ...payload, organization_id: organizationId });
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(t("services.category_save_success"));
    setSaving(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("services.category_name")}</label>
          <input
            {...register("name")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="Fertilidad, Ginecología..."
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
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description.message}</p>
          )}
        </div>
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
