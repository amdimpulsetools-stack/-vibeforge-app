"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Activity,
  Check,
  CheckCircle,
  Clock,
  FileDown,
  Loader2,
  Mail,
  MessageCircle,
  Play,
  Send,
  Share2,
  X,
} from "lucide-react";
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
import { useOrgRole } from "@/hooks/use-org-role";

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
    assigned_by?: { id: string; full_name: string | null } | null;
    assigned_at?: string | null;
    assigned_by_user_id?: string | null;
    /** mig 142 — set when accepted → in_progress. */
    started_at?: string | null;
    started_by_user_id?: string | null;
    /** mig 142 — set when in_progress → completed. */
    completed_at?: string | null;
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

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.round(ms / (24 * 3600 * 1000)));
}

export function BudgetCard({ budget, bucket, onChanged }: BudgetCardProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // mig 172 — send modal picks the channel before stamping sent_at.
  // The previous "click = silent stamp + open PDF tab" behavior made
  // "presupuestos enviados" measure intent, not delivery.
  const [sendOpen, setSendOpen] = useState(false);
  const [sendChannel, setSendChannel] = useState<"email" | "whatsapp" | "other" | null>(null);

  // Phase 5 prep — admin/owner gating for the "Marcar completado"
  // action. Doctors and advisors can /start, but only admin/owner
  // can /complete (it's a financial-impact decision).
  const { isAdmin } = useOrgRole();

  // Phase 3 — a budget is "Sin procesar" when it has been assigned
  // (assigned_at + assigned_by_user_id are populated) but sent_at is
  // still null. The flag drives the "Sin procesar" badge + the
  // "Enviar al paciente" button.
  const isUnsent =
    budget.acceptance_status === "pending_acceptance" && !budget.sent_at;

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

  const sendViaChannel = async (via: "email" | "whatsapp" | "other") => {
    setSendChannel(via);
    setSendLoading(true);
    const res = await fetch(`/api/budgets/${budget.id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ via }),
    });
    setSendLoading(false);
    setSendChannel(null);
    const json = (await res.json().catch(() => ({}))) as {
      pdf_signed_url?: string | null;
      pdf_error?: string | null;
      email_sent?: boolean;
      email_error?: string | null;
      whatsapp_url?: string | null;
      error?: string;
    };
    if (!res.ok) {
      toast.error(json.error ?? "No se pudo enviar el presupuesto");
      return;
    }
    if (via === "email") {
      if (json.email_sent) {
        toast.success("Presupuesto enviado por email a la paciente");
      } else {
        toast.warning(
          `Presupuesto marcado como enviado, pero el email no salió: ${json.email_error ?? "error desconocido"}`,
        );
      }
    } else if (via === "whatsapp" && json.whatsapp_url) {
      // Open wa.me in a new tab so staff can review/send the message
      // from their own WhatsApp.
      window.open(json.whatsapp_url, "_blank", "noopener,noreferrer");
      toast.success("Abriendo WhatsApp con el mensaje listo");
    } else {
      toast.success("Presupuesto marcado como enviado");
    }
    if (json.pdf_error) {
      toast.warning(`PDF no generado: ${json.pdf_error}`);
    }
    setSendOpen(false);
    onChanged();
  };

  const patientEmail =
    ((budget.patient as { email?: string | null } | null | undefined)?.email) ?? null;
  const patientPhone = budget.patient?.phone ?? null;

  const downloadPdf = async () => {
    setPdfLoading(true);
    const res = await fetch(`/api/budgets/${budget.id}/pdf`, {
      method: "POST",
    });
    setPdfLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo generar el PDF");
      return;
    }
    const json = (await res.json()) as { signed_url?: string };
    if (json.signed_url) {
      window.open(json.signed_url, "_blank", "noopener,noreferrer");
    } else {
      toast.error("No se recibió el enlace del PDF");
    }
  };

  const startTreatment = async () => {
    setStartLoading(true);
    const res = await fetch(`/api/budgets/${budget.id}/start`, {
      method: "POST",
    });
    setStartLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo marcar el inicio de tratamiento");
      return;
    }
    toast.success("Tratamiento marcado como iniciado");
    onChanged();
  };

  const completeTreatment = async () => {
    setCompleteLoading(true);
    const res = await fetch(`/api/budgets/${budget.id}/complete`, {
      method: "POST",
    });
    setCompleteLoading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error ?? "No se pudo marcar como completado");
      return;
    }
    toast.success("Tratamiento marcado como completado");
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
    badge = isUnsent ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
        <Clock className="h-3 w-3" />
        Sin procesar
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
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
    // Phase 5 prep — Por iniciar urgency tint based on accepted_at
    // age: <7d gray, 7-14d amber, >14d red. Mirrors how older
    // unstarted treatments are surfaced as more urgent.
    const acceptedAge = daysAgo(budget.accepted_at) ?? 0;
    const tone =
      acceptedAge > 14
        ? {
            cls: "bg-rose-500/15 text-rose-600",
            note: " — verificar con paciente",
          }
        : acceptedAge >= 7
          ? {
              cls: "bg-amber-500/15 text-amber-600",
              note: " — recordar inicio",
            }
          : {
              cls: "bg-muted text-muted-foreground",
              note: "",
            };
    badge = (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.cls}`}
      >
        <Check className="h-3 w-3" />
        Aceptado hace {acceptedAge} día{acceptedAge === 1 ? "" : "s"}
        {tone.note}
      </span>
    );
  } else if (budget.acceptance_status === "in_progress") {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
        <Activity className="h-3 w-3" />
        En curso desde {formatDate(budget.started_at ?? null)}
      </span>
    );
  } else if (budget.acceptance_status === "completed") {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
        <CheckCircle className="h-3 w-3" />
        Completado el {formatDate(budget.completed_at ?? null)}
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
  // For "Sin procesar" cards (sent_at IS NULL) we surface the doctor who
  // assigned instead of an empty "Enviado por —". Falls back to assigned_by
  // user_id resolved name; if neither, hide the doctor line.
  const assignedByText = budget.assigned_by?.full_name ?? null;
  const assignedDays = daysAgo(budget.assigned_at ?? null);

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
          {budget.sent_at ? (
            <>
              <p className="text-xs text-muted-foreground">
                {amountText} · Enviado por {sentByText} · {formatDate(budget.sent_at)}
                {sentDays !== null && (
                  <span className="text-muted-foreground/70">
                    {" "}· Hace {sentDays} día{sentDays === 1 ? "" : "s"}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                Asignado por {assignedByText ?? "—"}
                {budget.assigned_at && (
                  <> · {formatDate(budget.assigned_at)}</>
                )}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {amountText} ·{" "}
              {assignedByText ? `Asignado por ${assignedByText}` : "Sin enviar"}
              {budget.assigned_at && (
                <>
                  {" "}· {formatDate(budget.assigned_at)}
                  {assignedDays !== null && (
                    <span className="text-muted-foreground/70">
                      {" "}· Hace {assignedDays} día{assignedDays === 1 ? "" : "s"}
                    </span>
                  )}
                </>
              )}
            </p>
          )}
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

      {/* Phase 4 — Descargar PDF. Visible for any status except
          'expired' (admins might still want to archive accepted/
          rejected). The current acceptance_status enum has no
          'expired' literal yet but the guard is forward-compatible. */}
      {budget.acceptance_status !== ("expired" as BudgetAcceptanceStatus) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={downloadPdf}
            disabled={pdfLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-400"
          >
            {pdfLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileDown className="h-3 w-3" />
            )}
            Descargar PDF
          </button>
        </div>
      )}

      {/* Phase 5 prep — "Por iniciar" sub-bucket: doctors/advisors/
          admin can stamp started_at. */}
      {budget.acceptance_status === "accepted" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={startTreatment}
            disabled={startLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {startLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            Marcar inicio de tratamiento
          </button>
        </div>
      )}

      {/* Phase 5 prep — "En curso" sub-bucket: admin/owner only can
          mark a treatment as completed (financial-impact decision). */}
      {budget.acceptance_status === "in_progress" && isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={completeTreatment}
            disabled={completeLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {completeLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            Marcar completado
          </button>
        </div>
      )}

      {budget.acceptance_status === "pending_acceptance" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Phase 3 — "Enviar al paciente" turns Sin procesar → Enviado.
              Only renders for sent_at IS NULL. Phase 4 — also
              triggers PDF generation server-side and returns the
              signed URL, opened in a new tab. */}
          {isUnsent && (
            <button
              onClick={() => setSendOpen(true)}
              disabled={sendLoading || actionLoading}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              <Send className="h-3 w-3" />
              Enviar al paciente
            </button>
          )}
          <button
            onClick={accept}
            disabled={actionLoading || sendLoading}
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
            disabled={actionLoading || sendLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/25 disabled:opacity-60"
          >
            <X className="h-3 w-3" />
            Marcar rechazado
          </button>
        </div>
      )}

      {/* mig 172 — Send modal: pick the channel before stamping
          sent_at. This makes "presupuestos enviados" measure real
          outbound contact, not just clicks. */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="w-full max-w-md p-5 [&>button]:top-4 [&>button]:right-4">
          <DialogTitle className="text-base font-bold">
            Enviar presupuesto a la paciente
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Elegí el canal por el que querés enviarlo. Esto define cómo
            queda registrado en los reportes.
          </DialogDescription>

          <div className="mt-4 space-y-2">
            {/* Email */}
            <button
              type="button"
              onClick={() => sendViaChannel("email")}
              disabled={sendLoading || !patientEmail}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                {sendLoading && sendChannel === "email" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Enviar por email</p>
                {patientEmail ? (
                  <p className="truncate text-xs text-muted-foreground">
                    A {patientEmail}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Sin email registrado. Editá la ficha de la paciente
                    para usar este canal.
                  </p>
                )}
              </div>
            </button>

            {/* WhatsApp */}
            <button
              type="button"
              onClick={() => sendViaChannel("whatsapp")}
              disabled={sendLoading || !patientPhone}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                {sendLoading && sendChannel === "whatsapp" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Enviar por WhatsApp</p>
                {patientPhone ? (
                  <p className="text-xs text-muted-foreground">
                    Abre WhatsApp con el mensaje y el link al PDF listo
                    para enviar desde tu cuenta.
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">
                    Sin teléfono registrado. Editá la ficha de la paciente
                    para usar este canal.
                  </p>
                )}
              </div>
            </button>

            {/* Other */}
            <button
              type="button"
              onClick={() => sendViaChannel("other")}
              disabled={sendLoading}
              className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {sendLoading && sendChannel === "other" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Marcar enviado por otro medio</p>
                <p className="text-xs text-muted-foreground">
                  Si ya lo entregaste impreso, en persona o por otro canal.
                </p>
              </div>
            </button>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setSendOpen(false)}
              disabled={sendLoading}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>

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
