"use client";

/**
 * Admin → Conceptos de pago de Tratamientos (addon fertilidad, mig 242).
 *
 * La dueña clasifica UNA vez cada concepto (honorarios / clínica / terceros)
 * y recepción solo elige el concepto al cobrar. El `revenue_bucket` se
 * congela como snapshot en el pago (patient_payments.revenue_bucket), así
 * que reclasificar aquí NO reescribe la historia ya cobrada.
 *
 * Escritura solo admin: la RLS de `treatment_payment_concepts` exige
 * is_org_admin (mig 242) y la API revalida. El gate visual evita que un
 * doctor vea botones que el servidor va a rechazar.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles, Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { FertilityAddonGate } from "@/components/addons/fertility-addon-gate";
import {
  REVENUE_BUCKET_LABELS,
  type RevenueBucket,
  type TreatmentPaymentConcept,
} from "@/types/treatments";

/** Afectación IGV (catálogo 07 SUNAT, mismo vocabulario que services). */
const IGV_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Heredar del servicio" },
  { value: "1", label: "1 · Gravado" },
  { value: "8", label: "8 · Exonerado" },
  { value: "9", label: "9 · Inafecto" },
];

const BUCKET_ORDER: RevenueBucket[] = ["honorarium", "general", "third_party"];

export default function TreatmentConceptsPage() {
  return (
    <FertilityAddonGate
      loadingFallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
      fallback={
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Tags className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-base font-semibold">Pack Fertilidad requerido</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Los conceptos de pago pertenecen al módulo Tratamientos.
          </p>
        </div>
      }
    >
      <TreatmentConceptsAdmin />
    </FertilityAddonGate>
  );
}

function TreatmentConceptsAdmin() {
  const { organizationId } = useOrganization();
  const { isAdmin, loading: roleLoading } = useOrgRole();

  const [concepts, setConcepts] = useState<TreatmentPaymentConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const res = await fetch(
      `/api/treatment-concepts?org_id=${organizationId}&all=1`,
      { cache: "no-store" },
    );
    setLoading(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error ?? "No se pudieron cargar los conceptos");
      return;
    }
    // La API puede responder el array pelado o envuelto en { data }: se
    // aceptan ambas formas para no acoplar esta pantalla a ese detalle.
    const json: unknown = await res.json();
    const list = (
      Array.isArray(json)
        ? json
        : ((json as { data?: unknown }).data ?? [])
    ) as TreatmentPaymentConcept[];
    setConcepts(
      [...list].sort(
        (a, b) =>
          a.display_order - b.display_order ||
          a.label.localeCompare(b.label, "es"),
      ),
    );
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (
    id: string,
    changes: Partial<
      Pick<
        TreatmentPaymentConcept,
        "label" | "revenue_bucket" | "igv_affectation" | "display_order" | "is_active"
      >
    >,
  ) => {
    if (!organizationId) return;
    setSavingId(id);
    // `org_id` va SIEMPRE en la query: la API resuelve el rol contra esa org
    // antes de tocar nada (resolveAccess) y sin él responde 400.
    const res = await fetch(`/api/treatment-concepts?org_id=${organizationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...changes }),
    });
    setSavingId(null);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error ?? "No se pudo guardar el concepto");
      return;
    }
    // Optimista tras confirmar el 2xx: evita repintar toda la tabla por un
    // cambio de un select.
    setConcepts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    );
  };

  const seedDefaults = async () => {
    if (!organizationId) return;
    setSeeding(true);
    const res = await fetch(
      `/api/treatment-concepts?org_id=${organizationId}&seed=1`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    setSeeding(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error ?? "No se pudieron sembrar los conceptos");
      return;
    }
    toast.success("Conceptos por defecto sembrados");
    void load();
  };

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Tags className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-base font-semibold">Solo administradores</p>
        <p className="mt-1 text-sm text-muted-foreground">
          La clasificación de los cobros de un tratamiento la define la
          administración de la clínica.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Conceptos de pago
          </h1>
          <p className="text-muted-foreground">
            El tipo define cómo se clasifica cada cobro en Tratamientos
            (honorarios / clínica / terceros). La afectación IGV se hereda del
            servicio salvo que la fijes aquí.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={seedDefaults}
            disabled={seeding}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {seeding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Sembrar conceptos por defecto
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Agregar concepto
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <ConceptForm
            organizationId={organizationId}
            nextOrder={
              concepts.reduce((max, c) => Math.max(max, c.display_order), 0) + 10
            }
            onCancel={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              void load();
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : concepts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Tags className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            Todavía no hay conceptos. Sembrá los por defecto y ajustá lo que
            haga falta.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {concepts.map((c) => (
            <div
              key={c.id}
              className={cn(
                "rounded-xl border border-border bg-card p-3 sm:p-4",
                !c.is_active && "opacity-60",
              )}
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_5rem_auto] sm:items-end">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Concepto
                  </label>
                  <input
                    defaultValue={c.label}
                    onBlur={(e) => {
                      const label = e.target.value.trim();
                      if (!label || label === c.label) {
                        e.target.value = c.label;
                        return;
                      }
                      void patch(c.id, { label });
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {c.key}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Tipo
                  </label>
                  <select
                    value={c.revenue_bucket}
                    onChange={(e) =>
                      void patch(c.id, {
                        revenue_bucket: e.target.value as RevenueBucket,
                      })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {BUCKET_ORDER.map((b) => (
                      <option key={b} value={b}>
                        {REVENUE_BUCKET_LABELS[b]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Afectación IGV
                  </label>
                  <select
                    value={c.igv_affectation != null ? String(c.igv_affectation) : ""}
                    onChange={(e) =>
                      void patch(c.id, {
                        igv_affectation: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {IGV_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Orden
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    defaultValue={c.display_order}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next) || next === c.display_order) {
                        e.target.value = String(c.display_order);
                        return;
                      }
                      void patch(c.id, { display_order: next });
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-input bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void patch(c.id, { is_active: !c.is_active })}
                    disabled={savingId === c.id}
                    className={cn(
                      "min-h-[44px] rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                      c.is_active
                        ? "bg-success-500/10 text-success-500"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.is_active ? "Activo" : "Inactivo"}
                  </button>
                  {savingId === c.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConceptForm({
  organizationId,
  nextOrder,
  onCancel,
  onSaved,
}: {
  organizationId: string | null;
  nextOrder: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [bucket, setBucket] = useState<RevenueBucket>("general");
  const [igv, setIgv] = useState("");
  const [order, setOrder] = useState(String(nextOrder));
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("El concepto necesita un nombre");
      return;
    }
    if (!organizationId) {
      toast.error("No se encontró la organización. Recargá la página.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/treatment-concepts?org_id=${organizationId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label.trim(),
        revenue_bucket: bucket,
        igv_affectation: igv ? Number(igv) : null,
        display_order: Number(order) || nextOrder,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(err.error ?? "No se pudo crear el concepto");
      return;
    }
    toast.success("Concepto creado");
    onSaved();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Concepto</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Medicación, Laboratorio…"
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tipo</label>
          <select
            value={bucket}
            onChange={(e) => setBucket(e.target.value as RevenueBucket)}
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {BUCKET_ORDER.map((b) => (
              <option key={b} value={b}>
                {REVENUE_BUCKET_LABELS[b]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Afectación IGV</label>
          <select
            value={igv}
            onChange={(e) => setIgv(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {IGV_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Orden</label>
          <input
            type="number"
            inputMode="numeric"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
