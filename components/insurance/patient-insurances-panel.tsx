"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrgInsurance } from "@/hooks/use-org-insurance";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2, ShieldCheck, X } from "lucide-react";
import type {
  OrganizationInsuranceCarrierWithName,
  PatientInsurance,
} from "@/types/insurance";

interface PatientInsuranceRow extends PatientInsurance {
  carrier: OrganizationInsuranceCarrierWithName;
}

interface PatientInsurancesPanelProps {
  patientId: string;
  canEdit?: boolean;
}

export function PatientInsurancesPanel({
  patientId,
  canEdit = true,
}: PatientInsurancesPanelProps) {
  const { enabled, carriers, loading: orgLoading } = useOrgInsurance();
  const [rows, setRows] = useState<PatientInsuranceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addCarrierId, setAddCarrierId] = useState<string>("");
  const [addAffiliate, setAddAffiliate] = useState("");
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();

  const fetchRows = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("patient_insurances")
      .select(
        "*, organization_insurance_carriers(*, insurance_carriers(name, default_ruc))",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("No se pudieron cargar los seguros: " + error.message);
      setLoading(false);
      return;
    }
    setRows(
      ((data ?? []) as PatientInsuranceRow[]).map((row) => {
        const oic = (row as unknown as { organization_insurance_carriers: { custom_name: string | null; custom_ruc: string | null; coverage_percent: number; insurance_carriers: { name: string; default_ruc: string | null } | null } }).organization_insurance_carriers;
        return {
          ...row,
          carrier: {
            ...(oic as unknown as OrganizationInsuranceCarrierWithName),
            display_name:
              oic.insurance_carriers?.name ?? oic.custom_name ?? "Sin nombre",
            display_ruc:
              oic.insurance_carriers?.default_ruc ?? oic.custom_ruc ?? null,
          },
        };
      }),
    );
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const availableCarriers = carriers.filter(
    (c) => c.enabled && !rows.some((r) => r.organization_insurance_carrier_id === c.id),
  );

  const handleAdd = async () => {
    if (!addCarrierId) {
      toast.error("Selecciona una aseguradora");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("patient_insurances").insert({
      patient_id: patientId,
      organization_insurance_carrier_id: addCarrierId,
      affiliate_number: addAffiliate.trim() || null,
      active: true,
    });
    setSaving(false);
    if (error) {
      toast.error("No se pudo agregar: " + error.message);
      return;
    }
    toast.success("Seguro agregado");
    setShowAdd(false);
    setAddCarrierId("");
    setAddAffiliate("");
    fetchRows();
  };

  const handleToggleActive = async (row: PatientInsuranceRow) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("patient_insurances")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo actualizar: " + error.message);
      return;
    }
    fetchRows();
  };

  const handleAffiliateBlur = async (
    row: PatientInsuranceRow,
    newValue: string,
  ) => {
    const trimmed = newValue.trim() || null;
    if (trimmed === row.affiliate_number) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("patient_insurances")
      .update({ affiliate_number: trimmed })
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo guardar: " + error.message);
      return;
    }
    toast.success("Número de afiliado actualizado");
    fetchRows();
  };

  const handleDelete = async (row: PatientInsuranceRow) => {
    const ok = await confirm({
      title: "¿Quitar seguro del paciente?",
      description: `Se eliminará el vínculo con ${row.carrier.display_name}.`,
      confirmText: "Quitar",
      variant: "destructive",
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("patient_insurances")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast.error("No se pudo eliminar: " + error.message);
      return;
    }
    toast.success("Seguro eliminado");
    fetchRows();
  };

  if (orgLoading || loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Tu organización aún no activó el módulo de seguros. Actívalo en
        <span className="font-medium text-foreground"> Admin → Seguros</span>.
      </div>
    );
  }

  if (carriers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        Aún no hay aseguradoras configuradas. Agrega la primera en
        <span className="font-medium text-foreground"> Admin → Seguros</span>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Seguros del paciente
        </h3>
        {canEdit && !showAdd && availableCarriers.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar seguro
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Nuevo seguro</p>
            <button
              onClick={() => {
                setShowAdd(false);
                setAddCarrierId("");
                setAddAffiliate("");
              }}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Aseguradora
            </label>
            <select
              value={addCarrierId}
              onChange={(e) => setAddCarrierId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Seleccionar...</option>
              {availableCarriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} ({c.coverage_percent}% cobertura)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Número de afiliado <span className="text-muted-foreground/60">(opcional)</span>
            </label>
            <Input
              value={addAffiliate}
              onChange={(e) => setAddAffiliate(e.target.value)}
              placeholder="123-456-789"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowAdd(false);
                setAddCarrierId("");
                setAddAffiliate("");
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 && !showAdd && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
          Este paciente aún no tiene seguros registrados.
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{row.carrier.display_name}</p>
              <span className="text-[11px] text-muted-foreground">
                {row.carrier.coverage_percent}% cobertura
              </span>
            </div>
            {canEdit ? (
              <Input
                defaultValue={row.affiliate_number ?? ""}
                onBlur={(e) => handleAffiliateBlur(row, e.target.value)}
                placeholder="Número de afiliado"
                className="h-8 text-xs"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {row.affiliate_number ?? "Sin n° de afiliado"}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col items-end gap-2">
              <Switch
                checked={row.active}
                onCheckedChange={() => handleToggleActive(row)}
                aria-label="Activo"
              />
              <button
                onClick={() => handleDelete(row)}
                className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
