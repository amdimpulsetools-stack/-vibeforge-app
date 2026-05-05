"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Clock, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BUDGET_TREATMENT_TYPE_LABELS,
  type BudgetAcceptanceStatus,
  type BudgetRecord,
  type BudgetTreatmentType,
} from "@/types/fertility";

export interface BudgetCardProps {
  budget: BudgetRecord & {
    patient?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
    } | null;
    followup?: { id: string; expected_by: string | null; status: string | null } | null;
    sent_by?: { id: string; full_name: string | null } | null;
  };
  bucket: BudgetAcceptanceStatus;
  onChanged: () => void;
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

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / (24 * 3600 * 1000)));
}

export function BudgetCard({ budget, bucket, onChanged }: BudgetCardProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const patient = budget.patient;
  const patientName = patient
    ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim()
    : "Paciente";
  const initials = patient
    ? `${(patient.first_name ?? "?")[0] ?? "?"}${(patient.last_name ?? "?")[0] ?? ""}`
    : "?";
  const treatmentLabel =
    BUDGET_TREATMENT_TYPE_LABELS[budget.treatment_type as BudgetTreatmentType] ??
    budget.treatment_type;

  const accept = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/budgets/${budget.id}/mark-accepted`, {
      method: "PATCH",
    });
    setActionLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo marcar como aceptado");
      return;
    }
    toast.success("Presupuesto aceptado");
    onChanged();
  };

  const reject = async () => {
    setActionLoading(true);
    const res = await fetch(`/api/budgets/${budget.id}/mark-rejected`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rejection_reason: rejectReason.trim() ? rejectReason.trim() : null,
      }),
    });
    setActionLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo marcar como rechazado");
      return;
    }
    toast.success("Presupuesto rechazado");
    setRejectOpen(false);
    setRejectReason("");
    onChanged();
  };

  let badge: React.ReactNode = null;
  let extra: React.ReactNode = null;

  if (bucket === "pending_acceptance" || budget.acceptance_status === "pending_acceptance") {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
        <Clock className="h-3 w-3" />
        Esperando respuesta
      </span>
    );
    if (budget.followup?.expected_by) {
      const days = Math.ceil(
        (new Date(budget.followup.expected_by).getTime() - Date.now()) /
          (24 * 3600 * 1000),
      );
      extra = (
        <span className="text-[11px] text-muted-foreground">
          {days > 0
            ? `Recordatorio en ${days} día${days === 1 ? "" : "s"}`
            : "Recordatorio vencido"}
        </span>
      );
    }
  } else if (budget.acceptance_status === "accepted") {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
        <Check className="h-3 w-3" />
        Aceptado el {formatDate(budget.accepted_at)}
      </span>
    );
  } else if (budget.acceptance_status === "rejected") {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
        <X className="h-3 w-3" />
        Rechazado el {formatDate(budget.rejected_at)}
      </span>
    );
    extra = budget.rejection_reason ? (
      <span className="text-[11px] italic text-muted-foreground">
        “{budget.rejection_reason}”
      </span>
    ) : null;
  }

  const amountText =
    budget.amount !== null && budget.amount !== undefined
      ? `S/ ${Number(budget.amount).toFixed(2)}`
      : "Sin monto registrado";
  const sentByText = budget.sent_by?.full_name ?? "—";
  const sentDays = daysAgo(budget.sent_at);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold uppercase text-emerald-600">
          {initials}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {patient ? (
              <Link
                href={`/patients?open=${patient.id}`}
                className="text-sm font-semibold hover:underline"
              >
                {patientName}
              </Link>
            ) : (
              <span className="text-sm font-semibold">{patientName}</span>
            )}
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {budget.treatment_type}
            </span>
            <span className="text-xs text-muted-foreground">{treatmentLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {amountText} · Enviado por {sentByText} · {formatDate(budget.sent_at)}{" "}
            <span className="text-muted-foreground/70">
              · Hace {sentDays} día{sentDays === 1 ? "" : "s"}
            </span>
          </p>
          {budget.notes && (
            <p className="text-[11px] text-muted-foreground line-clamp-2">
              {budget.notes}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {badge}
            {extra}
          </div>
        </div>
      </div>

      {budget.acceptance_status === "pending_acceptance" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={accept}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {actionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Marcar aceptado
          </button>
          <button
            onClick={() => setRejectOpen(true)}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-60"
          >
            <X className="h-3 w-3" />
            Marcar rechazado
          </button>
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
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
              onClick={() => setRejectOpen(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={reject}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-60"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar rechazo
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
