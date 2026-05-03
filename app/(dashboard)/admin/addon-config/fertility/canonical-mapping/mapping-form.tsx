"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Loader2,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  FERTILITY_ESSENTIAL_CATEGORIES,
  type FertilityCanonicalMapping,
} from "@/types/fertility";

interface OrgServiceLite {
  id: string;
  name: string;
  category_name?: string | null;
}

interface CategoryRow {
  category_key: string;
  display_name: string;
  description: string | null;
  sort_order: number;
  is_essential?: boolean;
}

interface CanonicalMappingApiResponse {
  categories: CategoryRow[];
  mappings: { category_key: string; services: { id: string; name: string }[] }[];
}

interface CanonicalMappingState {
  categories: CategoryRow[];
  mappings: FertilityCanonicalMapping[];
  services: OrgServiceLite[];
}

const ESSENTIAL = new Set<string>(FERTILITY_ESSENTIAL_CATEGORIES);

export function MappingForm() {
  const router = useRouter();
  const [data, setData] = useState<CanonicalMappingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mappingState, setMappingState] = useState<Record<string, string[]>>({});
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const [apiRes, servicesRes] = await Promise.all([
          fetch("/api/admin/fertility/canonical-mapping", {
            cache: "no-store",
          }),
          supabase
            .from("services")
            .select("id, name, is_active, service_categories(name)")
            .eq("is_active", true)
            .order("display_order"),
        ]);
        if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`);
        const json = (await apiRes.json()) as CanonicalMappingApiResponse;
        if (cancelled) return;

        const services: OrgServiceLite[] = (servicesRes.data ?? []).map(
          (s) => {
            const cat = s.service_categories as unknown as
              | { name: string }
              | null;
            return {
              id: s.id,
              name: s.name,
              category_name: cat?.name ?? null,
            };
          }
        );

        const flatMappings: FertilityCanonicalMapping[] = json.mappings.map(
          (m) => ({
            category_key: m.category_key,
            service_ids: m.services.map((s) => s.id),
          })
        );

        setData({
          categories: json.categories,
          mappings: flatMappings,
          services,
        });

        const initial: Record<string, string[]> = {};
        for (const cat of json.categories) {
          initial[cat.category_key] = [];
        }
        for (const m of flatMappings) {
          initial[m.category_key] = m.service_ids;
        }
        setMappingState(initial);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "No pudimos cargar las categorías"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCategory = (categoryKey: string, serviceIds: string[]) => {
    dirtyRef.current = true;
    setMappingState((prev) => ({ ...prev, [categoryKey]: serviceIds }));
  };

  const handleSave = async (mode: "continue" | "stay"): Promise<boolean> => {
    if (!data) return false;

    const missingEssentials = FERTILITY_ESSENTIAL_CATEGORIES.filter(
      (key) => !mappingState[key] || mappingState[key].length === 0
    );

    const payload: FertilityCanonicalMapping[] = data.categories
      .map((cat) => ({
        category_key: cat.category_key,
        service_ids: mappingState[cat.category_key] ?? [],
      }))
      .filter((m) => m.service_ids.length > 0);

    setSaving(true);
    try {
      const res = await fetch("/api/admin/fertility/canonical-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (missingEssentials.length > 0) {
        toast.warning(
          "Las reglas Tier 2 no funcionarán hasta que mapees primera consulta, segunda consulta y decisión de tratamiento.",
          { duration: 6000 }
        );
      } else {
        toast.success("Mapeo guardado correctamente");
      }

      dirtyRef.current = false;

      if (mode === "continue") {
        router.push("/admin/addon-config/fertility/settings");
      }
      return true;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar el mapeo"
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SkeletonRows />;

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 rounded-lg border border-destructive/30 bg-card px-3 py-1.5 text-xs hover:bg-destructive/10"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  if (data.services.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <h3 className="text-base font-semibold">Aún no tienes servicios</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Para mapear categorías a tu catálogo necesitas crear primero los
          servicios que ofrece tu clínica.
        </p>
        <Link
          href="/admin/services"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Crear servicios
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.2fr_1fr] md:items-start">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Categoría
          </p>
          <p className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground md:block">
            Tus servicios
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {data.categories.map((category) => {
            const isEssential = ESSENTIAL.has(category.category_key);
            const selected = mappingState[category.category_key] ?? [];
            return (
              <div
                key={category.category_key}
                className={cn(
                  "grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[1.2fr_1fr] md:items-start",
                  isEssential
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-border/60"
                )}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {isEssential && (
                      <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    )}
                    <h3 className="text-sm font-semibold leading-tight">
                      {category.display_name}
                    </h3>
                  </div>
                  {category.description && (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  )}
                  {isEssential && (
                    <p className="text-[11px] font-medium text-amber-600">
                      Obligatorio para que las reglas Tier 2 funcionen
                    </p>
                  )}
                </div>

                <ServiceMultiSelect
                  services={data.services}
                  selectedIds={selected}
                  onChange={(ids) =>
                    updateCategory(category.category_key, ids)
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Las categorías sin servicios mapeados no disparan reglas en tu
          organización. Puedes mapearlas más adelante.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => handleSave("stay")}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Guardar y configurar después
          </button>
          <button
            type="button"
            onClick={() => handleSave("continue")}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 14 }).map((_, idx) => (
        <div
          key={idx}
          className="h-16 animate-pulse rounded-lg border border-border/40 bg-muted/40"
        />
      ))}
    </div>
  );
}

function ServiceMultiSelect({
  services,
  selectedIds,
  onChange,
}: {
  services: OrgServiceLite[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedServices = useMemo(
    () => services.filter((s) => selectedSet.has(s.id)),
    [services, selectedSet]
  );

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? services.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.category_name ?? "").toLowerCase().includes(q)
        )
      : services;
    return list.slice(0, 80);
  }, [services, query]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <span
              className={cn(
                "truncate",
                selectedServices.length === 0 && "text-muted-foreground"
              )}
            >
              {selectedServices.length === 0
                ? "Selecciona servicios..."
                : `${selectedServices.length} servicio${
                    selectedServices.length === 1 ? "" : "s"
                  } seleccionado${selectedServices.length === 1 ? "" : "s"}`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar servicio..."
              className="flex h-7 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filteredServices.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Sin resultados
              </div>
            ) : (
              filteredServices.map((service) => {
                const isActive = selectedSet.has(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => toggle(service.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      isActive && "bg-accent/50"
                    )}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="truncate font-medium">
                        {service.name}
                      </span>
                      {service.category_name && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          {service.category_name}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedServices.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedServices.map((service) => (
            <span
              key={service.id}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              {service.name}
              <button
                type="button"
                onClick={() => toggle(service.id)}
                className="rounded-full hover:bg-primary/20"
                aria-label={`Quitar ${service.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
