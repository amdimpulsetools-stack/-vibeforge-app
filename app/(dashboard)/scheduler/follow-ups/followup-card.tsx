"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Sparkles,
  Stethoscope,
  User,
  Flag,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FOLLOWUP_PRIORITY_CONFIG } from "@/types/clinical-history";
import type { FollowupVariant, FollowupWithDetails } from "./types";

const VIOLET = "#8B5CF6";

interface FollowupCardProps {
  followup: FollowupWithDetails;
  variant: FollowupVariant;
  onContact?: () => unknown | Promise<unknown>;
  onSnooze?: (days: number) => unknown | Promise<unknown>;
  onMarkNoResponse?: () => unknown | Promise<unknown>;
  onCloseManual?: (reason: string) => unknown | Promise<unknown>;
  onReactivate?: () => unknown | Promise<unknown>;
}

export function FollowupCard({
  followup,
  variant,
  onContact,
  onSnooze,
  onMarkNoResponse,
  onCloseManual,
  onReactivate,
}: FollowupCardProps) {
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  const patient = followup.patients;
  const patientName = patient
    ? `${patient.first_name} ${patient.last_name}`
    : "—";
  const isRule = followup.source === "rule";
  const priorityConfig = FOLLOWUP_PRIORITY_CONFIG[followup.priority];

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast.success("Teléfono copiado");
  };

  const handleCopyWhatsApp = () => {
    const message = `Hola ${
      patient?.first_name ?? ""
    }, te escribimos de la clínica. Te recordamos que tienes un seguimiento pendiente: ${
      followup.reason
    }. ¿Te gustaría agendar tu próxima cita?`;
    navigator.clipboard.writeText(message);
    toast.success("Mensaje copiado al portapapeles");
  };

  const wrap = async (fn?: () => unknown | Promise<unknown>) => {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleCloseSubmit = async () => {
    if (!onCloseManual) return;
    if (closeReason.trim().length < 3) {
      toast.error("Describe brevemente el motivo");
      return;
    }
    setBusy(true);
    try {
      await onCloseManual(closeReason.trim());
      setCloseOpen(false);
      setCloseReason("");
    } finally {
      setBusy(false);
    }
  };

  const stepActiveIdx = ruleStepperActiveIdx(followup.rule_key);

  const borderClass =
    variant === "recovered"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : variant === "no_response"
        ? "border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-500/5"
        : "border-border bg-card";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border p-4 transition-all hover:shadow-md",
          borderClass
        )}
      >
        <div className="flex items-start justify-between gap-4">
          {/* Left: Info */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {variant === "recovered" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : variant === "no_response" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="text-sm font-semibold">{patientName}</span>

              {variant === "pending" && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    priorityConfig.bgLight,
                    priorityConfig.textColor
                  )}
                >
                  <Flag className="h-3 w-3" />
                  {priorityConfig.label}
                </span>
              )}

              {isRule && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    borderColor: `${VIOLET}55`,
                    color: VIOLET,
                    backgroundColor: `${VIOLET}14`,
                  }}
                >
                  <Sparkles className="h-3 w-3" />
                  Automatizado
                </span>
              )}

              {variant === "recovered" && (
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    followup.status === "agendado_via_contacto"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {followup.status === "agendado_via_contacto"
                    ? "Recuperada"
                    : "Volvió por iniciativa propia"}
                </span>
              )}

              {variant === "no_response" && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                  Sin respuesta
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground line-clamp-1">
                {followup.reason}
              </p>
              {isRule && stepActiveIdx !== null && (
                <MiniStepper activeIdx={stepActiveIdx} />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Stethoscope className="h-3 w-3" />
                {followup.doctors?.full_name ?? "—"}
              </span>
              {followup.follow_up_date && (
                <span className="flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3" />
                  {followup.follow_up_date}
                </span>
              )}
              {variant === "pending" && typeof followup.days_diff === "number" && (
                <span
                  className={cn(
                    "font-medium",
                    followup.days_diff < 0
                      ? "text-red-500"
                      : followup.days_diff <= 7
                        ? "text-amber-500"
                        : "text-emerald-500"
                  )}
                >
                  {followup.days_diff < 0
                    ? `Vencido hace ${Math.abs(followup.days_diff)} días`
                    : followup.days_diff === 0
                      ? "Hoy"
                      : `En ${followup.days_diff} días`}
                </span>
              )}
              {variant === "recovered" && followup.closed_at && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <Sparkles className="h-3 w-3" />
                  {followup.status === "agendado_via_contacto"
                    ? "Vía contacto automático"
                    : "Sin contacto previo"}
                </span>
              )}
              {variant === "no_response" && (
                <span className="flex items-center gap-1 text-amber-600">
                  {followup.attempt_count} intento
                  {followup.attempt_count === 1 ? "" : "s"} sin éxito
                </span>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            {variant === "pending" && (
              <>
                {patient?.phone && (
                  <button
                    onClick={() => handleCopyPhone(patient.phone!)}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    title={patient.phone}
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <Copy className="h-3 w-3" />
                  </button>
                )}

                <button
                  onClick={handleCopyWhatsApp}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-500 hover:bg-emerald-500/10"
                  title="WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                </button>

                <button
                  onClick={() => wrap(onContact)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-blue-500/30 px-2.5 py-1.5 text-xs text-blue-500 hover:bg-blue-500/10 disabled:opacity-50"
                  title="Marcar contactado"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Contactado</span>
                </button>

                <button
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (patient)
                      params.set(
                        "patient_name",
                        `${patient.first_name} ${patient.last_name}`
                      );
                    if (followup.doctor_id)
                      params.set("doctor_id", followup.doctor_id);
                    window.location.href = `/scheduler?new=1&${params}`;
                  }}
                  className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20"
                  title="Agendar cita"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Agendar</span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Más acciones"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[200px]">
                    <DropdownMenuItem
                      onSelect={() => wrap(() => onSnooze?.(7))}
                    >
                      Posponer 7 días
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => wrap(() => onSnooze?.(15))}
                    >
                      Posponer 15 días
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => wrap(() => onSnooze?.(30))}
                    >
                      Posponer 30 días
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => wrap(onMarkNoResponse)}>
                      Marcar como sin respuesta
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setCloseOpen(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      Cerrar sin agendar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            {variant === "no_response" && (
              <>
                <button
                  onClick={() => wrap(onReactivate)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1.5 text-xs text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Reactivar
                </button>
                <button
                  onClick={() => setCloseOpen(true)}
                  className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cerrar caso
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar sin agendar</DialogTitle>
            <DialogDescription>
              Indícanos brevemente el motivo. Esto se guarda para auditoría.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            rows={4}
            placeholder="Ej: paciente confirmó que ya no continuará el tratamiento."
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCloseOpen(false)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCloseSubmit}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Cerrar caso
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Compact 3-dot stepper. Each rule_key maps to a stage in the journey:
 * 0 = first consultation, 1 = second consultation, 2 = treatment decision.
 * The active index is the dot rendered with the strong color.
 */
function ruleStepperActiveIdx(ruleKey: string | null): number | null {
  if (!ruleKey) return null;
  if (ruleKey.startsWith("fertility.first_consultation_lapse")) return 1;
  if (ruleKey.startsWith("fertility.second_consultation_lapse")) return 2;
  if (ruleKey.startsWith("fertility.budget_pending_acceptance")) return 2;
  return null;
}

function MiniStepper({ activeIdx }: { activeIdx: number }) {
  const colors = [0, 1, 2].map((i) => {
    if (i < activeIdx) return "#86efac"; // completed (light green)
    if (i === activeIdx) return "#10b981"; // active (strong green)
    return "#e5e7eb"; // pending (gray)
  });
  return (
    <svg
      width="42"
      height="10"
      viewBox="0 0 42 10"
      aria-label="Etapa del journey"
      className="shrink-0"
    >
      <circle cx="5" cy="5" r="4" fill={colors[0]} />
      <circle cx="21" cy="5" r="5" fill={colors[1]} />
      <circle cx="37" cy="5" r="4" fill={colors[2]} />
    </svg>
  );
}
