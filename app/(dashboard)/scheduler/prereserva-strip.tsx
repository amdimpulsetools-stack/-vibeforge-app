"use client";

/**
 * Franja de pre-reserva en el panel de la cita (mig 274).
 *
 * Muestra el tiempo restante (o "vencida" en rojo) y las acciones:
 *   [Confirmar sin pago]  hold_expires_at = NULL + correo de confirmación
 *   [Extender ▾]          1 h / 2 h / 24 h desde max(ahora, vencimiento)
 *   [Liberar horario]     RPC appointment_release_hold (borra la cita; no es
 *                         cancelación ni avisa a la paciente)
 *   [Enviar WhatsApp]     plantilla editable 'prereserva'
 *
 * El panel vive fuera del NowProvider de la grilla: lleva su propio reloj
 * (cada 30 s) solo mientras está montado.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle2, ChevronDown, Loader2, Unlock, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendNotification } from "@/lib/send-notification";
import { syncAppointmentToGoogle } from "@/lib/google-calendar-client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { normalizePhoneForWa } from "@/lib/whatsapp-clipboard-config";
import {
  PRERESERVA_EXPIRED_COLOR,
  confirmHold,
  describeHoldDeadline,
  extendHold,
  extendHoldExpiry,
  formatHoldRemaining,
  holdStateOf,
  openWhatsApp,
  releaseHold,
  renderPrereservaMessage,
  type PrereservaMessageInput,
} from "@/lib/appointments/prereserva";

const EXTEND_OPTIONS = [
  { minutes: 60, label: "1 h" },
  { minutes: 120, label: "2 h" },
  { minutes: 1440, label: "24 h" },
];

interface PrereservaStripProps {
  appointmentId: string;
  holdExpiresAt: string;
  /** Color de Ajustes → Agenda (rojo si venció, lo resuelve la franja). */
  color: string;
  timezone: string;
  patientName: string;
  patientPhone: string | null;
  readOnly?: boolean;
  /** Datos del mensaje de WhatsApp salvo el vencimiento (lo pone la franja). */
  message: Omit<PrereservaMessageInput, "holdExpiresAt" | "timezone">;
  /** Nuevo hold (null = ya no es pre-reserva). Refresca la grilla sin cerrar. */
  onHoldChanged: (holdExpiresAt: string | null) => void;
  /** La cita se borró: cerrar el panel y refrescar. */
  onReleased: () => void;
}

export function PrereservaStrip({
  appointmentId,
  holdExpiresAt,
  color,
  timezone,
  patientName,
  patientPhone,
  readOnly = false,
  message,
  onHoldChanged,
  onReleased,
}: PrereservaStripProps) {
  const confirm = useConfirm();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<null | "confirm" | "extend" | "release">(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const state = holdStateOf(holdExpiresAt, now);
  const expired = state === "expired";
  const tone = expired ? PRERESERVA_EXPIRED_COLOR : color;
  const deadline = describeHoldDeadline(holdExpiresAt, timezone, new Date(now));

  // Mensaje de WhatsApp pre-armado: el clic abre wa.me de forma síncrona
  // (un window.open tras un await lo bloquean los navegadores).
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const messageKey = useMemo(() => JSON.stringify(message), [message]);
  useEffect(() => {
    let cancelled = false;
    setWaMessage(null);
    renderPrereservaMessage({ ...message, holdExpiresAt, timezone })
      .then((m) => {
        if (!cancelled) setWaMessage(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // messageKey cubre `message` (objeto nuevo en cada render del panel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey, holdExpiresAt, timezone]);
  const waPhone = normalizePhoneForWa(patientPhone);

  const handleConfirm = async () => {
    setBusy("confirm");
    const res = await confirmHold(createClient(), appointmentId);
    setBusy(null);
    if (!res.ok) {
      if (res.unavailable) toast.warning(res.message);
      else toast.error("No se pudo confirmar: " + res.message);
      // "Ya no es pre-reserva" (p. ej. otra persona registró el pago): refrescar.
      if (!res.unavailable) onHoldChanged(null);
      return;
    }
    // Recién ahora es una cita confirmada: correo de confirmación (el server
    // elige la plantilla virtual/presencial) y alta en Google Calendar.
    sendNotification({ type: "appointment_confirmation", appointment_id: appointmentId });
    syncAppointmentToGoogle(appointmentId, "upsert");
    toast.success("Cita confirmada sin pago");
    onHoldChanged(null);
  };

  const handleExtend = async (minutes: number) => {
    const next = extendHoldExpiry(holdExpiresAt, minutes);
    setBusy("extend");
    const res = await extendHold(createClient(), appointmentId, next);
    setBusy(null);
    if (!res.ok) {
      if (res.unavailable) toast.warning(res.message);
      else toast.error("No se pudo extender: " + res.message);
      if (!res.unavailable) onHoldChanged(null);
      return;
    }
    toast.success(`Pre-reserva extendida hasta las ${describeHoldDeadline(next, timezone).long}`);
    onHoldChanged(next);
  };

  const handleRelease = async () => {
    const ok = await confirm({
      title: "¿Liberar este horario?",
      description: `La pre-reserva de ${patientName || "la paciente"} se elimina y el horario queda libre. No cuenta como cancelación y no se avisa a la paciente.`,
      confirmText: "Liberar horario",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy("release");
    const res = await releaseHold(createClient(), appointmentId);
    setBusy(null);
    if (!res.ok) {
      if (res.unavailable) toast.warning(res.message);
      else toast.error("No se pudo liberar: " + res.message);
      return;
    }
    toast.success("Horario liberado");
    onReleased();
  };

  const handleWhatsApp = () => {
    if (waMessage) {
      openWhatsApp(waPhone, waMessage);
      return;
    }
    // Aún no estaba listo (plantilla cargando): se arma y se abre.
    void renderPrereservaMessage({ ...message, holdExpiresAt, timezone }).then((m) => openWhatsApp(waPhone, m));
  };

  return (
    <div
      className="space-y-2.5 rounded-xl border px-3 py-2.5"
      style={{ borderColor: `${tone}66`, backgroundColor: `${tone}14` }}
    >
      <div className="flex items-start gap-2">
        {expired ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone }} />
        ) : (
          <Clock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: tone }} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: tone }}>
            {expired ? "Pre-reserva vencida" : "Pre-reserva"}
          </p>
          <p className="text-xs text-muted-foreground">
            {expired
              ? `Venció ${deadline.day === "today" ? `hoy a las ${deadline.time}` : deadline.short}. El horario sigue ocupado hasta que lo extiendas o lo liberes.`
              : `Vence ${deadline.day === "today" ? `hoy a las ${deadline.time}` : deadline.short} · quedan ${formatHoldRemaining(holdExpiresAt, now)}. Se confirma sola al registrar el pago.`}
          </p>
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {busy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            Confirmar sin pago
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy !== null}
                className="flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {busy === "extend" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                Extender
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {EXTEND_OPTIONS.map((o) => (
                <DropdownMenuItem key={o.minutes} onSelect={() => void handleExtend(o.minutes)}>
                  + {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={handleRelease}
            disabled={busy !== null}
            className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-background px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 transition-colors dark:text-red-400"
          >
            {busy === "release" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            Liberar horario
          </button>
          <button
            type="button"
            onClick={handleWhatsApp}
            className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-background px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 transition-colors dark:text-emerald-400"
            title={waPhone ? "Abrir WhatsApp con el mensaje de pre-reserva" : "Sin teléfono válido: se abrirá WhatsApp para elegir el contacto"}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Enviar WhatsApp
          </button>
        </div>
      )}
    </div>
  );
}
