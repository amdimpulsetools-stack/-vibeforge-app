"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Receipt,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

interface PaymentRow {
  id: string;
  mp_payment_id: string | null;
  amount: number;
  currency: string | null;
  status: string;
  payment_type: string | null;
  description: string | null;
  created_at: string;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_source: string | null;
  refund_reason: string | null;
  organization_id: string;
  organizations: { name: string } | null;
  subscription_id: string | null;
  organization_subscriptions:
    | { plan_id: string; plans: { name: string; slug: string } | null }
    | null;
}

export default function RefundsPage() {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [refunding, setRefunding] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/founder/payments");
      if (!res.ok) {
        toast.error("No pudimos cargar la lista de pagos.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPayments(data.payments ?? []);
    } catch {
      toast.error("Error de red al cargar pagos.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleRefund = async (payment: PaymentRow) => {
    const reason = window.prompt(
      `Reembolsar S/${Number(payment.amount).toFixed(2)} a ${payment.organizations?.name ?? "esta organización"}.\n\nDejar vacío para reembolso completo, o escribir un monto parcial.\n\nMotivo (opcional, máx 500 caracteres):`,
      "",
    );
    if (reason === null) return; // user cancelled

    const partialStr = window.prompt(
      `Monto a reembolsar (deja vacío para completo: S/${Number(payment.amount).toFixed(2)}):`,
      "",
    );
    if (partialStr === null) return;

    const partial = partialStr.trim() ? Number(partialStr) : undefined;
    if (partial !== undefined && (isNaN(partial) || partial <= 0)) {
      toast.error("Monto inválido.");
      return;
    }

    if (
      !window.confirm(
        `Confirmar reembolso de S/${(partial ?? Number(payment.amount)).toFixed(2)} a ${payment.organizations?.name ?? "esta org"}?\n\nEsta acción NO se puede deshacer desde Yenda — sólo desde el dashboard de Mercado Pago.`,
      )
    ) {
      return;
    }

    setRefunding(payment.id);
    try {
      const res = await fetch("/api/founder/refund-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: payment.id,
          amount: partial,
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(
          data.message || data.error || "No pudimos procesar el reembolso.",
          { duration: 8000 },
        );
        setRefunding(null);
        return;
      }
      toast.success(data.message, { duration: 6000 });
      await load();
    } catch {
      toast.error("Error de red. Intenta de nuevo.");
    }
    setRefunding(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reembolsos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Procesa reembolsos sobre los últimos 100 pagos. La acción llama a Mercado Pago y notifica al owner por correo.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Fecha</th>
              <th className="px-4 py-2.5 text-left">Org</th>
              <th className="px-4 py-2.5 text-left">Plan</th>
              <th className="px-4 py-2.5 text-right">Monto</th>
              <th className="px-4 py-2.5 text-left">Estado</th>
              <th className="px-4 py-2.5 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Aún no hay pagos registrados.
                </td>
              </tr>
            ) : (
              payments.map((p) => {
                const isRefunded =
                  !!p.refunded_at || p.status === "refunded";
                const canRefund =
                  p.status === "approved" && !isRefunded && !!p.mp_payment_id;
                const planName =
                  p.organization_subscriptions?.plans?.name ?? "—";
                return (
                  <tr
                    key={p.id}
                    className="border-t border-border/40 hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("es-PE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {p.organizations?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">{planName}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.currency ?? "PEN"} {Number(p.amount).toFixed(2)}
                      {isRefunded && p.refund_amount !== null && (
                        <div className="text-[10px] text-red-500">
                          −{Number(p.refund_amount).toFixed(2)} reembolsado
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} refunded={isRefunded} />
                      {isRefunded && p.refund_source && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          vía{" "}
                          {p.refund_source === "founder_app"
                            ? "Founder Panel"
                            : p.refund_source === "mp_dashboard"
                              ? "MP Dashboard"
                              : "Webhook"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canRefund ? (
                        <button
                          onClick={() => handleRefund(p)}
                          disabled={refunding === p.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-600 transition-all hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {refunding === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Reembolsar
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  refunded,
}: {
  status: string;
  refunded: boolean;
}) {
  if (refunded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
        <RotateCcw className="h-3 w-3" />
        Reembolsado
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Aprobado
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
        <XCircle className="h-3 w-3" />
        Rechazado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      <AlertTriangle className="h-3 w-3" />
      {status}
    </span>
  );
}
