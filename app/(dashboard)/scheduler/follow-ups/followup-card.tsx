"use client";

import { useEffect, useRef, useState } from "react";
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
import { useOrganization } from "@/components/organization-provider";
import { FOLLOWUP_PRIORITY_CONFIG } from "@/types/clinical-history";
import { BUDGET_TREATMENT_TYPE_LABELS } from "@/types/fertility";
import { Receipt } from "lucide-react";
import {
  buildMessage,
  loadTemplateFromDb,
  normalizePhoneForWa,
  type ClipboardTemplateKind,
} from "@/lib/whatsapp-clipboard-config";
import type { FollowupVariant, FollowupWithDetails } from "./types";

const VIOLET = "#8B5CF6";

/**
 * Module-level cache so we don't re-fetch the same template once per card
 * mount. The dashboard often renders 20+ cards at once; without this we'd
 * fire 20+ identical API calls. Keyed by template kind. The `Promise`
 * itself is cached so concurrent first-clicks dedupe to a single fetch.
 */
const templateCache = new Map<ClipboardTemplateKind, Promise<string>>();

function getCachedTemplate(kind: ClipboardTemplateKind): Promise<string> {
  const existing = templateCache.get(kind);
  if (existing) return existing;
  const p = loadTemplateFromDb(kind);
  templateCache.set(kind, p);
  return p;
}

/**
 * Friendly phone display: "+51 987 654 321".
 * - If the input already starts with `+`, we keep that prefix.
 * - Otherwise we assume Peru (+51) and prepend it for the visual.
 * - Digits are grouped in threes from the left (after the country code).
 */
function formatPhoneDisplay(raw: string): string {
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return raw;
  let cc: string;
  let rest: string;
  if (hadPlus) {
    // Peruvian numbers are length 11 (51 + 9). For other CCs, take a
    // best-effort 2-digit country code; the visual is just for humans.
    cc = digits.slice(0, 2);
    rest = digits.slice(2);
  } else if (digits.startsWith("51") && digits.length >= 11) {
    cc = "51";
    rest = digits.slice(2);
  } else {
    cc = "51";
    rest = digits;
  }
  const groups = rest.match(/.{1,3}/g) ?? [];
  return `+${cc} ${groups.join(" ")}`.trim();
}

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
  const [isMobile, setIsMobile] = useState(false);
  const { organization } = useOrganization();

  // Track viewport so the WA/Copy button styling reflows on resize. The
  // initial state is `false` (desktop-first) — if we're actually on
  // mobile the effect flips it on the next paint.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const patient = followup.patients;
  const patientName = patient
    ? `${patient.first_name} ${patient.last_name}`
    : "—";
  const isRule = followup.source === "rule";
  const priorityConfig = FOLLOWUP_PRIORITY_CONFIG[followup.priority];
  // Si el followup vino de la regla `fertility.budget_pending_acceptance`,
  // hay un budget_record linkeado vía FK inversa. Mostramos badge cyan con
  // el tipo de tratamiento (FIV/IIU/etc.) para diferenciar de seguimientos
  // de consulta. Si hay multiple rows (caso edge), tomamos el primero.
  const linkedBudget = followup.budget_records?.[0] ?? null;

  // Phone in three forms: raw (DB), wa.me-compatible (digits + CC), and
  // a humanized display string. waPhone is null when the input is empty
  // or has fewer than 9 digits — in that case the WA actions are
  // disabled.
  const rawPhone = patient?.phone ?? null;
  const waPhone = rawPhone ? normalizePhoneForWa(rawPhone) : null;
  const displayPhone = rawPhone ? formatPhoneDisplay(rawPhone) : null;

  // Pick the template kind based on the followup's origin. Budget
  // followups win over rule_key (a budget followup IS a rule, but it has
  // a linked budget so we need the TRATAMIENTO variable).
  const templateKind: ClipboardTemplateKind = linkedBudget
    ? "budget_followup"
    : "second_consultation_followup";

  // Lazy fetch + cached. We only hit the API when the user clicks, never
  // on mount. The cached promise is shared across cards/mounts.
  const buildingRef = useRef(false);
  const buildFollowupMessage = async (): Promise<string | null> => {
    const template = await getCachedTemplate(templateKind);
    if (templateKind === "budget_followup") {
      if (!linkedBudget) return null;
      return buildMessage("budget_followup", template, {
        patientName,
        clinicName: organization?.name ?? "",
        treatmentType:
          BUDGET_TREATMENT_TYPE_LABELS[linkedBudget.treatment_type] ??
          linkedBudget.treatment_type,
      });
    }
    return buildMessage("second_consultation_followup", template, {
      patientName,
      clinicName: organization?.name ?? "",
      doctorName: followup.doctors?.full_name ?? "tu doctor",
    });
  };

  const handleSendWhatsApp = async () => {
    if (!waPhone || buildingRef.current) return;
    buildingRef.current = true;
    try {
      const message = await buildFollowupMessage();
      if (!message) {
        toast.error("No se pudo construir el mensaje");
        return;
      }
      const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      buildingRef.current = false;
    }
  };

  const handleCopyMessage = async () => {
    if (buildingRef.current) return;
    buildingRef.current = true;
    try {
      const message = await buildFollowupMessage();
      if (!message) {
        toast.error("No se pudo construir el mensaje");
        return;
      }
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar el mensaje");
    } finally {
      buildingRef.current = false;
    }
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

              {linkedBudget && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-400">
                  <Receipt className="h-3 w-3" />
                  Presupuesto {BUDGET_TREATMENT_TYPE_LABELS[linkedBudget.treatment_type] ?? linkedBudget.treatment_type}
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

            {/* Phone — clickable to open wa.me directly */}
            {displayPhone && waPhone ? (
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir en WhatsApp"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-emerald-600 transition-colors"
              >
                <Phone className="h-3.5 w-3.5" />
                {displayPhone}
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
                <Phone className="h-3.5 w-3.5" />
                Sin teléfono
              </span>
            )}

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
                {/*
                  WA + Copy buttons. Device-aware: on mobile the WA send
                  button is the visual primary; on desktop the Copy
                  button is. Both stay visible in both layouts. When
                  there's no phone, both are disabled with a tooltip.
                */}
                {(() => {
                  const noPhoneTitle = "El paciente no tiene teléfono registrado";
                  const sendPrimary = isMobile;
                  const sendBtn = (
                    <button
                      key="send"
                      onClick={handleSendWhatsApp}
                      disabled={!waPhone}
                      title={waPhone ? "Enviar por WhatsApp" : noPhoneTitle}
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        sendPrimary
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "border border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                      )}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Enviar</span>
                    </button>
                  );
                  const copyBtn = (
                    <button
                      key="copy"
                      onClick={handleCopyMessage}
                      disabled={!waPhone}
                      title={waPhone ? "Copiar mensaje" : noPhoneTitle}
                      className={cn(
                        "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        !sendPrimary
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Copiar</span>
                    </button>
                  );
                  return sendPrimary ? [sendBtn, copyBtn] : [copyBtn, sendBtn];
                })()}

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
