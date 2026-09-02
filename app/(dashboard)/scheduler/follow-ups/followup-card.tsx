"use client";

import { useRef, useState } from "react";
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
  RotateCcw,
  XCircle,
  CalendarClock,
  History,
  ThumbsDown,
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
import {
  WhatsAppIcon,
  waSolidButton,
  waOutlineButton,
} from "@/components/icons/whatsapp-icon";
import { cn } from "@/lib/utils";
import { useOrganization } from "@/components/organization-provider";
import { useOrgRole } from "@/hooks/use-org-role";
import dynamic from "next/dynamic";
import { FOLLOWUP_PRIORITY_CONFIG } from "@/types/clinical-history";
import {
  formatLastContacted,
  resolveFollowupUrgency,
} from "@/lib/followups/urgency";
import { BUDGET_TREATMENT_TYPE_LABELS } from "@/types/fertility";
import { Receipt } from "lucide-react";

// El modal se montaba SIEMPRE (cerrado) en cada tarjeta de la bandeja. Radix
// Dialog no lo necesita: con `open=false` no pinta nada, pero sus hooks sí
// corrían — cada tarjeta disparaba su propio fetch a /api/addons (y en orgs
// fertility, algunos más), o sea decenas de peticiones idénticas solo por
// pintar la lista. Ahora se monta al abrirlo, y además el módulo (803
// líneas) sale del bundle de la página.
const AssignBudgetModal = dynamic(
  () => import("@/components/addons/fertility/assign-budget-modal").then((m) => m.AssignBudgetModal),
  { ssr: false },
);
import {
  buildMessage,
  loadTemplateFromDb,
  normalizePhoneForWa,
  type ClipboardTemplateKind,
} from "@/lib/whatsapp-clipboard-config";
import type { FollowupVariant, FollowupWithDetails } from "./types";

const VIOLET = "#8B5CF6";

/**
 * `rule_key` de la ruta core (mig 182 / `lib/followups/triggers`).
 * Se duplica aquí a propósito para no arrastrar el módulo de servidor al
 * bundle del cliente.
 */
const CORE_SERVICE_FOLLOWUP_RULE_KEY = "core.service_followup";

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

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "set", "oct", "nov", "dic",
];

/**
 * "2026-08-12" / "2026-08-12T05:00:00Z" → "12 ago 2026".
 * Se formatea desde el trozo YYYY-MM-DD del ISO a propósito: construir un
 * `Date` y leerlo con `toLocaleDateString` daría un día distinto en el
 * servidor (UTC) y en el navegador (America/Lima, UTC-5).
 */
function formatDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const month = MONTHS_ES[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

interface FollowupCardProps {
  followup: FollowupWithDetails;
  variant: FollowupVariant;
  onContact?: () => unknown | Promise<unknown>;
  onSnooze?: (days: number) => unknown | Promise<unknown>;
  onMarkNoResponse?: () => unknown | Promise<unknown>;
  onCloseManual?: (reason: string) => unknown | Promise<unknown>;
  onReactivate?: () => unknown | Promise<unknown>;
  /**
   * Cascade actions (Sprint 1, Pack Fertilidad). Si se proveen, sustituyen
   * el dropdown de "Posponer N días" por un date picker explícito y
   * agregan el botón "Sin respuesta" como acción primaria. La obstetra
   * camina los 3 intentos sin necesidad de abrir menus.
   */
  onAdvance?: (
    action:
      | { kind: "mark_contacted"; notes?: string }
      | { kind: "pospuesto"; next_date: string; notes?: string }
      | { kind: "agendado"; appointment_id?: string; notes?: string }
      | { kind: "cerrar_sin_respuesta"; notes?: string }
  ) => unknown | Promise<unknown>;
  /**
   * Phase 3 (Budget Tiers): invoked after the doctor assigns a budget
   * from this card. The parent should refresh the followup list so the
   * card picks up the newly-linked budget (and the entry-point button
   * disappears, since `linkedBudget` is no longer null).
   */
  onBudgetAssigned?: () => unknown | Promise<unknown>;
  /**
   * Resalta la card unos segundos después de contactarla. Con el orden de
   * cola de trabajo la card se va al fondo del bucket, así que el anillo
   * es la única pista visual de dónde terminó (cuando sigue dentro de las
   * páginas ya cargadas).
   */
  justMoved?: boolean;
}

export function FollowupCard({
  followup,
  variant,
  onContact,
  onSnooze,
  onMarkNoResponse,
  onCloseManual,
  onReactivate,
  onAdvance,
  onBudgetAssigned,
  justMoved = false,
}: FollowupCardProps) {
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [reagendarOpen, setReagendarOpen] = useState(false);
  const [reagendarDate, setReagendarDate] = useState("");
  const [agendoOpen, setAgendoOpen] = useState(false);
  const [sinRespuestaOpen, setSinRespuestaOpen] = useState(false);
  const [assignBudgetOpen, setAssignBudgetOpen] = useState(false);
  const { organization } = useOrganization();
  const { isReceptionist } = useOrgRole();

  const patient = followup.patients;
  const patientName = patient
    ? `${patient.first_name} ${patient.last_name}`
    : "—";
  const originBadge = resolveOriginBadge(followup.source, followup.rule_key);
  const isCoreFollowup = followup.rule_key === CORE_SERVICE_FOLLOWUP_RULE_KEY;
  const priorityConfig = FOLLOWUP_PRIORITY_CONFIG[followup.priority];
  // Badge principal = urgencia operativa (vencido / vence hoy), con la
  // prioridad clínica como fallback. La prioridad queda además como
  // señal secundaria (el puntito de color) para no perderla de vista.
  const urgency = resolveFollowupUrgency(followup.priority, followup.days_diff);
  const UrgencyIcon = urgency.icon;
  const showPriorityDot = urgency.kind !== "priority";
  // Misma preferencia que el `days_diff` del server (expected_by manda).
  const dueDateLabel = formatDueDate(
    followup.expected_by ?? followup.follow_up_date
  );
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
    // Seguimiento core: ninguna de las plantillas de clipboard sirve tal
    // cual. `post_appointment` deja `{{FECHA}}`/`{{HORA}}`/`{{DIRECCION}}`
    // sin resolver (un seguimiento no tiene cita futura de la que sacar
    // esos datos) y `second_consultation_followup` es copy de fertilidad
    // ("tu segunda consulta"). Hasta que la Fase 2 añada una plantilla
    // genérica editable, construimos un mensaje neutro en código — así
    // el botón de WhatsApp sigue siendo útil sin fricción.
    if (isCoreFollowup) {
      return buildCoreFollowupMessage({
        patientName,
        clinicName: organization?.name ?? "",
        doctorName: followup.doctors?.full_name ?? null,
      });
    }
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

  /**
   * Ir al scheduler con paciente y doctor precargados. Extraído del
   * `onClick` inline porque ahora tiene dos call-sites: el botón
   * "Agendar" del clúster de desktop y el ítem del menú "···" (en móvil
   * el clúster está oculto y el menú es la única vía).
   */
  const handleAgendarCita = () => {
    const params = new URLSearchParams();
    if (patient)
      params.set("patient_name", `${patient.first_name} ${patient.last_name}`);
    if (followup.doctor_id) params.set("doctor_id", followup.doctor_id);
    window.location.href = `/scheduler?new=1&${params}`;
  };

  /**
   * Menú "···" de acciones secundarias. Se renderiza dos veces con el
   * mismo contenido: dentro del clúster de desktop (donde vivía) y en la
   * fila del nombre en móvil, donde el clúster pasa a `hidden md:flex`.
   * "Copiar mensaje" y "Agendar cita" están también como botones en el
   * clúster de desktop; aquí van sin gate porque en desktop no estorban
   * y en móvil son la única vía.
   */
  const renderMoreMenu = (triggerClassName: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={triggerClassName} aria-label="Más acciones">
          <MoreHorizontal className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem
          disabled={!waPhone}
          onSelect={() => void handleCopyMessage()}
        >
          Copiar mensaje
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleAgendarCita}>
          Agendar cita
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => wrap(() => onSnooze?.(7))}>
          Posponer 7 días
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => wrap(() => onSnooze?.(15))}>
          Posponer 15 días
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => wrap(() => onSnooze?.(30))}>
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
  );

  const stepActiveIdx = ruleStepperActiveIdx(followup.rule_key);

  // ── Cascade state (Sprint 1) ───────────────────────────────────────
  // Para mostrar el chip "Intento N/M" y habilitar/deshabilitar los
  // botones de cascada según el estado actual del followup.
  const isOpen = !followup.closed_at;
  const attemptCount = followup.attempt_count ?? 0;
  const maxAttempts = followup.max_attempts ?? 3;
  const currentAttempt = Math.min(attemptCount + 1, maxAttempts);
  const canMarkContacted =
    followup.status === "pendiente" || followup.status === "pospuesto";
  const canReagendar = attemptCount < maxAttempts;
  const isLastAttempt = attemptCount === maxAttempts - 1;

  // ── Fila de acciones (resultado + asignar presupuesto) ─────────────
  // Ambos bloques comparten una sola fila: los botones de resultado a la
  // izquierda y "Asignar presupuesto" empujado a la derecha (`ml-auto`),
  // porque es otra categoría de acción (navega a crear presupuesto, no
  // registra resultado). Cada uno conserva su condición de render
  // original; la fila se pinta si al menos uno de los dos aplica.
  const showResultActions = variant === "pending" && isOpen && !!onAdvance;
  const showAssignBudget =
    (variant === "pending" || variant === "no_response") &&
    !linkedBudget &&
    !isReceptionist &&
    !!followup.patient_id &&
    !!followup.rule_key?.startsWith("fertility.");

  // ¿Hay algo que pintar en la fila de chips? En móvil esa fila es un
  // bloque propio bajo el nombre: si va vacía dejaría un hueco muerto.
  const showAttemptChip = variant === "pending" && isOpen;
  const showPriorityChip = variant === "pending" && showPriorityDot;
  const hasChips =
    showAttemptChip ||
    showPriorityChip ||
    originBadge !== null ||
    linkedBudget !== null ||
    stepActiveIdx !== null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const ninetyDaysStr = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const attemptChipClass =
    currentAttempt === 1
      ? "border-success-500/40 bg-success-500/10 text-success-600"
      : currentAttempt === 2
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
        : "border-red-500/40 bg-red-500/10 text-red-600";

  const handleAdvance = async (
    action: Parameters<NonNullable<FollowupCardProps["onAdvance"]>>[0]
  ) => {
    if (!onAdvance) return;
    setBusy(true);
    try {
      await onAdvance(action);
    } finally {
      setBusy(false);
    }
  };

  const handleReagendarSubmit = async () => {
    if (!reagendarDate) {
      toast.error("Elige una fecha");
      return;
    }
    if (reagendarDate < todayStr) {
      toast.error("La fecha debe ser hoy o futura");
      return;
    }
    await handleAdvance({ kind: "pospuesto", next_date: reagendarDate });
    setReagendarOpen(false);
    setReagendarDate("");
  };

  const borderClass =
    variant === "recovered"
      ? "border-success-500/30 bg-success-500/5"
      : variant === "no_response"
        ? "border-l-4 border-l-amber-500 border-amber-500/30 bg-amber-500/5"
        : "border-border bg-card";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border p-3.5 transition-all hover:shadow-md md:p-4",
          borderClass,
          justMoved && "ring-2 ring-blue-500/60 ring-offset-2 ring-offset-background"
        )}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          {/* Left: Info.
              Móvil: columna flex para poder reordenar (el motivo sube por
              delante del teléfono, que es la última cosa que se lee antes
              de marcar). Desktop: `md:block` ignora los `order-*` y deja
              el orden del DOM y el `space-y-2` de siempre. */}
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:block md:space-y-2">
            {/*
              Móvil: dos filas apiladas — (A) nombre + señal principal +
              menú "···", (B) chips. Desktop: `md:contents` disuelve los
              dos wrappers y todos los hijos vuelven a la MISMA fila
              `flex-wrap` de siempre, así que md+ no cambia.
            */}
            <div className="order-1 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
              {/* Bloque A — nombre + badge principal (+ "···" en móvil) */}
              <div className="flex items-start justify-between gap-2 md:contents">
                <div className="flex min-w-0 items-center gap-2 md:contents">
                  {variant === "recovered" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
                  ) : variant === "no_response" ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  ) : (
                    <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    title={patientName}
                    className="min-w-0 truncate text-[15px] font-semibold leading-snug md:overflow-visible md:whitespace-normal md:text-sm"
                  >
                    {patientName}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 md:contents">
                  {variant === "pending" && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                        urgency.bgLight,
                        urgency.textColor
                      )}
                      title={urgency.title}
                    >
                      <UrgencyIcon className="h-3 w-3 shrink-0" />
                      {urgency.label}
                    </span>
                  )}

                  {/* `md:order-1` devuelve el badge al final de la fila de
                      desktop (donde lo dejaba el `ml-auto`), detrás de los
                      chips del bloque B. */}
                  {variant === "recovered" && (
                    <span
                      className={cn(
                        "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium md:order-1",
                        followup.status === "agendado_via_contacto"
                          ? "bg-success-500/10 text-success-600"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {followup.status === "agendado_via_contacto"
                        ? "Recuperada"
                        : "Volvió por iniciativa propia"}
                    </span>
                  )}

                  {variant === "no_response" && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-amber-600 md:order-1">
                      Sin respuesta
                    </span>
                  )}

                  {variant === "pending" &&
                    renderMoreMenu(
                      "-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
                    )}
                </div>
              </div>

              {/* Bloque B — chips */}
              {hasChips && (
                <div className="flex flex-wrap items-center gap-1.5 md:contents">
                  {/* Prioridad clínica: en móvil chip etiquetado (un dot de
                      8px suelto es ilegible en el pulgar); en desktop el
                      chip se desviste y queda el dot de siempre. */}
                  {showPriorityChip && (
                    <span
                      className="order-last inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground md:order-none md:gap-0 md:border-0 md:bg-transparent md:p-0"
                      title={`Prioridad clínica: ${priorityConfig.label}`}
                      aria-label={`Prioridad clínica: ${priorityConfig.label}`}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          priorityConfig.color
                        )}
                      />
                      <span className="md:hidden">{priorityConfig.label}</span>
                    </span>
                  )}

                  {showAttemptChip && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                        attemptChipClass
                      )}
                      title={`Intento ${currentAttempt} de ${maxAttempts}`}
                    >
                      Intento {currentAttempt}/{maxAttempts}
                    </span>
                  )}

                  {originBadge?.kind === "automated" && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
                      style={{
                        borderColor: `${VIOLET}55`,
                        color: VIOLET,
                        backgroundColor: `${VIOLET}14`,
                      }}
                    >
                      <Sparkles className="h-3 w-3 shrink-0" />
                      Automatizado
                    </span>
                  )}

                  {originBadge?.kind === "control" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-blue-600 dark:text-blue-400">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      Control
                    </span>
                  )}

                  {originBadge?.kind === "manual" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
                      <Stethoscope className="h-3 w-3 shrink-0" />
                      Manual
                    </span>
                  )}

                  {linkedBudget && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-cyan-700 dark:text-cyan-400">
                      <Receipt className="h-3 w-3 shrink-0" />
                      Presupuesto {BUDGET_TREATMENT_TYPE_LABELS[linkedBudget.treatment_type] ?? linkedBudget.treatment_type}
                    </span>
                  )}

                  {/* Etapa del journey. En móvil, chip con contexto ("Etapa
                      2/3"); en desktop sigue pegado al motivo, como hoy. */}
                  {stepActiveIdx !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground md:hidden">
                      <MiniStepper activeIdx={stepActiveIdx} />
                      Etapa {stepActiveIdx + 1}/3
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Phone — clickable to open wa.me directly. `order-3` lo deja
                por DEBAJO del motivo en móvil (es lo último que se lee
                antes de marcar); en desktop el orden del DOM manda y
                queda donde siempre, encima del motivo. */}
            {displayPhone && waPhone ? (
              <a
                href={`https://wa.me/${waPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir en WhatsApp"
                className="order-3 inline-flex min-h-11 w-fit items-center gap-1.5 whitespace-nowrap text-sm tabular-nums text-foreground/80 transition-colors hover:text-wa-700 dark:hover:text-wa-500 md:min-h-0 md:text-xs md:text-muted-foreground"
              >
                <WhatsAppIcon className="h-3.5 w-3.5 shrink-0" />
                {displayPhone}
              </a>
            ) : (
              <span className="order-3 inline-flex min-h-11 w-fit items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground/70 md:min-h-0 md:text-xs">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                Sin teléfono
              </span>
            )}

            {/* Motivo: en móvil es EL texto que la asesora lee antes de
                llamar, así que respira a dos líneas; en desktop sigue a una. */}
            <div className="order-2 flex items-center gap-2">
              <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2 md:line-clamp-1">
                {followup.reason}
              </p>
              {/* El stepper solo aquí en desktop: en móvil vive como chip
                  "Etapa n/3" en la fila de chips. */}
              {stepActiveIdx !== null && (
                <span className="hidden md:inline-flex">
                  <MiniStepper activeIdx={stepActiveIdx} />
                </span>
              )}
            </div>

            <div className="order-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:gap-x-4">
              <span className="flex min-w-0 max-w-full items-center gap-1 whitespace-nowrap">
                <Stethoscope className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {followup.doctors?.full_name ?? "—"}
                </span>
              </span>
              {dueDateLabel && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <CalendarCheck className="h-3 w-3 shrink-0" />
                  {variant === "pending" ? "Vence" : "Fecha"} {dueDateLabel}
                </span>
              )}
              {/* Solo el futuro: "vencido"/"vence hoy" ya los dice el badge. */}
              {variant === "pending" &&
                typeof followup.days_diff === "number" &&
                followup.days_diff > 0 && (
                  <span
                    className={cn(
                      "font-medium whitespace-nowrap",
                      followup.days_diff <= 7
                        ? "text-amber-500"
                        : "text-success-500"
                    )}
                  >
                    En {followup.days_diff}{" "}
                    {followup.days_diff === 1 ? "día" : "días"}
                  </span>
                )}
              {variant === "pending" && (
                <span
                  className={cn(
                    "flex items-center gap-1 whitespace-nowrap",
                    followup.last_contacted_at
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                  )}
                  title="El orden de la bandeja pone primero a quien lleva más tiempo sin contacto"
                >
                  <History className="h-3 w-3 shrink-0" />
                  {formatLastContacted(followup.last_contacted_at)}
                </span>
              )}
              {variant === "recovered" && followup.closed_at && (
                <span className="flex items-center gap-1 whitespace-nowrap text-success-600">
                  <Sparkles className="h-3 w-3 shrink-0" />
                  {followup.status === "agendado_via_contacto"
                    ? "Vía contacto automático"
                    : "Sin contacto previo"}
                </span>
              )}
              {variant === "no_response" && (
                <span className="flex items-center gap-1 whitespace-nowrap text-amber-600">
                  {followup.attempt_count} intento
                  {followup.attempt_count === 1 ? "" : "s"} sin éxito
                </span>
              )}
            </div>
          </div>

          {/* Acciones primarias de móvil. En <md el clúster de la derecha
              está oculto: "Enviar WhatsApp" es la acción de la asesora, así
              que se cobra una fila entera con target de 44px. */}
          {variant === "pending" && (
            <button
              onClick={handleSendWhatsApp}
              disabled={!waPhone}
              title={
                waPhone
                  ? "Enviar por WhatsApp"
                  : "El paciente no tiene teléfono registrado"
              }
              className={cn(
                "flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium md:hidden",
                waSolidButton
              )}
            >
              <WhatsAppIcon className="h-4 w-4" />
              Enviar WhatsApp
            </button>
          )}

          {variant === "no_response" && (
            <div className="grid grid-cols-2 gap-2 md:hidden">
              <button
                onClick={() => wrap(onReactivate)}
                disabled={busy}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-success-500/30 px-2.5 text-[13px] text-success-600 hover:bg-success-500/10 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Reactivar
              </button>
              <button
                onClick={() => setCloseOpen(true)}
                className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <XCircle className="h-4 w-4" />
                Cerrar caso
              </button>
            </div>
          )}

          {/* Right: Actions (desktop). En móvil, 5 botones-icono
              `shrink-0` ≈ 200px estrangulaban la columna de info: aquí se
              ocultan y sus acciones se redistribuyen entre el botón de
              WhatsApp de arriba, la cascada 2×2 y el menú "···". */}
          <div className="hidden shrink-0 items-center gap-1.5 md:flex">
            {variant === "pending" && (
              <>
                {/*
                  Copy (primaria) + WA. En desktop el flujo real es copiar
                  y pegar en WhatsApp Web; el envío directo vive en el link
                  del teléfono y en el botón de móvil. Sin phone, ambos
                  deshabilitados con tooltip.
                */}
                <button
                  onClick={handleCopyMessage}
                  disabled={!waPhone}
                  title={
                    waPhone
                      ? "Copiar mensaje"
                      : "El paciente no tiene teléfono registrado"
                  }
                  className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Copiar</span>
                </button>

                <button
                  onClick={handleSendWhatsApp}
                  disabled={!waPhone}
                  title={
                    waPhone
                      ? "Enviar por WhatsApp"
                      : "El paciente no tiene teléfono registrado"
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs",
                    waOutlineButton
                  )}
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Enviar</span>
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
                  onClick={handleAgendarCita}
                  className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/20"
                  title="Agendar cita"
                >
                  <CalendarPlus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Agendar</span>
                </button>

                {renderMoreMenu(
                  "flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              </>
            )}

            {variant === "no_response" && (
              <>
                <button
                  onClick={() => wrap(onReactivate)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-success-500/30 px-2.5 py-1.5 text-xs text-success-600 hover:bg-success-500/10 disabled:opacity-50"
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

        {/*
          Cascade action row (Sprint 1, Pack Fertilidad).
          Cuatro acciones explícitas para que la obstetra camine los 3
          intentos sin abrir menus: Agendó, Contactado, Reagendar,
          Sin respuesta. Solo se renderiza si el card está abierto,
          es la variante "pending" y el caller pasó `onAdvance`.

          La misma fila hospeda "Asignar presupuesto" a la derecha
          (`md:ml-auto`), con su propia condición de render: son
          categorías distintas de acción y la separación izquierda /
          derecha lo comunica sin necesidad de un divisor extra.
        */}
        {(showResultActions || showAssignBudget) && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 md:flex md:flex-wrap md:items-center">
            {showResultActions && (
              <>
                <button
                  onClick={() => setAgendoOpen(true)}
                  disabled={busy}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-success-500 px-2.5 text-[13px] font-medium text-white hover:bg-success-600 disabled:opacity-50 md:h-auto md:justify-start md:gap-1 md:py-1.5 md:text-xs"
                  title="La paciente agendó cita"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Agendó
                </button>

                <button
                  onClick={() => handleAdvance({ kind: "mark_contacted" })}
                  disabled={busy || !canMarkContacted}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 px-2.5 text-[13px] text-blue-600 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-50 md:h-auto md:justify-start md:gap-1 md:py-1.5 md:text-xs"
                  title={
                    canMarkContacted
                      ? "Marcar como contactada (sin decisión todavía)"
                      : "Solo aplicable desde estados pendiente o pospuesto"
                  }
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Contactada
                </button>

                <button
                  onClick={() => {
                    setReagendarDate("");
                    setReagendarOpen(true);
                  }}
                  disabled={busy || !canReagendar}
                  className={cn(
                    "flex h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[13px] disabled:cursor-not-allowed disabled:opacity-50 md:h-auto md:justify-start md:gap-1 md:py-1.5 md:text-xs",
                    isLastAttempt
                      ? "border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                      : "border-violet-500/40 text-violet-600 hover:bg-violet-500/10"
                  )}
                  title={
                    !canReagendar
                      ? "Ya se alcanzó el máximo de intentos"
                      : isLastAttempt
                        ? "Último intento. Si vuelves a reagendar, se cerrará automáticamente."
                        : "La paciente pidió más tiempo — elige nueva fecha"
                  }
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  Reagendar
                </button>

                <button
                  onClick={() => setSinRespuestaOpen(true)}
                  disabled={busy}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 text-[13px] text-red-600 hover:bg-red-500/10 disabled:opacity-50 md:h-auto md:justify-start md:gap-1 md:py-1.5 md:text-xs"
                  title="Cerrar caso sin respuesta"
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Sin respuesta
                </button>

                {isLastAttempt && (
                  <span className="col-span-2 text-[11px] text-amber-600/80 md:col-span-1">
                    Último intento — si reagendas otra vez se cierra automáticamente.
                  </span>
                )}
                {busy && (
                  <Loader2 className="col-span-2 h-3.5 w-3.5 animate-spin justify-self-center text-muted-foreground md:col-span-1" />
                )}
              </>
            )}

            {/* Phase 3 Budget Tiers — "Asignar presupuesto". Comparte fila
                con los botones de resultado pero vive a la derecha
                (`md:ml-auto`): no registra un resultado, navega a crear
                presupuesto. En móvil ocupa su propia línea a lo ancho
                (`col-span-2`), que es el wrap natural de la rejilla.
                Se renderiza para las variantes "pending" y "no_response"
                solo cuando:
                  - No hay presupuesto vinculado (si lo hay, el chip cyan
                    "Presupuesto …" ya se muestra en la cabecera).
                  - El usuario no es recepción (los asesores con rol base
                    distinto de recepción pasan; los asesores marcados
                    sobre una fila de recepción los frena el backend).
                  - Tenemos una ficha de paciente a la que apuntar. */}
            {showAssignBudget && (
              <button
                onClick={() => setAssignBudgetOpen(true)}
                disabled={busy}
                className={cn(
                  "col-span-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-success-500/40 bg-success-500/5 px-2.5 text-[13px] font-medium text-success-700 hover:bg-success-500/15 disabled:opacity-50 md:col-span-1 md:h-auto md:w-auto md:justify-start md:gap-1 md:py-1.5 md:text-xs dark:text-success-400",
                  showResultActions && "md:ml-auto"
                )}
                title="Asignar presupuesto al paciente"
              >
                <Receipt className="h-3.5 w-3.5" />
                Asignar presupuesto
              </button>
            )}
          </div>
        )}
      </div>

      {/* Phase 3 Budget Tiers — Asignar presupuesto modal. Self-gated
          by <FertilityAddonGate> internally. The followup row carries
          `patient_id` directly (the joined `patients` projection only
          exposes name/phone, no id). */}
      {followup.patient_id && assignBudgetOpen && (
        <AssignBudgetModal
          open={assignBudgetOpen}
          onClose={() => setAssignBudgetOpen(false)}
          patientId={followup.patient_id}
          followupId={followup.id}
          onCreated={() => {
            void onBudgetAssigned?.();
          }}
        />
      )}

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
              // text-white a propósito: en el tema --destructive-foreground
              // es idéntico a --destructive (rojo sobre rojo = invisible).
              className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Cerrar caso
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reagendar (cascade pospuesto) */}
      <Dialog open={reagendarOpen} onOpenChange={setReagendarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reagendar contacto</DialogTitle>
            <DialogDescription>
              {isLastAttempt
                ? "Este es el último intento. Si la paciente no responde, se cerrará automáticamente."
                : "La paciente pidió más tiempo. Elige la fecha del próximo intento."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-muted-foreground">
              Próxima fecha de contacto
            </label>
            <input
              type="date"
              value={reagendarDate}
              min={todayStr}
              max={ninetyDaysStr}
              onChange={(e) => setReagendarDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <p className="text-[11px] text-muted-foreground">
              Intento {currentAttempt} de {maxAttempts}.
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReagendarOpen(false)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleReagendarSubmit}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar reagenda
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar agendamiento (cascade agendado) */}
      <Dialog open={agendoOpen} onOpenChange={setAgendoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Confirmas que la paciente agendó?</DialogTitle>
            <DialogDescription>
              Esto cierra el seguimiento como recuperado vía contacto. Cuenta
              en KPIs de recuperación atribuible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAgendoOpen(false)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleAdvance({ kind: "agendado" });
                setAgendoOpen(false);
              }}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-success-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-success-600 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Sí, agendó
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar sin respuesta (cascade cerrar_sin_respuesta) */}
      <Dialog open={sinRespuestaOpen} onOpenChange={setSinRespuestaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar sin respuesta</DialogTitle>
            <DialogDescription>
              El caso pasa a "Sin respuesta". No suma a recuperaciones
              atribuibles. ¿Confirmas?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setSinRespuestaOpen(false)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => {
                await handleAdvance({ kind: "cerrar_sin_respuesta" });
                setSinRespuestaOpen(false);
              }}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar cierre
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Badge de origen del seguimiento. Tres familias:
 *   - `core.service_followup`  → "Control" (azul), la ruta core.
 *   - reglas `fertility.*`     → "Automatizado" (violeta), sin cambios.
 *   - `source='manual'`        → "Manual" (gris), semáforo de historia
 *     clínica.
 * Cualquier otra regla desconocida cae en "Automatizado" para conservar
 * el comportamiento previo (`source === 'rule'` → badge violeta).
 */
function resolveOriginBadge(
  source: FollowupWithDetails["source"],
  ruleKey: string | null
): { kind: "control" | "automated" | "manual" } | null {
  if (ruleKey === CORE_SERVICE_FOLLOWUP_RULE_KEY) return { kind: "control" };
  if (source === "rule") return { kind: "automated" };
  if (source === "manual") return { kind: "manual" };
  return null;
}

/**
 * Mensaje neutro para seguimientos core. No pasa por
 * `org_whatsapp_clipboard_templates` — ver el comentario en
 * `buildFollowupMessage`.
 */
function buildCoreFollowupMessage(vars: {
  patientName: string;
  clinicName: string;
  doctorName: string | null;
}): string {
  const clinic = vars.clinicName ? ` de ${vars.clinicName}` : "";
  const doctor = vars.doctorName ? ` con ${vars.doctorName}` : "";
  return (
    `Hola ${vars.patientName} 👋\n\n` +
    `Te escribimos${clinic} para coordinar tu próximo control${doctor}. ` +
    `¿Te gustaría agendar tu cita?\n\nQuedamos atentos.`
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
  // Phase 5 prep — Verificar inicio de tratamiento. Same stage 3
  // dot as budget_pending_acceptance because both belong to the
  // post-second-consultation treatment-decision phase.
  if (ruleKey.startsWith("fertility.budget_accepted_pending_start")) return 2;
  return null;
}

function MiniStepper({ activeIdx }: { activeIdx: number }) {
  // Vía CSS vars del tema: los hex fijos desentonaban con los acentos
  // océano/arena, y `success-*` es verde en todos los temas por diseño.
  const colors = [0, 1, 2].map((i) => {
    if (i < activeIdx) return "var(--color-success-300)"; // completed
    if (i === activeIdx) return "var(--color-success-500)"; // active
    return "var(--color-border)"; // pending
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
