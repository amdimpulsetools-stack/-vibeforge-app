"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Sparkles,
  Check,
  X as XIcon,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useOrgRole } from "@/hooks/use-org-role";
import { BudgetRecordModal } from "@/components/clinical/budget-record-modal";
import {
  BUDGET_TREATMENT_TYPE_LABELS,
  FERTILITY_BASIC_KEY,
  FERTILITY_PREMIUM_KEY,
  type BudgetRecord,
  type BudgetTreatmentType,
} from "@/types/fertility";

interface BudgetWithJoins extends BudgetRecord {
  followup?: { id: string; expected_by: string | null; status: string | null } | null;
  sent_by?: { id: string; full_name: string | null } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysBetween(aIso: string, bIso: string): number {
  const ms = new Date(bIso).getTime() - new Date(aIso).getTime();
  return Math.max(0, Math.round(ms / (24 * 3600 * 1000)));
}

export function FertilityBudgetRecordsSection({
  patientId,
  patientFullName,
}: {
  patientId: string;
  patientFullName: string;
}) {
  const { hasAnyAddon, loading: addonsLoading } = useOrgAddons();
  const { isReceptionist } = useOrgRole();
  const fertilityActive = hasAnyAddon([FERTILITY_BASIC_KEY, FERTILITY_PREMIUM_KEY]);

  const [items, setItems] = useState<BudgetWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectFor, setRejectFor] = useState<BudgetWithJoins | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!fertilityActive) return;
    setLoading(true);
    try {
      // Use the same listing endpoint, narrowed by patient via client filter.
      // The endpoint doesn't expose patient_id filter; we pull all buckets and filter.
      const res = await fetch(
        `/api/budgets?limit=100&patient_id=${encodeURIComponent(patientId)}`,
      );
      if (!res.ok) {
        setItems([]);
        return;
      }
      const json = (await res.json()) as { items: BudgetWithJoins[] };
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [patientId, fertilityActive]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markAccepted = async (b: BudgetWithJoins) => {
    setActionLoading(b.id);
    const res = await fetch(`/api/budgets/${b.id}/mark-accepted`, {
      method: "PATCH",
    });
    setActionLoading(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo marcar como aceptado");
      return;
    }
    toast.success("Presupuesto marcado como aceptado");
    refresh();
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    setActionLoading(rejectFor.id);
    const res = await fetch(`/api/budgets/${rejectFor.id}/mark-rejected`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rejection_reason: rejectReason.trim() ? rejectReason.trim() : null,
      }),
    });
    setActionLoading(null);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo marcar como rechazado");
      return;
    }
    toast.success("Presupuesto marcado como rechazado");
    setRejectFor(null);
    setRejectReason("");
    refresh();
  };

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
      ),
    [items],
  );

  if (addonsLoading) return null;
  if (!fertilityActive) return null;

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <h4 className="text-sm font-semibold">Presupuestos enviados</h4>
        </div>
        {!isReceptionist && (
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Registrar presupuesto enviado
          </button>
        )}
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        Tracking de presupuestos compartidos con la paciente.
      </p>

      <div className="mt-3 space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Aún no hay presupuestos registrados para esta paciente.
            </p>
          </div>
        )}

        {!loading &&
          sorted.map((b) => (
            <BudgetRow
              key={b.id}
              budget={b}
              onAccept={() => markAccepted(b)}
              onReject={() => {
                setRejectFor(b);
                setRejectReason("");
              }}
              actionLoading={actionLoading === b.id}
              canEdit={!isReceptionist}
            />
          ))}
      </div>

      <BudgetRecordModal
        open={showCreate}
        onOpenChange={setShowCreate}
        patient={{ id: patientId, full_name: patientFullName }}
        onSaved={refresh}
      />

      {/* Rejection sub-modal */}
      <Dialog open={!!rejectFor} onOpenChange={(v) => !v && setRejectFor(null)}>
        {rejectFor && (
          <DialogContent className="w-full max-w-md p-5 [&>button]:top-4 [&>button]:right-4">
            <DialogTitle className="text-base font-bold">
              Marcar presupuesto como rechazado
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Puedes registrar la razón del rechazo (opcional).
            </DialogDescription>
            <div className="mt-3">
              <label className="text-xs font-medium">Razón (opcional)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Ej. Costo, decidió otro centro, etc."
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectFor(null)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitReject}
                disabled={actionLoading === rejectFor.id}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-60"
              >
                {actionLoading === rejectFor.id && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Confirmar rechazo
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function BudgetRow({
  budget,
  onAccept,
  onReject,
  actionLoading,
  canEdit,
}: {
  budget: BudgetWithJoins;
  onAccept: () => void;
  onReject: () => void;
  actionLoading: boolean;
  canEdit: boolean;
}) {
  const treatmentLabel =
    BUDGET_TREATMENT_TYPE_LABELS[budget.treatment_type as BudgetTreatmentType] ??
    budget.treatment_type;
  const amountLabel =
    budget.amount !== null && budget.amount !== undefined
      ? `S/ ${Number(budget.amount).toFixed(2)}`
      : "Sin monto registrado";

  let badge: React.ReactNode = null;
  let extraLine: React.ReactNode = null;

  if (budget.acceptance_status === "pending_acceptance") {
    const expectedBy = budget.followup?.expected_by;
    let countdown = "";
    if (expectedBy) {
      const days = Math.ceil(
        (new Date(expectedBy).getTime() - Date.now()) / (24 * 3600 * 1000),
      );
      countdown =
        days > 0 ? `Recordatorio en ${days} día${days === 1 ? "" : "s"}` : "Recordatorio vencido";
    }
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
        <Clock className="h-3 w-3" />
        Esperando respuesta
      </span>
    );
    extraLine = countdown && (
      <span className="text-[11px] text-muted-foreground">{countdown}</span>
    );
  } else if (budget.acceptance_status === "accepted") {
    const days = budget.accepted_at
      ? daysBetween(budget.sent_at, budget.accepted_at)
      : null;
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
        <Check className="h-3 w-3" />
        Aceptado el {formatDate(budget.accepted_at)}
      </span>
    );
    extraLine =
      days !== null ? (
        <span className="text-[11px] text-muted-foreground">
          {days} día{days === 1 ? "" : "s"} desde envío
        </span>
      ) : null;
  } else if (budget.acceptance_status === "rejected") {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
        <XIcon className="h-3 w-3" />
        Rechazado el {formatDate(budget.rejected_at)}
      </span>
    );
    extraLine = budget.rejection_reason && (
      <span className="text-[11px] text-muted-foreground italic">
        “{budget.rejection_reason}”
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {budget.treatment_type}
            </span>
            <span className="text-sm font-semibold">{treatmentLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {amountLabel} · Enviado {formatDate(budget.sent_at)}
            {budget.sent_by?.full_name ? ` · por ${budget.sent_by.full_name}` : ""}
          </p>
          {budget.notes && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {budget.notes}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {badge}
            {extraLine}
          </div>
        </div>
      </div>

      {canEdit && budget.acceptance_status === "pending_acceptance" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={onAccept}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {actionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Marcar aceptado
          </button>
          <button
            onClick={onReject}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-60"
          >
            <XIcon className="h-3 w-3" />
            Marcar rechazado
          </button>
        </div>
      )}
    </div>
  );
}
