"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { RoleGate } from "@/components/role-gate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { useFertilityAddon } from "@/hooks/use-fertility-addon";
import { FertilityAddonGate } from "@/components/addons/fertility-addon-gate";
import {
  serviceSchema,
  serviceCategorySchema,
  SERVICE_MODALITY_OPTIONS,
  IGV_AFFECTATION_OPTIONS,
  UNIT_OF_MEASURE_OPTIONS,
  TIER_LETTERS,
  TIER_CURRENCY_OPTIONS,
  type ServiceFormData,
  type ServiceCategoryFormData,
  type TierLetter,
} from "@/lib/validations/service";
import { DURATION_OPTIONS, SERVICE_MODALITY_LABELS } from "@/types/admin";
import type { Service, ServiceCategory } from "@/types/admin";
import { useEInvoiceConfig } from "@/hooks/use-einvoice-config";
import { ZoomIcon } from "@/components/icons/zoom-icon";
import { BulkImportModal } from "./bulk-import-modal";
import Link from "next/link";
import {
  ClipboardList,
  Plus,
  Upload,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Clock,
  Coins,
  Tag,
  ChevronDown,
  Building2,
  Video,
  FolderTree,
  Stethoscope,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export default function ServicesPage() {
  const { t } = useLanguage();
  const { isAdmin } = useOrgRole();
  const { active: fertilityActive } = useFertilityAddon();
  const confirm = useConfirm();
  const [services, setServices] = useState<(Service & { service_categories: ServiceCategory })[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Scroll the form into view when it opens (either via "Crear" or "Editar")
  useEffect(() => {
    if (showServiceForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showServiceForm, editingService?.id]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [activeTab, setActiveTab] = useState<"services" | "categories">("services");

  const fetchData = async () => {
    const supabase = createClient();
    const [servicesRes, categoriesRes] = await Promise.all([
      supabase
        .from("services")
        .select("*, service_categories(id, name)")
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
    const ok = await confirm({
      title: t("services.delete_confirm"),
      confirmText: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
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
    const ok = await confirm({
      title: t("services.category_delete_confirm"),
      confirmText: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
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

  // First-time empty state: no categories AND no services.
  // Hide once the owner opens the category form so the inline form can take over.
  if (
    isAdmin &&
    categories.length === 0 &&
    services.length === 0 &&
    !showCategoryForm
  ) {
    return (
      <EmptyStateCategories
        onCreate={() => {
          setActiveTab("categories");
          setEditingCategory(null);
          setShowCategoryForm(true);
        }}
      />
    );
  }

  // Second-step empty state: at least one category but still no services.
  if (
    isAdmin &&
    categories.length > 0 &&
    services.length === 0 &&
    !showServiceForm &&
    !showCategoryForm
  ) {
    return (
      <EmptyStateServices
        onCreateService={() => {
          setActiveTab("services");
          setEditingService(null);
          setShowServiceForm(true);
        }}
        onCreateCategory={() => {
          setActiveTab("categories");
          setEditingCategory(null);
          setShowCategoryForm(true);
        }}
      />
    );
  }

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
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkImport(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title={t("services.bulk_import")}
              >
                <Upload className="h-4 w-4" />
                {t("services.bulk_import")}
              </button>
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
            <div ref={formRef} className="rounded-xl border border-border bg-card p-6 scroll-mt-20">
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
                  {catServices.map((service) => {
                    const isAddonManaged = Boolean(
                      (service as { created_by_addon?: string | null })
                        .created_by_addon,
                    );
                    return (
                    <div
                      key={service.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{service.name}</h4>
                            {fertilityActive && isAddonManaged && (
                              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                <Sparkles className="h-3 w-3" />
                                Addon Fertilidad
                              </span>
                            )}
                            {(service as any).modality === "virtual" && (
                              <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                <ZoomIcon className="h-3 w-3" />
                                Virtual
                              </span>
                            )}
                            {(service as any).modality === "both" && (
                              <span className="flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                                <Video className="h-3 w-3" />
                                Presencial / Virtual
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Coins className="h-3 w-3" />
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
                        {isAdmin && !isAddonManaged && (
                          <button
                            onClick={() => handleDeleteService(service.id)}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bulk import modal */}
      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => {
            setShowBulkImport(false);
            fetchData();
          }}
        />
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

interface TierRowState {
  tier: TierLetter;
  amount: string;
  currency: "PEN" | "USD";
  includes_text: string;
  notes: string;
  is_active: boolean;
}

function emptyTierRows(): TierRowState[] {
  return TIER_LETTERS.map((tier) => ({
    tier,
    amount: "",
    currency: "PEN" as const,
    includes_text: "",
    notes: "",
    is_active: true,
  }));
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
  const { active: fertilityActive } = useFertilityAddon();
  const [saving, setSaving] = useState(false);
  const [tierRows, setTierRows] = useState<TierRowState[]>(() => emptyTierRows());
  const [tiersLoading, setTiersLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name ?? "",
      category_id: service?.category_id ?? "",
      base_price: service?.base_price ?? 0,
      duration_minutes: service?.duration_minutes ?? 30,
      modality: (service as any)?.modality ?? "in_person",
      pre_appointment_instructions: (service as any)?.pre_appointment_instructions ?? "",
      requires_consent: (service as { requires_consent?: boolean })?.requires_consent ?? false,
      is_active: service?.is_active ?? true,
      sunat_product_code: (service as { sunat_product_code?: string })?.sunat_product_code ?? "",
      unit_of_measure: (service as { unit_of_measure?: string })?.unit_of_measure ?? "ZZ",
      igv_affectation: (service as { igv_affectation?: number })?.igv_affectation ?? 1,
      is_budget_eligible:
        (service as { is_budget_eligible?: boolean })?.is_budget_eligible ?? false,
    },
  });

  const isBudgetEligible = watch("is_budget_eligible");

  // Load existing tiers when editing an existing service that has the
  // addon active. Skipped for create-mode (service.id is required).
  useEffect(() => {
    if (!service?.id || !fertilityActive) return;
    let cancelled = false;
    setTiersLoading(true);
    fetch(`/api/services/${service.id}/tiers`)
      .then(async (res) => {
        if (!res.ok) return null;
        const json = (await res.json()) as {
          tiers?: Array<{
            tier: TierLetter;
            amount: number | string;
            currency: string;
            includes_text: string | null;
            notes: string | null;
            is_active: boolean;
          }>;
        };
        return json.tiers ?? [];
      })
      .then((rows) => {
        if (cancelled) return;
        const baseline = emptyTierRows();
        if (rows && rows.length > 0) {
          const byTier = new Map(rows.map((r) => [r.tier, r]));
          for (const row of baseline) {
            const found = byTier.get(row.tier);
            if (found) {
              row.amount = String(found.amount ?? "");
              row.currency = (found.currency === "USD" ? "USD" : "PEN");
              row.includes_text = found.includes_text ?? "";
              row.notes = found.notes ?? "";
              row.is_active = found.is_active;
            }
          }
        }
        setTierRows(baseline);
      })
      .finally(() => {
        if (!cancelled) setTiersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service?.id, fertilityActive]);

  const updateTierRow = (idx: number, patch: Partial<TierRowState>) => {
    setTierRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleSaveTiers = async (serviceId: string) => {
    setSaving(true);
    try {
      const payload = {
        tiers: tierRows.map((r) => ({
          tier: r.tier,
          amount: r.amount === "" ? 0 : Number(r.amount),
          currency: r.currency,
          includes_text: r.includes_text || null,
          notes: r.notes || null,
          is_active: r.is_active,
        })),
      };
      const res = await fetch(`/api/services/${serviceId}/tiers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? "No se pudieron guardar los tiers");
        return;
      }
      toast.success("Tiers guardados");
    } catch {
      toast.error("No se pudieron guardar los tiers");
    } finally {
      setSaving(false);
    }
  };

  const einvoiceConfig = useEInvoiceConfig();

  const onSubmit = async (values: ServiceFormData) => {
    if (!service && !organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      name: values.name,
      category_id: values.category_id,
      base_price: values.base_price,
      duration_minutes: values.duration_minutes,
      modality: values.modality,
      pre_appointment_instructions: values.pre_appointment_instructions || null,
      requires_consent: values.requires_consent,
      is_active: values.is_active,
    };

    // Budget eligibility flag — only persist when the addon is active.
    // For inactive orgs the field is invisible in the UI; we still
    // pass through whatever the existing record had.
    if (fertilityActive) {
      payload.is_budget_eligible = values.is_budget_eligible;
    }

    // Only persist fiscal fields if e-invoicing is connected — otherwise we
    // leave whatever was there (or NULL for new services). This keeps the
    // module truly invisible when off.
    if (einvoiceConfig.connected) {
      payload.sunat_product_code = values.sunat_product_code || null;
      payload.unit_of_measure = values.unit_of_measure || "ZZ";
      payload.igv_affectation = values.igv_affectation ?? 1;
    }

    if (service) {
      const { error } = await supabase
        .from("services")
        .update(payload)
        .eq("id", service.id);
      if (error) {
        toast.error(t("services.save_error") + ": " + error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("services").insert({ ...payload, organization_id: organizationId });
      if (error) {
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

      {/* Modality selector */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Modalidad</label>
        <div className="flex gap-2">
          {SERVICE_MODALITY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium cursor-pointer transition-all ${
                watch("modality") === opt.value
                  ? opt.value === "virtual"
                    ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    : opt.value === "both"
                    ? "border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400"
                    : "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground/30"
              }`}
            >
              <input
                type="radio"
                value={opt.value}
                {...register("modality")}
                className="sr-only"
              />
              {opt.value === "in_person" && <Building2 className="h-4 w-4" />}
              {opt.value === "virtual" && <ZoomIcon className="h-4 w-4" />}
              {opt.value === "both" && <Video className="h-4 w-4" />}
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Pre-appointment instructions */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Instrucciones previas para el paciente</label>
        <textarea
          {...register("pre_appointment_instructions")}
          rows={2}
          placeholder="Ej: Venir en ayunas 8 horas antes, traer exámenes previos, etc."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Estas instrucciones se incluirán automáticamente en los correos de confirmación usando la variable <code className="rounded bg-muted px-1">{"{{instrucciones_servicio}}"}</code>.
        </p>
        {errors.pre_appointment_instructions && (
          <p className="text-xs text-destructive">{errors.pre_appointment_instructions.message}</p>
        )}
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          {...register("requires_consent")}
          className="mt-0.5 rounded"
        />
        <div className="flex-1">
          <div className="font-medium">Requiere consentimiento informado</div>
          <div className="text-xs text-muted-foreground">
            Marca los procedimientos con riesgo (cirugía, anestesia, estética,
            radiación, etc.). El doctor verá un recordatorio en la nota
            clínica y la ficha del paciente alertará si falta el documento firmado.
          </div>
        </div>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("is_active")} className="rounded" />
        {t("services.active")}
      </label>

      {/* Bloque addon Fertilidad — tiers A/B/C */}
      <FertilityAddonGate>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              {...register("is_budget_eligible")}
              className="mt-0.5 rounded"
            />
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                Habilitar para presupuestos del addon Fertilidad
              </div>
              <div className="text-xs text-muted-foreground">
                Marca este servicio como elegible para tiers A/B/C. La asesora podrá
                asignar uno de los tres paquetes a la paciente al cotizar.
              </div>
            </div>
          </label>

          {isBudgetEligible && (
            <div className="space-y-3 pt-2 border-t border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Tiers de presupuesto (A/B/C)</div>
                  <p className="text-xs text-muted-foreground">
                    Configura los tres paquetes de precios de este servicio.
                    Define qué incluye cada uno para que la paciente entienda la diferencia.
                  </p>
                </div>
              </div>

              {!service ? (
                <div className="rounded-lg border border-dashed border-emerald-500/40 bg-card/50 p-3 text-xs text-muted-foreground">
                  Primero guarda el servicio. Después podrás configurar los tiers.
                </div>
              ) : tiersLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cargando tiers…
                </div>
              ) : (
                <div className="space-y-3">
                  {tierRows.map((row, idx) => (
                    <div
                      key={row.tier}
                      className="rounded-lg border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {row.tier}
                          </span>
                          <span className="text-sm font-medium">Tier {row.tier}</span>
                        </div>
                        <label className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={row.is_active}
                            onChange={(e) =>
                              updateTierRow(idx, { is_active: e.target.checked })
                            }
                            className="rounded"
                          />
                          Activo
                        </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-xs font-medium">Monto</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.amount}
                            onChange={(e) =>
                              updateTierRow(idx, { amount: e.target.value })
                            }
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Moneda</label>
                          <select
                            value={row.currency}
                            onChange={(e) =>
                              updateTierRow(idx, {
                                currency: e.target.value === "USD" ? "USD" : "PEN",
                              })
                            }
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                          >
                            {TIER_CURRENCY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">
                          Qué incluye{" "}
                          <span className="text-muted-foreground font-normal">(opcional)</span>
                        </label>
                        <textarea
                          rows={2}
                          value={row.includes_text}
                          onChange={(e) =>
                            updateTierRow(idx, { includes_text: e.target.value })
                          }
                          placeholder="Ej: Honorarios + estimulación + congelación"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">
                          Notas internas{" "}
                          <span className="text-muted-foreground font-normal">(opcional)</span>
                        </label>
                        <textarea
                          rows={2}
                          value={row.notes}
                          onChange={(e) => updateTierRow(idx, { notes: e.target.value })}
                          placeholder="Notas privadas del admin (no se muestran a la paciente)"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors resize-none"
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => handleSaveTiers(service.id)}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors dark:text-emerald-400"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Guardar tiers
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </FertilityAddonGate>

      {/* Bloque fiscal — solo visible si Nubefact está conectado */}
      {einvoiceConfig.connected && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">
            Datos fiscales (SUNAT)
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            Estos campos se usan al emitir comprobantes electrónicos para este servicio.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs font-medium mb-1">Afectación IGV</div>
              <select
                {...register("igv_affectation", { valueAsNumber: true })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {IGV_AFFECTATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="text-xs font-medium mb-1">Unidad de medida</div>
              <select
                {...register("unit_of_measure")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {UNIT_OF_MEASURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <div className="text-xs font-medium mb-1">
              Código de producto SUNAT{" "}
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </div>
            <input
              type="text"
              {...register("sunat_product_code")}
              placeholder="Ej: 85121800 — Servicios de obstetricia"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Si no estás seguro, déjalo vacío. Tu contador puede asesorarte después.
            </div>
          </label>
        </div>
      )}

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

function EmptyStateCategories({ onCreate }: { onCreate: () => void }) {
  const examples = ["Consultas", "Procedimientos", "Exámenes"];
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <FolderTree className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Empieza creando tu primera categoría
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Las categorías agrupan tus servicios para que sea más fácil encontrarlos.
          Por ejemplo: Consultas, Procedimientos, Exámenes.
        </p>
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crear mi primera categoría
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {examples.map((ex) => (
            <span
              key={ex}
              className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              {ex}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyStateServices({
  onCreateService,
  onCreateCategory,
}: {
  onCreateService: () => void;
  onCreateCategory: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Stethoscope className="h-8 w-8 text-emerald-500" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
          Listo, ahora crea tu primer servicio
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Cada servicio se asigna a una categoría. Define duración, precio, y si
          requiere consentimiento informado.
        </p>
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={onCreateService}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crear mi primer servicio
          </button>
        </div>
        <div className="mt-5 text-xs text-muted-foreground">
          ¿Quieres crear más categorías primero?{" "}
          <button
            type="button"
            onClick={onCreateCategory}
            className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Crear otra categoría
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
