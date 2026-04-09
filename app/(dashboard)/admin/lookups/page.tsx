"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { toast } from "sonner";
import { lookupValueSchema, type LookupValueFormData } from "@/lib/validations/lookup";
import { LOOKUP_SLUGS } from "@/types/admin";
import type { LookupCategory, LookupValue } from "@/types/admin";
import {
  ListOrdered,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  GripVertical,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TAB_CONFIG = [
  { slug: LOOKUP_SLUGS.ORIGIN, labelKey: "lookups.tab_origins", showColor: false },
  { slug: LOOKUP_SLUGS.PAYMENT_METHOD, labelKey: "lookups.tab_payment_methods", showColor: false },
  { slug: LOOKUP_SLUGS.APPOINTMENT_STATUS, labelKey: "lookups.tab_appointment_status", showColor: true },
];

export default function LookupsPage() {
  const { t } = useLanguage();
  const { isAdmin } = useOrgRole();
  const { organizationId } = useOrganization();
  const [categories, setCategories] = useState<(LookupCategory & { lookup_values: LookupValue[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSlug, setActiveSlug] = useState<string>(LOOKUP_SLUGS.ORIGIN);

  const fetchData = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("lookup_categories")
      .select("*, lookup_values(*)")
      .order("slug");

    if (data) {
      // Filter by org scope + sort by display_order within each category
      const sorted = data.map((cat) => ({
        ...cat,
        lookup_values: (cat.lookup_values ?? [])
          .filter((v: LookupValue) => !v.organization_id || v.organization_id === organizationId)
          .sort((a: LookupValue, b: LookupValue) => a.display_order - b.display_order),
      }));
      setCategories(sorted);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const activeCategory = categories.find((c) => c.slug === activeSlug);
  const activeTabConfig = TAB_CONFIG.find((t) => t.slug === activeSlug);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("lookups.title")}</h1>
        <p className="text-muted-foreground">{t("lookups.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.slug}
            onClick={() => setActiveSlug(tab.slug)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
              activeSlug === tab.slug
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Active category values */}
      {activeCategory && (
        <LookupValueList
          category={activeCategory}
          categorySlug={activeSlug}
          showColor={activeTabConfig?.showColor ?? false}
          onUpdate={fetchData}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

/** Core appointment status values that must not be edited/deleted */
const SYSTEM_APPOINTMENT_STATUS_VALUES = new Set([
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

function isSystemProtected(item: LookupValue, categorySlug: string): boolean {
  if (item.is_default) return true;
  if (categorySlug === LOOKUP_SLUGS.APPOINTMENT_STATUS) {
    return SYSTEM_APPOINTMENT_STATUS_VALUES.has(item.value);
  }
  return false;
}

function LookupValueList({
  category,
  categorySlug,
  showColor,
  onUpdate,
  isAdmin,
}: {
  category: LookupCategory & { lookup_values: LookupValue[] };
  categorySlug: string;
  showColor: boolean;
  onUpdate: () => void;
  isAdmin: boolean;
}) {
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingValue, setEditingValue] = useState<LookupValue | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm(t("lookups.delete_confirm"))) return;
    const supabase = createClient();
    const { error } = await supabase.from("lookup_values").delete().eq("id", id);
    if (error) {
      toast.error(t("lookups.save_error"));
      return;
    }
    toast.success(t("lookups.delete_success"));
    onUpdate();
  };

  const handleToggleActive = async (item: LookupValue) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("lookup_values")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) {
      toast.error(t("lookups.save_error"));
      return;
    }
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {category.description}
        </p>
        {isAdmin && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingValue(null);
            }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            {t("lookups.add_value")}
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-6">
          <LookupValueForm
            categoryId={category.id}
            value={editingValue}
            showColor={showColor}
            nextOrder={category.lookup_values.length + 1}
            onSave={() => {
              setShowForm(false);
              setEditingValue(null);
              onUpdate();
            }}
            onCancel={() => {
              setShowForm(false);
              setEditingValue(null);
            }}
          />
        </div>
      )}

      {category.lookup_values.length === 0 && !showForm && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ListOrdered className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">{t("common.no_results")}</p>
        </div>
      )}

      <div className="space-y-2">
        {category.lookup_values.map((item) => {
          const isProtected = isSystemProtected(item, categorySlug);
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-center justify-between rounded-xl border border-border bg-card p-4",
                isProtected && "opacity-75"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-6 text-center">
                  {item.display_order}
                </span>
                {showColor && item.color && (
                  <div
                    className="h-5 w-5 rounded-full border border-border"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-1 text-xs text-muted-foreground font-mono">
                    {item.value}
                  </span>
                  {isProtected && (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => isAdmin && !isProtected && handleToggleActive(item)}
                  disabled={!isAdmin || isProtected}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    item.is_active
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-muted text-muted-foreground",
                    (!isAdmin || isProtected) && "cursor-default"
                  )}
                >
                  {item.is_active ? t("common.active") : t("common.inactive")}
                </button>
                {isAdmin && !isProtected && (
                  <button
                    onClick={() => {
                      setEditingValue(item);
                      setShowForm(true);
                    }}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {isAdmin && !isProtected && (
                  <button
                    onClick={() => handleDelete(item.id)}
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
    </div>
  );
}

function LookupValueForm({
  categoryId,
  value,
  showColor,
  nextOrder,
  onSave,
  onCancel,
}: {
  categoryId: string;
  value: LookupValue | null;
  showColor: boolean;
  nextOrder: number;
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
  } = useForm<LookupValueFormData>({
    resolver: zodResolver(lookupValueSchema),
    defaultValues: {
      label: value?.label ?? "",
      value: value?.value ?? "",
      color: value?.color ?? "",
      display_order: value?.display_order ?? nextOrder,
    },
  });

  const onSubmit = async (data: LookupValueFormData) => {
    if (!value && !organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      category_id: categoryId,
      label: data.label,
      value: data.value,
      color: showColor && data.color ? data.color : null,
      display_order: data.display_order,
    };

    if (value) {
      const { error } = await supabase
        .from("lookup_values")
        .update(payload)
        .eq("id", value.id);
      if (error) {
        toast.error(t("lookups.save_error") + ": " + error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("lookup_values").insert({ ...payload, organization_id: organizationId });
      if (error) {
        toast.error(t("lookups.save_error") + ": " + error.message);
        setSaving(false);
        return;
      }
    }

    toast.success(t("lookups.save_success"));
    setSaving(false);
    onSave();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("lookups.label")}</label>
          <input
            {...register("label")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="TikTok, Efectivo..."
          />
          {errors.label && (
            <p className="text-xs text-destructive">{errors.label.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("lookups.value")}</label>
          <input
            {...register("value")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            placeholder="tiktok, cash..."
          />
          {errors.value && (
            <p className="text-xs text-destructive">{errors.value.message}</p>
          )}
        </div>
        {showColor && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("lookups.color")}</label>
            <div className="flex gap-2">
              <input
                type="color"
                {...register("color")}
                className="h-10 w-12 cursor-pointer rounded-lg border border-input bg-background"
              />
              <input
                {...register("color")}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="#3b82f6"
              />
            </div>
            {errors.color && (
              <p className="text-xs text-destructive">{errors.color.message}</p>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("lookups.order")}</label>
          <input
            type="number"
            {...register("display_order")}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
          />
          {errors.display_order && (
            <p className="text-xs text-destructive">{errors.display_order.message}</p>
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
