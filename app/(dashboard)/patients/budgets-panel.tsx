"use client";

// Panel visible para recepción (y staff en general) con el estado financiero
// de cada plan de tratamiento activo del paciente:
//
//   Total presupuesto = SUM(items.quantity * items.unit_price)
//   Pagado            = SUM(patient_payments del plan)
//   Consumido         = SUM(session_price de sesiones completadas)
//   Saldo             = Pagado - Consumido
//
// Permite registrar anticipos (payments con appointment_id = NULL y
// treatment_plan_id = plan.id). El cobro por cita sigue viviendo en el
// sidebar del scheduler.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Wallet,
  Loader2,
  Plus,
  Check,
  X,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type PaymentMethod = "cash" | "yape" | "transfer" | "card" | "other";

interface BudgetRow {
  plan_id: string;
  plan_title: string;
  status: "active" | "completed" | "cancelled" | "paused";
  total_budget: number;
  paid: number;
  consumed: number;
  saldo: number;
  total_sessions: number;
  completed_sessions: number;
}

function formatMoney(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function BudgetsPanel({
  patientId,
  canEdit,
}: {
  patientId: string;
  canEdit: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);

  // Payment modal state
  const [openFor, setOpenFor] = useState<BudgetRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: plans } = await supabase
      .from("treatment_plans")
      .select(
        "id, title, status, total_sessions, treatment_plan_items(quantity, unit_price), treatment_sessions(status, session_price)"
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (!plans) {
      setBudgets([]);
      setLoading(false);
      return;
    }

    const planIds = plans.map((p) => p.id);
    const { data: payments } = await supabase
      .from("patient_payments")
      .select("treatment_plan_id, amount")
      .in("treatment_plan_id", planIds.length > 0 ? planIds : ["__none__"]);

    const paidByPlan = new Map<string, number>();
    for (const p of payments ?? []) {
      if (!p.treatment_plan_id) continue;
      paidByPlan.set(
        p.treatment_plan_id,
        (paidByPlan.get(p.treatment_plan_id) ?? 0) + Number(p.amount)
      );
    }

    const rows: BudgetRow[] = plans.map((p) => {
      const items =
        (p as unknown as {
          treatment_plan_items?: { quantity: number; unit_price: number }[];
        }).treatment_plan_items ?? [];
      const sessions =
        (p as unknown as {
          treatment_sessions?: {
            status: string;
            session_price: number | null;
          }[];
        }).treatment_sessions ?? [];
      const total = items.reduce(
        (s, it) => s + Number(it.unit_price) * Number(it.quantity),
        0
      );
      const completed = sessions.filter((s) => s.status === "completed");
      const consumed = completed.reduce(
        (s, c) => s + Number(c.session_price ?? 0),
        0
      );
      const paid = paidByPlan.get(p.id) ?? 0;
      return {
        plan_id: p.id,
        plan_title: p.title as string,
        status: p.status as BudgetRow["status"],
        total_budget: total,
        paid,
        consumed,
        saldo: paid - consumed,
        total_sessions: Number(p.total_sessions ?? 0),
        completed_sessions: completed.length,
      };
    });

    setBudgets(rows);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const openPayment = (row: BudgetRow) => {
    setOpenFor(row);
    const pending = Math.max(0, row.total_budget - row.paid);
    setAmount(pending > 0 ? pending.toFixed(2) : "");
    setMethod("cash");
    setRef("");
  };

  const closePayment = () => {
    setOpenFor(null);
    setAmount("");
    setRef("");
  };

  const savePayment = async () => {
    if (!openFor) return;
    const n = Number(amount);
    if (!n || n <= 0) return;
    setSaving(true);
    const supabase = createClient();
    const { data: memb } = await supabase
      .from("organization_members")
      .select("organization_id")
      .limit(1)
      .single();
    const orgId = memb?.organization_id;
    if (!orgId) {
      toast.error("No se pudo identificar la organización");
      setSaving(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("patient_payments").insert({
      patient_id: patientId,
      appointment_id: null,
      treatment_plan_id: openFor.plan_id,
      amount: n,
      payment_method: method,
      notes: ref ? `Anticipo al plan — ${ref}` : "Anticipo al plan",
      payment_date: new Date().toISOString().split("T")[0],
      organization_id: orgId,
    } as any);
    setSaving(false);
    if (error) {
      toast.error("Error al registrar el pago");
      return;
    }
    toast.success("Pago registrado");
    closePayment();
    fetchBudgets();
  };

  const activeBudgets = useMemo(
    () => budgets.filter((b) => b.status === "active" || b.status === "paused"),
    [budgets]
  );
  const closedBudgets = useMemo(
    () =>
      budgets.filter((b) => b.status === "completed" || b.status === "cancelled"),
    [budgets]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (budgets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <Wallet className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Este paciente no tiene presupuestos
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Los presupuestos se crean desde la pestaña de Planes de tratamiento.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeBudgets.length > 0 && (
        <div className="space-y-2">
          {activeBudgets.map((row) => (
            <BudgetCard
              key={row.plan_id}
              row={row}
              canEdit={canEdit}
              onPay={() => openPayment(row)}
            />
          ))}
        </div>
      )}

      {closedBudgets.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30">
            {closedBudgets.length} plan(es) cerrados
          </summary>
          <div className="space-y-2 p-2">
            {closedBudgets.map((row) => (
              <BudgetCard key={row.plan_id} row={row} canEdit={false} />
            ))}
          </div>
        </details>
      )}

      {/* Payment modal */}
      <Dialog open={!!openFor} onOpenChange={(v) => { if (!v) closePayment(); }}>
        {openFor && (
          <DialogContent className="w-full max-w-md p-5 space-y-4 [&>button]:top-4 [&>button]:right-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-bold">Registrar pago al plan</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground truncate">
                  {openFor.plan_title}
                </DialogDescription>
              </div>
              <button
                onClick={closePayment}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-lg bg-muted/30 p-3 space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total plan</span>
                <span className="font-medium">
                  {formatMoney(openFor.total_budget)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagado</span>
                <span className="font-medium">{formatMoney(openFor.paid)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Pendiente por cobrar</span>
                <span className="text-emerald-600">
                  {formatMoney(Math.max(0, openFor.total_budget - openFor.paid))}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Monto</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0"
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <div className="mt-1 flex flex-wrap gap-1">
                {[25, 50, 100].map((pct) => {
                  const pending = Math.max(
                    0,
                    openFor.total_budget - openFor.paid
                  );
                  const value = (pending * pct) / 100;
                  return (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setAmount(value.toFixed(2))}
                      className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent"
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">Método</label>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {(["cash", "yape", "transfer", "card", "other"] as const).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn(
                        "rounded-md px-2 py-1.5 text-xs capitalize transition-colors",
                        method === m
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {m === "cash"
                        ? "Efectivo"
                        : m === "yape"
                          ? "Yape / Plin"
                          : m === "transfer"
                            ? "Transferencia"
                            : m === "card"
                              ? "Tarjeta"
                              : "Otro"}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium">
                Referencia (opcional)
              </label>
              <input
                type="text"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="Nº operación, comprobante, etc."
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={savePayment}
                disabled={saving || !amount || Number(amount) <= 0}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Guardar pago
              </button>
              <button
                onClick={closePayment}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancelar
              </button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function BudgetCard({
  row,
  canEdit,
  onPay,
}: {
  row: BudgetRow;
  canEdit: boolean;
  onPay?: () => void;
}) {
  const pct =
    row.total_budget > 0 ? (row.consumed / row.total_budget) * 100 : 0;
  const saldoTone =
    row.saldo > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : row.saldo < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{row.plan_title}</p>
          <p className="text-[10px] text-muted-foreground">
            {row.completed_sessions} / {row.total_sessions} sesiones
            completadas
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[9px] font-medium border",
            row.status === "active" &&
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
            row.status === "paused" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
            row.status === "completed" &&
              "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
            row.status === "cancelled" &&
              "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
          )}
        >
          {row.status === "active"
            ? "Activo"
            : row.status === "paused"
              ? "Pausado"
              : row.status === "completed"
                ? "Completado"
                : "Cancelado"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <div className="rounded bg-muted/30 px-2 py-1">
          <p className="text-muted-foreground">Total</p>
          <p className="font-semibold">{formatMoney(row.total_budget)}</p>
        </div>
        <div className="rounded bg-muted/30 px-2 py-1">
          <p className="text-muted-foreground">Pagado</p>
          <p className="font-semibold">{formatMoney(row.paid)}</p>
        </div>
        <div className="rounded bg-muted/30 px-2 py-1">
          <p className="text-muted-foreground">Saldo</p>
          <p className={cn("font-semibold", saldoTone)}>
            {formatMoney(row.saldo)}
          </p>
        </div>
      </div>

      <div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {Math.round(pct)}% consumido
        </p>
      </div>

      {canEdit && onPay && row.status !== "cancelled" && (
        <button
          onClick={onPay}
          className="flex w-full items-center justify-center gap-1 rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Registrar pago
        </button>
      )}
    </div>
  );
}

// Convenience export — summary strip that can live in the drawer header.
export function BudgetsSummaryStrip({ patientId }: { patientId: string }) {
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: plans } = await supabase
        .from("treatment_plans")
        .select(
          "id, treatment_plan_items(quantity, unit_price)"
        )
        .eq("patient_id", patientId)
        .eq("status", "active");
      if (!plans || cancelled) {
        setLoading(false);
        return;
      }
      const planIds = plans.map((p) => p.id);
      if (planIds.length === 0) {
        setPending(0);
        setLoading(false);
        return;
      }
      const { data: payments } = await supabase
        .from("patient_payments")
        .select("amount")
        .in("treatment_plan_id", planIds);
      if (cancelled) return;
      const total = plans.reduce((sum, p) => {
        const items =
          (p as unknown as {
            treatment_plan_items?: {
              quantity: number;
              unit_price: number;
            }[];
          }).treatment_plan_items ?? [];
        return (
          sum +
          items.reduce(
            (s, it) => s + Number(it.unit_price) * Number(it.quantity),
            0
          )
        );
      }, 0);
      const paid = (payments ?? []).reduce(
        (s, p) => s + Number(p.amount),
        0
      );
      setPending(Math.max(0, total - paid));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading || pending <= 0) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      <TrendingUp className="h-3 w-3" />
      Pendiente en planes: {formatMoney(pending)}
    </div>
  );
}
