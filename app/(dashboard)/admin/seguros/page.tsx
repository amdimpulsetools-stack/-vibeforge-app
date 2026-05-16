"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import { usePlan } from "@/hooks/use-plan";
import { useOrgInsurance } from "@/hooks/use-org-insurance";
import { RoleGate } from "@/components/role-gate";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Loader2,
  ShieldPlus,
  Sparkles,
  Crown,
  X,
  Check,
  Search,
} from "lucide-react";
import type {
  InsuranceCarrier,
  OrganizationInsuranceCarrierWithName,
} from "@/types/insurance";

export default function SegurosPage() {
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

  if (!plan?.feature_insurance) {
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
      <SegurosContent isAdmin={isAdmin} />
    </RoleGate>
  );
}

function UpsellCard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Seguros</h1>
        <p className="text-muted-foreground">
          Configura aseguradoras, % de cobertura y servicios incluidos
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
          La gestión de seguros te permite registrar aseguradoras, definir % de
          cobertura y calcular automáticamente el copago del paciente. Esta función
          está incluida en los planes
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

function SegurosContent({ isAdmin }: { isAdmin: boolean }) {
  const { organizationId } = useOrganization();
  const { enabled, carriers, catalog, loading, refetch } = useOrgInsurance();
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [servicesModalCarrier, setServicesModalCarrier] =
    useState<OrganizationInsuranceCarrierWithName | null>(null);
  const [coverageDrafts, setCoverageDrafts] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLDivElement | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

  const availableCatalog = useMemo(() => {
    const usedIds = new Set(
      carriers.map((c) => c.carrier_id).filter((id): id is string => !!id),
    );
    return catalog.filter((c) => !usedIds.has(c.id));
  }, [carriers, catalog]);

  const toggleGlobalEnabled = async (next: boolean) => {
    if (!organizationId) return;
    setTogglingGlobal(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("organization_insurance_settings")
      .upsert(
        { organization_id: organizationId, enabled: next },
        { onConflict: "organization_id" },
      );
    setTogglingGlobal(false);
    if (error) {
      toast.error("No se pudo actualizar: " + error.message);
      return;
    }
    toast.success(next ? "Seguros activados" : "Seguros desactivados");
    refetch();
  };

  const toggleCarrierEnabled = async (
    row: OrganizationInsuranceCarrierWithName,
    next: boolean,
  ) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("organization_insurance_carriers")
      .update({ enabled: next })
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo actualizar: " + error.message);
      return;
    }
    refetch();
  };

  const saveCoverage = async (
    row: OrganizationInsuranceCarrierWithName,
    raw: string,
  ) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("La cobertura debe estar entre 0 y 100");
      setCoverageDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      return;
    }
    if (parsed === row.coverage_percent) {
      setCoverageDrafts((d) => {
        const next = { ...d };
        delete next[row.id];
        return next;
      });
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("organization_insurance_carriers")
      .update({ coverage_percent: parsed })
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo guardar: " + error.message);
      return;
    }
    toast.success("Cobertura actualizada");
    setCoverageDrafts((d) => {
      const next = { ...d };
      delete next[row.id];
      return next;
    });
    refetch();
  };

  const handleDelete = async (row: OrganizationInsuranceCarrierWithName) => {
    const ok = await confirm({
      title: "¿Eliminar aseguradora?",
      description: `Se eliminará "${row.display_name}" y todas sus coberturas y afiliaciones de pacientes. Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      variant: "destructive",
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("organization_insurance_carriers")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo eliminar: " + error.message);
      return;
    }
    toast.success("Aseguradora eliminada");
    refetch();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Seguros</h1>
        <p className="text-muted-foreground">
          Configura aseguradoras, % de cobertura y servicios incluidos
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold">Trabajar con seguros</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuando está activo, las citas pueden registrarse como cobertura de
              seguro con cálculo automático del copago.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {togglingGlobal && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={enabled}
              onCheckedChange={toggleGlobalEnabled}
              disabled={!isAdmin || togglingGlobal}
            />
          </div>
        </div>
      </div>

      <div
        className={`space-y-4 ${
          !enabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Aseguradoras</h2>
          {isAdmin && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              Agregar aseguradora
            </button>
          )}
        </div>

        {showForm && (
          <div
            ref={formRef}
            className="rounded-xl border border-border bg-card p-6 scroll-mt-20"
          >
            <AddCarrierForm
              availableCatalog={availableCatalog}
              onSave={() => {
                setShowForm(false);
                refetch();
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {carriers.length === 0 && !showForm && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <ShieldPlus className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              Aún no has agregado aseguradoras. Activa el toggle de arriba y luego
              agrega tu primera aseguradora.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {carriers.map((row) => {
            const draft = coverageDrafts[row.id];
            const value =
              draft !== undefined ? draft : String(row.coverage_percent ?? 0);
            return (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium truncate">{row.display_name}</h4>
                    {row.carrier_id ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Catálogo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Personalizada
                      </Badge>
                    )}
                    {!row.enabled && (
                      <Badge variant="outline" className="text-[10px]">
                        Inactiva
                      </Badge>
                    )}
                  </div>
                  {row.display_ruc && (
                    <div className="mt-1 text-xs text-muted-foreground font-mono">
                      RUC {row.display_ruc}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">
                      Cobertura
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={value}
                        onChange={(e) =>
                          setCoverageDrafts((d) => ({
                            ...d,
                            [row.id]: e.target.value,
                          }))
                        }
                        onBlur={(e) => saveCoverage(row, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        disabled={!isAdmin}
                        className="w-20 pr-7 text-right"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-muted-foreground">Activa</label>
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(v) => toggleCarrierEnabled(row, v)}
                      disabled={!isAdmin}
                    />
                  </div>

                  <button
                    onClick={() => setServicesModalCarrier(row)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Configurar servicios
                  </button>

                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(row)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      aria-label="Eliminar"
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

      {servicesModalCarrier && (
        <CoveredServicesDialog
          carrier={servicesModalCarrier}
          onClose={() => setServicesModalCarrier(null)}
        />
      )}
    </div>
  );
}

function AddCarrierForm({
  availableCatalog,
  onSave,
  onCancel,
}: {
  availableCatalog: InsuranceCarrier[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const { organizationId } = useOrganization();
  const [mode, setMode] = useState<"catalog" | "custom">("catalog");
  const [catalogId, setCatalogId] = useState<string>(
    availableCatalog[0]?.id ?? "",
  );
  const [customName, setCustomName] = useState("");
  const [customRuc, setCustomRuc] = useState("");
  const [coverage, setCoverage] = useState<string>("80");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "catalog" && !catalogId && availableCatalog[0]) {
      setCatalogId(availableCatalog[0].id);
    }
    if (mode === "custom") setCoverage("0");
    if (mode === "catalog") setCoverage("80");
  }, [mode, availableCatalog, catalogId]);

  const submit = async () => {
    if (!organizationId) {
      toast.error("No se encontró la organización. Recarga la página.");
      return;
    }
    const coverageNum = Number(coverage);
    if (!Number.isFinite(coverageNum) || coverageNum < 0 || coverageNum > 100) {
      toast.error("La cobertura debe estar entre 0 y 100");
      return;
    }
    if (mode === "custom" && !customName.trim()) {
      toast.error("Ingresa un nombre para la aseguradora");
      return;
    }
    if (mode === "catalog" && !catalogId) {
      toast.error("Selecciona una aseguradora del catálogo");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload =
      mode === "catalog"
        ? {
            organization_id: organizationId,
            carrier_id: catalogId,
            custom_name: null,
            custom_ruc: null,
            coverage_percent: coverageNum,
            enabled: true,
          }
        : {
            organization_id: organizationId,
            carrier_id: null,
            custom_name: customName.trim(),
            custom_ruc: customRuc.trim() || null,
            coverage_percent: coverageNum,
            enabled: true,
          };
    const { error } = await supabase
      .from("organization_insurance_carriers")
      .insert(payload);
    setSaving(false);
    if (error) {
      toast.error("No se pudo agregar: " + error.message);
      return;
    }
    toast.success("Aseguradora agregada");
    onSave();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("catalog")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "catalog"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Desde el catálogo
        </button>
        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            mode === "custom"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Personalizada
        </button>
      </div>

      {mode === "catalog" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Aseguradora</label>
            {availableCatalog.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Ya agregaste todas las aseguradoras del catálogo. Usa la opción
                &quot;Personalizada&quot;.
              </p>
            ) : (
              <select
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              >
                {availableCatalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.default_ruc ? ` — RUC ${c.default_ruc}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cobertura (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nombre</label>
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Nombre de la aseguradora"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">RUC (opcional)</label>
            <Input
              value={customRuc}
              onChange={(e) => setCustomRuc(e.target.value)}
              placeholder="20XXXXXXXXX"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cobertura (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={
            saving || (mode === "catalog" && availableCatalog.length === 0)
          }
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
    </div>
  );
}

interface ServiceRow {
  id: string;
  name: string;
  base_price: number | null;
}

function CoveredServicesDialog({
  carrier,
  onClose,
}: {
  carrier: OrganizationInsuranceCarrierWithName;
  onClose: () => void;
}) {
  const { organizationId } = useOrganization();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [coveredIds, setCoveredIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!organizationId) return;
      const supabase = createClient();
      const [servicesRes, coveredRes] = await Promise.all([
        supabase
          .from("services")
          .select("id, name, base_price")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("insurance_covered_services")
          .select("service_id")
          .eq("organization_insurance_carrier_id", carrier.id),
      ]);
      if (cancelled) return;
      if (servicesRes.error) {
        toast.error(
          "No se pudieron cargar los servicios: " + servicesRes.error.message,
        );
      }
      if (coveredRes.error) {
        toast.error(
          "No se pudieron cargar las coberturas: " + coveredRes.error.message,
        );
      }
      setServices((servicesRes.data ?? []) as ServiceRow[]);
      setCoveredIds(
        new Set(
          ((coveredRes.data ?? []) as { service_id: string }[]).map(
            (r) => r.service_id,
          ),
        ),
      );
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [carrier.id, organizationId]);

  const toggleService = async (serviceId: string, next: boolean) => {
    setPendingIds((s) => new Set(s).add(serviceId));
    setCoveredIds((s) => {
      const copy = new Set(s);
      if (next) copy.add(serviceId);
      else copy.delete(serviceId);
      return copy;
    });
    const supabase = createClient();
    const { error } = next
      ? await supabase.from("insurance_covered_services").insert({
          organization_insurance_carrier_id: carrier.id,
          service_id: serviceId,
        })
      : await supabase
          .from("insurance_covered_services")
          .delete()
          .eq("organization_insurance_carrier_id", carrier.id)
          .eq("service_id", serviceId);
    setPendingIds((s) => {
      const copy = new Set(s);
      copy.delete(serviceId);
      return copy;
    });
    if (error) {
      toast.error("No se pudo guardar: " + error.message);
      setCoveredIds((s) => {
        const copy = new Set(s);
        if (next) copy.delete(serviceId);
        else copy.add(serviceId);
        return copy;
      });
    }
  };

  const filteredServices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, query]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Servicios cubiertos por {carrier.display_name}</DialogTitle>
        <DialogDescription>
          Marca los servicios incluidos en esta cobertura. El paciente pagará el
          precio completo por los servicios no marcados.
        </DialogDescription>

        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar servicio..."
              className="pl-9"
            />
          </div>
          <Badge variant="secondary" className="shrink-0">
            {coveredIds.size} de {services.length} servicios cubiertos
          </Badge>
        </div>

        <div className="mt-2 max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-border bg-background/40 p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando servicios...
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {services.length === 0
                ? "No hay servicios creados todavía."
                : "Ningún servicio coincide con la búsqueda."}
            </div>
          ) : (
            filteredServices.map((s) => {
              const checked = coveredIds.has(s.id);
              const pending = pendingIds.has(s.id);
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={(e) => toggleService(s.id, e.target.checked)}
                      className="h-4 w-4 rounded border-input accent-emerald-500"
                    />
                    <span className="truncate text-sm">{s.name}</span>
                    {pending && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {s.base_price != null
                      ? `S/ ${Number(s.base_price).toFixed(2)}`
                      : "—"}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
