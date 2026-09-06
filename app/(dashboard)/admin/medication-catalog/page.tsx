"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pill,
  Plus,
  Search,
  Loader2,
  Check,
  X,
  Pencil,
  Trash2,
  PackagePlus,
} from "lucide-react";
import {
  MEDICATION_CATALOG_COLUMNS,
  MEDICATION_DURATIONS,
  MEDICATION_FORMS,
  MEDICATION_FREQUENCIES,
  MEDICATION_ROUTES,
  medicationLabel,
  type MedicationCatalogItem,
} from "@/lib/clinical/medication-catalog";

/** Producto vendible de Farmacia (Almacén) candidato a importarse. */
interface PharmacyProduct {
  id: string;
  name: string;
  presentation: string | null;
  category: string | null;
}

const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

const DUPLICATE_MSG =
  "Ya tienes ese medicamento con la misma concentración en el catálogo.";

/** Quita tildes y baja a minúsculas para comparar textos escritos a mano. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Infiere la forma farmacéutica desde la presentación del producto de
 * Farmacia ("Tableta", "Caja x 10 tabletas"…). Si no reconoce ninguna de
 * las opciones, devuelve null: el usuario la completa después.
 */
function inferForm(presentation: string | null): string | null {
  if (!presentation) return null;
  const text = normalize(presentation);
  if (!text) return null;
  for (const form of MEDICATION_FORMS) {
    if (form === "Otro") continue;
    const key = normalize(form);
    if (text === key || text === `${key}s`) return form;
    if (new RegExp(`\\b${key}s?\\b`).test(text)) return form;
  }
  return null;
}

interface FormState {
  name: string;
  concentration: string;
  pharmaceutical_form: string;
  route: string;
  dose_per_take: string;
  frequency: string;
  duration: string;
  default_instructions: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  concentration: "",
  pharmaceutical_form: "",
  route: "",
  dose_per_take: "",
  frequency: "",
  duration: "",
  default_instructions: "",
};

export default function MedicationCatalogPage() {
  const { organizationId } = useOrganization();
  const { hasAddon } = useOrgAddons();
  const confirm = useConfirm();

  const [items, setItems] = useState<MedicationCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Formulario crear/editar
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MedicationCatalogItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Importar desde Farmacia
  const [importOpen, setImportOpen] = useState(false);
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importSearch, setImportSearch] = useState("");
  const [importing, setImporting] = useState(false);

  const almacenEnabled = hasAddon("almacen");

  const fetchItems = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    // RLS ya filtra por org; el .eq() explícito documenta el alcance.
    const { data, error } = await supabase
      .from("medication_catalog")
      .select(MEDICATION_CATALOG_COLUMNS)
      .eq("organization_id", organizationId)
      .order("display_order")
      .order("name");
    if (error) toast.error(error.message);
    setItems((data ?? []) as unknown as MedicationCatalogItem[]);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filtered = useMemo(() => {
    const q = normalize(search);
    if (!q) return items;
    return items.filter((item) =>
      normalize(
        [
          item.name,
          item.concentration ?? "",
          item.pharmaceutical_form ?? "",
          item.route ?? "",
        ].join(" ")
      ).includes(q)
    );
  }, [items, search]);

  // ── Crear / editar ──────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (item: MedicationCatalogItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      concentration: item.concentration ?? "",
      pharmaceutical_form: item.pharmaceutical_form ?? "",
      route: item.route ?? "",
      dose_per_take: item.dose_per_take ?? "",
      frequency: item.frequency ?? "",
      duration: item.duration ?? "",
      default_instructions: item.default_instructions ?? "",
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!organizationId || !form.name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      concentration: form.concentration.trim() || null,
      pharmaceutical_form: form.pharmaceutical_form || null,
      route: form.route || null,
      dose_per_take: form.dose_per_take.trim() || null,
      frequency: form.frequency.trim() || null,
      duration: form.duration.trim() || null,
      default_instructions: form.default_instructions.trim() || null,
    };

    const { error } = editing
      ? await supabase
          .from("medication_catalog")
          .update(payload)
          .eq("id", editing.id)
      : await supabase.from("medication_catalog").insert({
          ...payload,
          organization_id: organizationId,
          display_order: items.length,
        });

    if (error) {
      toast.error(error.code === "23505" ? DUPLICATE_MSG : error.message);
    } else {
      toast.success(editing ? "Medicamento actualizado" : "Medicamento agregado");
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      fetchItems();
    }
    setSaving(false);
  };

  const toggleActive = async (item: MedicationCatalogItem) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("medication_catalog")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else fetchItems();
  };

  const handleDelete = async (item: MedicationCatalogItem) => {
    const ok = await confirm({
      title: "¿Eliminar medicamento?",
      description: `"${medicationLabel(item)}" dejará de sugerirse en las recetas. Las recetas ya emitidas no cambian.`,
      variant: "destructive",
      confirmText: "Eliminar",
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("medication_catalog")
      .delete()
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Medicamento eliminado");
      fetchItems();
    }
  };

  // ── Importar desde Farmacia ─────────────────────────────────────────
  const openImport = async () => {
    if (!organizationId) return;
    setImportOpen(true);
    setSelected(new Set());
    setImportSearch("");
    setLoadingProducts(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("inventory_products")
      .select("id, name, presentation, category")
      .eq("organization_id", organizationId)
      .eq("is_sellable", true)
      .eq("is_discontinued", false)
      .order("name");
    if (error) toast.error(error.message);
    setProducts((data ?? []) as unknown as PharmacyProduct[]);
    setLoadingProducts(false);
  };

  const linkedProductIds = useMemo(
    () =>
      new Set(
        items
          .map((i) => i.inventory_product_id)
          .filter((id): id is string => !!id)
      ),
    [items]
  );

  const importableProducts = useMemo(() => {
    const q = normalize(importSearch);
    return products
      .filter((p) => !linkedProductIds.has(p.id))
      .filter((p) =>
        q
          ? normalize(`${p.name} ${p.presentation ?? ""} ${p.category ?? ""}`).includes(q)
          : true
      );
  }, [products, linkedProductIds, importSearch]);

  const handleImport = async () => {
    if (!organizationId || selected.size === 0) return;
    setImporting(true);
    const supabase = createClient();
    const toImport = products.filter((p) => selected.has(p.id));

    let imported = 0;
    let skipped = 0;
    let failed = 0;

    // Una fila a la vez: si el índice único (nombre + concentración, o el
    // del producto) rechaza una, se salta y las demás siguen entrando.
    for (let index = 0; index < toImport.length; index++) {
      const product = toImport[index];
      const { error } = await supabase.from("medication_catalog").insert({
        organization_id: organizationId,
        name: product.name,
        pharmaceutical_form: inferForm(product.presentation),
        inventory_product_id: product.id,
        display_order: items.length + index,
      });
      if (!error) imported++;
      else if (error.code === "23505") skipped++;
      else {
        failed++;
        if (failed === 1) toast.error(error.message);
      }
    }

    if (imported > 0) {
      toast.success(
        skipped > 0
          ? `${imported} importado${imported === 1 ? "" : "s"} · ${skipped} ya estaba${skipped === 1 ? "" : "n"} en el catálogo`
          : `${imported} medicamento${imported === 1 ? "" : "s"} importado${imported === 1 ? "" : "s"}`
      );
    } else if (skipped > 0) {
      toast.info("Todos los productos seleccionados ya estaban en el catálogo");
    }

    setImporting(false);
    setImportOpen(false);
    setSelected(new Set());
    fetchItems();
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Pill className="h-6 w-6 text-primary" />
            Catálogo de medicamentos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Medicamentos que tu equipo receta con frecuencia. Se autocompletan
            en la receta con sus valores por defecto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {almacenEnabled && (
            <button
              onClick={openImport}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <PackagePlus className="h-4 w-4" />
              Importar desde Farmacia
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nuevo medicamento
          </button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Busca por nombre, concentración o vía"
          className={cn(inputClass, "pl-9")}
        />
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Pill className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-50" />
          <p className="text-sm font-medium">Tu catálogo está vacío</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Agrega los medicamentos que más recetas
            {almacenEnabled
              ? " o impórtalos desde Farmacia. También puedes agregar los que no vendes en la clínica."
              : ". También los que no vendes en la clínica."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-10 text-center text-sm text-muted-foreground">
          Ningún medicamento coincide con &quot;{search}&quot;
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden grid-cols-[2.5fr_1fr_1fr_1.5fr_auto] gap-3 border-b border-border px-4 py-2.5 md:grid">
            <span className={labelClass}>Medicamento</span>
            <span className={labelClass}>Forma</span>
            <span className={labelClass}>Vía</span>
            <span className={labelClass}>Frecuencia / duración</span>
            <span className={labelClass}>Acciones</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[2.5fr_1fr_1fr_1.5fr_auto] md:items-center md:gap-3",
                  !item.is_active && "opacity-50"
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">
                      {item.name}
                      {item.concentration ? ` ${item.concentration}` : ""}
                    </span>
                    {item.inventory_product_id && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Farmacia
                      </span>
                    )}
                    {!item.is_active && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Inactivo
                      </span>
                    )}
                  </div>
                  {item.dose_per_take && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.dose_per_take}
                    </p>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {item.pharmaceutical_form ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {item.route ?? "—"}
                </span>
                <span className="text-sm text-muted-foreground">
                  {[item.frequency, item.duration].filter(Boolean).join(" · ") ||
                    "—"}
                </span>
                <div className="flex items-center gap-1 md:justify-end">
                  <button
                    onClick={() => toggleActive(item)}
                    title={item.is_active ? "Desactivar" : "Activar"}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                  >
                    {item.is_active ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    title="Editar"
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    title="Eliminar"
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar medicamento" : "Nuevo medicamento"}
            </DialogTitle>
            <DialogDescription>
              Los valores por defecto se prellenan en la receta; el doctor
              siempre puede cambiarlos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-name">
                  Nombre *
                </label>
                <input
                  id="med-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Amoxicilina"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-concentration">
                  Concentración
                </label>
                <input
                  id="med-concentration"
                  type="text"
                  value={form.concentration}
                  onChange={(e) =>
                    setForm({ ...form, concentration: e.target.value })
                  }
                  placeholder="500 mg"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-form">
                  Forma farmacéutica
                </label>
                <select
                  id="med-form"
                  value={form.pharmaceutical_form}
                  onChange={(e) =>
                    setForm({ ...form, pharmaceutical_form: e.target.value })
                  }
                  className={inputClass}
                >
                  <option value="">Sin especificar</option>
                  {MEDICATION_FORMS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-route">
                  Vía
                </label>
                <select
                  id="med-route"
                  value={form.route}
                  onChange={(e) => setForm({ ...form, route: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Sin especificar</option>
                  {MEDICATION_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-dose">
                  Dosis por toma
                </label>
                <input
                  id="med-dose"
                  type="text"
                  value={form.dose_per_take}
                  onChange={(e) =>
                    setForm({ ...form, dose_per_take: e.target.value })
                  }
                  placeholder="1 tableta"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-frequency">
                  Frecuencia
                </label>
                <input
                  id="med-frequency"
                  type="text"
                  list="med-frequency-options"
                  value={form.frequency}
                  onChange={(e) =>
                    setForm({ ...form, frequency: e.target.value })
                  }
                  placeholder="Cada 8 horas"
                  className={inputClass}
                />
                <datalist id="med-frequency-options">
                  {MEDICATION_FREQUENCIES.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="med-duration">
                  Duración
                </label>
                <input
                  id="med-duration"
                  type="text"
                  list="med-duration-options"
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: e.target.value })
                  }
                  placeholder="7 días"
                  className={inputClass}
                />
                <datalist id="med-duration-options">
                  {MEDICATION_DURATIONS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="med-instructions">
                Indicaciones por defecto
              </label>
              <textarea
                id="med-instructions"
                value={form.default_instructions}
                onChange={(e) =>
                  setForm({ ...form, default_instructions: e.target.value })
                }
                rows={3}
                placeholder="Tomar después de los alimentos con abundante agua"
                className={cn(inputClass, "resize-y")}
              />
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {editing ? "Guardar" : "Agregar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog importar desde Farmacia */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="flex max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Importar desde Farmacia</DialogTitle>
            <DialogDescription>
              Elige los productos vendibles que también recetas. Se agregan al
              catálogo enlazados a Farmacia; después puedes completar dosis,
              frecuencia e indicaciones.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={importSearch}
              onChange={(e) => setImportSearch(e.target.value)}
              placeholder="Busca un producto"
              className={cn(inputClass, "pl-9")}
            />
          </div>

          <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
            {loadingProducts ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : importableProducts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {products.length === 0
                  ? "No hay productos vendibles en Farmacia."
                  : "No queda ningún producto por importar."}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {importableProducts.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {product.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[product.presentation, product.category]
                          .filter(Boolean)
                          .join(" · ") || "Sin presentación"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              onClick={() => setImportOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PackagePlus className="h-3.5 w-3.5" />
              )}
              Importar seleccionados
              {selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
