"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Office } from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import { X, Loader2, Lock } from "lucide-react";

interface BlockDialogProps {
  defaultDate?: string;
  offices: Office[];
  organizationId: string;
  onClose: () => void;
  onSaved: () => void;
}

function generateTimeOptions() {
  const opts: string[] = [];
  for (let h = SCHEDULER_START_HOUR; h <= SCHEDULER_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SCHEDULER_INTERVAL) {
      if (h === SCHEDULER_END_HOUR && m > 0) break;
      opts.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    }
  }
  return opts;
}

const TIME_OPTIONS = generateTimeOptions();

export function BlockDialog({ defaultDate, offices, organizationId, onClose, onSaved }: BlockDialogProps) {
  const today = new Date().toISOString().split("T")[0];
  const [blockDate, setBlockDate] = useState(defaultDate ?? today);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [officeId, setOfficeId] = useState<string>("all");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const isValid = blockDate && (allDay || startTime < endTime);

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from("schedule_blocks").insert({
      block_date: blockDate,
      all_day: allDay,
      start_time: allDay ? null : startTime,
      end_time: allDay ? null : endTime,
      office_id: officeId === "all" ? null : officeId,
      reason: reason.trim() || null,
      organization_id: organizationId,
    });

    setSaving(false);
    if (error) {
      toast.error("Error al crear bloqueo: " + error.message);
      return;
    }
    toast.success("Horario bloqueado correctamente");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            <h3 className="text-lg font-semibold">Bloquear Horario</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fecha *</label>
            <input
              type="date"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            />
          </div>

          {/* All day checkbox */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="sr-only peer"
              />
              <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-sm font-medium">Todo el día</span>
          </label>

          {/* Time range (hidden when allDay) */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora inicio *</label>
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Hora fin *</label>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {startTime >= endTime && (
                <p className="col-span-2 text-xs text-destructive">
                  La hora fin debe ser mayor que la hora inicio
                </p>
              )}
            </div>
          )}

          {/* Office */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Consultorio</label>
            <select
              value={officeId}
              onChange={(e) => setOfficeId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
            >
              <option value="all">Todos los consultorios</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              placeholder="Ej: Mantenimiento, Feriado, Capacitación..."
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium mb-1">Vista previa del bloqueo:</p>
            <p>📅 {blockDate}</p>
            {allDay ? (
              <p>🕐 Todo el día</p>
            ) : (
              <p>🕐 {startTime} — {endTime}</p>
            )}
            <p>🏥 {officeId === "all" ? "Todos los consultorios" : offices.find((o) => o.id === officeId)?.name}</p>
            {reason && <p>📝 {reason}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            <Lock className="h-4 w-4" />
            Bloquear
          </button>
        </div>
      </div>
    </div>
  );
}
