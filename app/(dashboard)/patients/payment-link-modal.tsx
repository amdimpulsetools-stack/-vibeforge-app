"use client";

// "Cobrar por link" (Cobros al paciente — Culqi F1).
//
// Vive en la ficha del paciente (pestaña Finanzas), junto a "Registrar
// pago": registrar es para dinero que ya entró; este modal es para
// cobrar a distancia. Crea un payment_link vía POST /api/payment-links
// y ofrece copiar el link o enviarlo por wa.me con mensaje prellenado
// (mismo patrón/normalización de número que el whatsapp-clipboard-modal
// del scheduler). Incluye el mini-historial de links del paciente con
// cancelación de pendientes (UPDATE directo vía supabase client — la
// RLS de payment_links limita a miembros de la org).
//
// Si la org no tiene Culqi conectado, muestra un estado vacío con CTA
// a Configuración → Integraciones.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  Check,
  Copy,
  CreditCard,
  FlaskConical,
  Link2,
  Loader2,
  Plug,
  Plus,
  Settings,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useCulqiConfig } from "@/hooks/use-culqi-config";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { normalizePhoneForWa } from "@/lib/whatsapp-clipboard-config";
import { WhatsAppIcon, waSolidButton } from "@/components/icons/whatsapp-icon";

interface PaymentLinkModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  /** Nombre de pila para el saludo del mensaje de WhatsApp. */
  patientFirstName: string;
  /** Celular crudo del paciente (se normaliza a formato wa.me). */
  patientPhone: string | null;
  /** Nombre de la clínica — para el concepto default y el mensaje. */
  organizationName: string;
  /** Deuda pendiente (>0 pre-carga el monto; editable). */
  defaultAmount?: number;
}

// `payment_links` (contrato F1) aún no está en types/database.ts — cast
// local, mismo patrón que `followup_after_days` en appointment-sidebar.
interface PaymentLinkRow {
  id: string;
  amount: number;
  currency: string;
  concept: string;
  status: "pending" | "processing" | "paid" | "cancelled" | "expired";
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
}

interface CreatedLink {
  url: string;
  amount: number;
  concept: string;
  expiresDays: number;
}

const EXPIRY_OPTIONS = [
  { days: 1, label: "1 día" },
  { days: 3, label: "3 días" },
  { days: 7, label: "7 días" },
  { days: 15, label: "15 días" },
];

const STATUS_META: Record<
  PaymentLinkRow["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pendiente",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  processing: {
    label: "Procesando",
    className:
      "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  paid: {
    label: "Pagado",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  cancelled: {
    label: "Cancelado",
    className: "border-border bg-muted/40 text-muted-foreground",
  },
  expired: {
    label: "Vencido",
    className: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

/** Un link 'pending' cuyo vencimiento ya pasó se muestra como vencido
 *  aunque el cron/webhook todavía no haya volteado el status. */
function effectiveStatus(link: PaymentLinkRow): PaymentLinkRow["status"] {
  if (
    link.status === "pending" &&
    link.expires_at &&
    new Date(link.expires_at).getTime() < Date.now()
  ) {
    return "expired";
  }
  return link.status;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PaymentLinkModal({
  open,
  onClose,
  patientId,
  patientFirstName,
  patientPhone,
  organizationName,
  defaultAmount = 0,
}: PaymentLinkModalProps) {
  const culqi = useCulqiConfig();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  const [concept, setConcept] = useState("");
  const [expiresDays, setExpiresDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Reset al abrir: monto pre-cargado con la deuda pendiente si existe.
  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount > 0 ? defaultAmount.toFixed(2) : "");
    setConcept(`Pago de tratamiento — ${organizationName}`);
    setExpiresDays(7);
    setCreated(null);
    setCopied(false);
  }, [open, defaultAmount, organizationName]);

  // Mini-historial: últimos links del paciente. RLS (miembros de la
  // org) filtra sola — no hace falta .eq(organization_id).
  const { data: links = [], isLoading: linksLoading } = useQuery({
    queryKey: ["payment-links", patientId],
    enabled: open && culqi.connected,
    queryFn: async () => {
      const { data } = await createClient()
        .from("payment_links")
        .select(
          "id, amount, currency, concept, status, created_at, expires_at, paid_at"
        )
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data as unknown as PaymentLinkRow[]) ?? [];
    },
  });

  const invalidateLinks = () =>
    queryClient.invalidateQueries({ queryKey: ["payment-links", patientId] });

  const parsedAmount = Number(amount);
  const amountValid = !!amount && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const canCreate = amountValid && concept.trim().length > 0 && !creating;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/payment-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          amount: Math.round(parsedAmount * 100) / 100,
          concept: concept.trim(),
          expires_days: expiresDays,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        toast.error(data?.error || "No se pudo crear el link de pago.");
        return;
      }
      setCreated({
        url: data.url as string,
        amount: Math.round(parsedAmount * 100) / 100,
        concept: concept.trim(),
        expiresDays,
      });
      toast.success("Link de pago creado.");
      invalidateLinks();
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback para navegadores viejos (mismo truco que el modal de
      // WhatsApp del scheduler).
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copiado.");
  };

  const waPhone = normalizePhoneForWa(patientPhone);

  const waMessage = useMemo(() => {
    if (!created) return "";
    return (
      `Hola ${patientFirstName} 👋\n\n` +
      `Te enviamos el link de pago de ${organizationName}:\n\n` +
      `• ${created.concept}\n` +
      `• Monto: S/ ${created.amount.toFixed(2)}\n\n` +
      `Puedes pagar con tarjeta o Yape aquí:\n${created.url}\n\n` +
      `El link vence en ${created.expiresDays} ${created.expiresDays === 1 ? "día" : "días"}. ¡Gracias!`
    );
  }, [created, patientFirstName, organizationName]);

  const handleSendWa = () => {
    if (!waPhone || !created) return;
    const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCancelLink = async (link: PaymentLinkRow) => {
    const ok = await confirm({
      title: "Cancelar link de pago",
      description: `El paciente ya no podrá pagar "${link.concept}" (S/ ${Number(link.amount).toFixed(2)}) con este link. Esta acción no se puede deshacer.`,
      confirmText: "Cancelar link",
      variant: "destructive",
    });
    if (!ok) return;
    setCancellingId(link.id);
    // UPDATE directo con el client del navegador: la RLS de
    // payment_links (miembros de la org) autoriza; el guard extra
    // .eq(status,'pending') evita pisar un pago que entró mientras
    // tanto.
    const { error } = await createClient()
      .from("payment_links")
      .update({ status: "cancelled" })
      .eq("id", link.id)
      .eq("status", "pending");
    setCancellingId(null);
    if (error) {
      toast.error("No se pudo cancelar el link.");
      return;
    }
    toast.success("Link cancelado.");
    invalidateLinks();
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors";

  const notReady = !culqi.loading && (!culqi.connected || !culqi.enabled);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-full max-w-md max-h-[90dvh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Link2 className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Cobrar por link
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                El paciente paga con tarjeta o Yape y el cobro entra solo a
                Caja.
                {culqi.testMode && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    <FlaskConical className="h-2.5 w-2.5" />
                    Modo prueba
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {culqi.loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notReady ? (
            /* ── Estado vacío: sin Culqi conectado (o pausado) ── */
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
                {culqi.connected ? (
                  <Plug className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {culqi.connected
                    ? "Cobros por link pausados"
                    : "Tu clínica aún no tiene Culqi conectado"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xs">
                  {culqi.connected
                    ? "El owner o admin pausó los cobros online. Reactívalos desde Configuración para crear nuevos links."
                    : "Conecta tus llaves de Culqi para generar links de pago por WhatsApp: tus pacientes pagan con tarjeta o Yape y el cobro entra solo a Caja."}
                </p>
              </div>
              <Link
                href="/settings?tab=integraciones"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Settings className="h-3.5 w-3.5" />
                {culqi.connected
                  ? "Ir a Configuración"
                  : "Conectar Culqi en Configuración"}
              </Link>
            </div>
          ) : created ? (
            /* ── Link creado: copiar / enviar por WhatsApp ── */
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Link de pago listo
                </p>
                <p className="text-xs text-muted-foreground">
                  {created.concept} —{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    S/ {created.amount.toFixed(2)}
                  </span>{" "}
                  · vence en {created.expiresDays}{" "}
                  {created.expiresDays === 1 ? "día" : "días"}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="min-w-0 flex-1 truncate font-mono text-xs" title={created.url}>
                  {created.url}
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleCopy(created.url)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      ¡Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar link
                    </>
                  )}
                </button>

                {waPhone && (
                  <button
                    onClick={handleSendWa}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold",
                      waSolidButton
                    )}
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    Enviar por WhatsApp
                  </button>
                )}

                <button
                  onClick={() => setCreated(null)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  Crear otro link
                </button>
              </div>
            </div>
          ) : (
            /* ── Formulario de creación ── */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label htmlFor="pl_amount" className="text-xs font-medium">
                    Monto (S/) *
                  </label>
                  <input
                    id="pl_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className={cn(inputClass, "tabular-nums")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pl_expiry" className="text-xs font-medium">
                    Vence en
                  </label>
                  <select
                    id="pl_expiry"
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(Number(e.target.value))}
                    className={inputClass}
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.days} value={o.days}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pl_concept" className="text-xs font-medium">
                  Concepto *
                </label>
                <input
                  id="pl_concept"
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  maxLength={120}
                  placeholder={`Pago de tratamiento — ${organizationName}`}
                  className={inputClass}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={!canCreate}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Crear link de pago
              </button>
            </div>
          )}

          {/* ── Mini-historial de links del paciente ── */}
          {culqi.connected && (
            <div className="border-t border-border pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Últimos links
              </h4>
              {linksLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : links.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  Este paciente aún no tiene links de pago.
                </p>
              ) : (
                <div className="space-y-2">
                  {links.map((link) => {
                    const status = effectiveStatus(link);
                    const meta = STATUS_META[status];
                    return (
                      <div
                        key={link.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                            <span className="tabular-nums">
                              S/ {Number(link.amount).toFixed(2)}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                                meta.className
                              )}
                            >
                              {meta.label}
                            </span>
                          </p>
                          <p className="truncate text-[10px] text-muted-foreground" title={link.concept}>
                            {formatDate(link.created_at)} · {link.concept}
                          </p>
                        </div>
                        {status === "pending" && (
                          <button
                            onClick={() => handleCancelLink(link)}
                            disabled={cancellingId === link.id}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                          >
                            {cancellingId === link.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Ban className="h-3 w-3" />
                            )}
                            Cancelar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
