"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RoleGate } from "@/components/role-gate";
import { createClient } from "@/lib/supabase/client";
import { usePlan } from "@/hooks/use-plan";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Check,
  X,
  Lock,
  Copy,
} from "lucide-react";
import Link from "next/link";

interface Service {
  id: string;
  name: string;
}

interface DiscountCode {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  applies_to_service_ids: string[] | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

function formatValue(code: DiscountCode): string {
  return code.type === "percent"
    ? `${code.value}%`
    : `S/ ${Number(code.value).toFixed(2)}`;
}

export default function DiscountCodesAdminPage() {
  const { plan, loading: planLoading } = usePlan();
  const isPro = !!plan && plan.slug !== "starter";

  return (
    <RoleGate minRole="admin">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Códigos de Descuento</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea códigos reutilizables (ej. <code>FAMILIA2026</code>) para
            aplicar descuentos en la recepción o en la reserva pública.
          </p>
        </div>

        {planLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !isPro ? (
          <UpgradePrompt />
        ) : (
          <CodesManager />
        )}
      </div>
    </RoleGate>
  );
}

function UpgradePrompt() {
  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">Función del plan Professional</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Los códigos de descuento reutilizables están disponibles en los planes
        Professional y Enterprise. Tu plan actual permite aplicar descuentos
        manuales en cada cita sin código.
      </p>
      <Link
        href="/select-plan"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Ver planes
      </Link>
    </div>
  );
}

function CodesManager() {
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/discount-codes");
    const json = await res.json();
    setCodes((json.data as DiscountCode[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch_();
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("services")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      setServices((data as Service[]) ?? []);
    })();
  }, [fetch_]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (c: DiscountCode) => {
    setEditing(c);
    setShowForm(true);
  };
  const closeForm = () => {
    setEditing(null);
    setShowForm(false);
  };

  const toggleActive = async (c: DiscountCode) => {
    const res = await fetch(`/api/discount-codes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !c.is_active }),
    });
    if (res.ok) {
      toast.success(c.is_active ? "Código desactivado" : "Código activado");
      fetch_();
    } else {
      toast.error("Error al actualizar");
    }
  };

  const del = async (c: DiscountCode) => {
    if (!confirm(`¿Eliminar el código ${c.code}? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/discount-codes/${c.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Código eliminado");
      fetch_();
    } else {
      toast.error("Error al eliminar");
    }
  };

  const copyCode = (c: DiscountCode) => {
    navigator.clipboard.writeText(c.code);
    toast.success(`Copiado: ${c.code}`);
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nuevo código
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : codes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Tag className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-semibold">Sin códigos creados</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea tu primer código para ofrecer descuentos en tus citas.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Código</th>
                <th className="px-4 py-2 text-left font-medium">Descuento</th>
                <th className="px-4 py-2 text-left font-medium">Usos</th>
                <th className="px-4 py-2 text-left font-medium">Vigencia</th>
                <th className="px-4 py-2 text-left font-medium">Estado</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired =
                  c.valid_until && c.valid_until < new Date().toISOString().split("T")[0];
                const exhausted = c.max_uses != null && c.uses_count >= c.max_uses;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => copyCode(c)}
                        className="group inline-flex items-center gap-1.5 font-mono font-semibold"
                      >
                        {c.code}
                        <Copy className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                      {c.notes && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {c.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{formatValue(c)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs">
                        {c.uses_count}
                        {c.max_uses != null ? ` / ${c.max_uses}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.valid_from || c.valid_until ? (
                        <>
                          {c.valid_from ?? "—"} → {c.valid_until ?? "—"}
                        </>
                      ) : (
                        "Sin límite"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(c)}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          !c.is_active
                            ? "bg-muted text-muted-foreground"
                            : expired
                              ? "bg-amber-500/15 text-amber-700"
                              : exhausted
                                ? "bg-amber-500/15 text-amber-700"
                                : "bg-emerald-500/15 text-emerald-700"
                        )}
                      >
                        {!c.is_active
                          ? "Inactivo"
                          : expired
                            ? "Expirado"
                            : exhausted
                              ? "Agotado"
                              : "Activo"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => del(c)}
                          className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CodeFormModal
          code={editing}
          services={services}
          onClose={closeForm}
          onSaved={() => {
            closeForm();
            fetch_();
          }}
        />
      )}
    </>
  );
}

function CodeFormModal({
  code,
  services,
  onClose,
  onSaved,
}: {
  code: DiscountCode | null;
  services: Service[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!code;
  const [codeVal, setCodeVal] = useState(code?.code ?? "");
  const [type, setType] = useState<"percent" | "fixed">(code?.type ?? "percent");
  const [value, setValue] = useState(String(code?.value ?? ""));
  const [maxUses, setMaxUses] = useState(
    code?.max_uses != null ? String(code.max_uses) : ""
  );
  const [validFrom, setValidFrom] = useState(code?.valid_from ?? "");
  const [validUntil, setValidUntil] = useState(code?.valid_until ?? "");
  const [appliesTo, setAppliesTo] = useState<string[]>(
    code?.applies_to_service_ids ?? []
  );
  const [isActive, setIsActive] = useState(code?.is_active ?? true);
  const [notes, setNotes] = useState(code?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleService = (id: string) => {
    setAppliesTo((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const save = async () => {
    setError(null);
    if (!codeVal.trim() || !value.trim()) {
      setError("Código y valor son obligatorios");
      return;
    }
    const numValue = Number(value);
    if (!numValue || numValue <= 0) {
      setError("El valor debe ser mayor a 0");
      return;
    }
    if (type === "percent" && numValue > 100) {
      setError("El porcentaje no puede exceder 100");
      return;
    }

    const payload: Record<string, unknown> = {
      code: codeVal.trim().toUpperCase(),
      type,
      value: numValue,
      max_uses: maxUses ? Number(maxUses) : null,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      applies_to_service_ids: appliesTo.length > 0 ? appliesTo : null,
      is_active: isActive,
      notes: notes.trim() || null,
    };

    setSaving(true);
    const url = isEdit ? `/api/discount-codes/${code!.id}` : "/api/discount-codes";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Error al guardar");
      return;
    }
    toast.success(isEdit ? "Código actualizado" : "Código creado");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto [&>button]:top-4 [&>button]:right-4">
        <DialogTitle className="text-lg font-bold">
          {isEdit ? "Editar código" : "Nuevo código"}
        </DialogTitle>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">Código *</label>
            <input
              type="text"
              value={codeVal}
              onChange={(e) => setCodeVal(e.target.value.toUpperCase())}
              placeholder="FAMILIA2026"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Estado</label>
            <div className="mt-1 flex gap-1">
              <button
                type="button"
                onClick={() => setIsActive(true)}
                className={cn(
                  "flex-1 rounded-md px-2 py-2 text-xs font-medium",
                  isActive
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                Activo
              </button>
              <button
                type="button"
                onClick={() => setIsActive(false)}
                className={cn(
                  "flex-1 rounded-md px-2 py-2 text-xs font-medium",
                  !isActive
                    ? "bg-zinc-500 text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                Inactivo
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold">Tipo de descuento *</label>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setType("percent")}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                type === "percent"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              Porcentaje (%)
            </button>
            <button
              type="button"
              onClick={() => setType("fixed")}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-medium",
                type === "fixed"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              Monto fijo (S/.)
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">
              Valor * ({type === "percent" ? "%" : "S/."})
            </label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              min="0"
              step={type === "percent" ? "1" : "0.01"}
              placeholder={type === "percent" ? "10" : "50.00"}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">
              Límite de usos (opcional)
            </label>
            <input
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min="1"
              placeholder="Sin límite"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold">Válido desde</label>
            <input
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Válido hasta</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold">
            Servicios específicos (opcional)
          </label>
          <p className="text-[11px] text-muted-foreground">
            Sin selección = aplica a todos los servicios.
          </p>
          <div className="mt-1 flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-lg border border-input bg-background p-2">
            {services.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No hay servicios activos.
              </p>
            ) : (
              services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                    appliesTo.includes(s.id)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {s.name}
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold">Notas internas</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Para qué sirve este código"
            className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {isEdit ? "Guardar cambios" : "Crear código"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
