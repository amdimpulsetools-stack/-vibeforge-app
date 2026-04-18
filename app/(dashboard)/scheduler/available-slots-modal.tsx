"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, X, Loader2, Share2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Doctor } from "@/types/admin";

interface AvailableSlotsModalProps {
  open: boolean;
  onClose: () => void;
  doctors: Doctor[];
  initialDoctorId?: string | null;
}

interface DaySlots {
  date: string;
  dayOfWeek: number;
  slots: string[];
}

interface ApiResponse {
  doctor: { id: string; full_name: string };
  duration: number;
  days: DaySlots[];
}

const DAY_OPTIONS = [3, 5, 7, 10] as const;
const DURATION_OPTIONS = [15, 30, 45, 60] as const;

function formatTime12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${h12}:00${period}`;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

export function AvailableSlotsModal({
  open,
  onClose,
  doctors,
  initialDoctorId,
}: AvailableSlotsModalProps) {
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(
    initialDoctorId || doctors[0]?.id || ""
  );
  const [days, setDays] = useState<number>(7);
  const [duration, setDuration] = useState<number>(30);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  // Fetch on open + param changes. Cleared on close so next open re-fetches.
  useEffect(() => {
    if (!open) {
      setData(null);
      setSelected(new Set());
      setCopied(false);
      return;
    }
    if (!selectedDoctorId) return;

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    const today = format(new Date(), "yyyy-MM-dd");
    const url = `/api/scheduler/available-slots?doctor_id=${selectedDoctorId}&days=${days}&duration=${duration}&start_date=${today}`;

    fetch(url, { signal: controller.signal })
      .then((r) => r.json())
      .then((json: ApiResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in json) {
          toast.error("Error al cargar horarios");
          setData(null);
        } else {
          setData(json);
          setSelected(new Set()); // reset selection on refetch
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") toast.error("Error al cargar horarios");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, selectedDoctorId, days, duration]);

  const toggleSlot = useCallback((date: string, time: string) => {
    const key = `${date}|${time}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllForDay = useCallback((day: DaySlots) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = day.slots.every((s) => next.has(`${day.date}|${s}`));
      for (const s of day.slots) {
        const key = `${day.date}|${s}`;
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!data) return;
    setSelected((prev) => {
      const total = data.days.reduce((acc, d) => acc + d.slots.length, 0);
      if (prev.size === total) return new Set();
      const next = new Set<string>();
      for (const day of data.days) {
        for (const s of day.slots) next.add(`${day.date}|${s}`);
      }
      return next;
    });
  }, [data]);

  const message = useMemo(() => {
    if (!data || selected.size === 0) return "";
    const doctorName = data.doctor.full_name;
    const lines: string[] = [`Los próximos horarios disponibles con el ${doctorName} son:`, ""];

    for (const day of data.days) {
      const daySelected = day.slots.filter((s) => selected.has(`${day.date}|${s}`));
      if (daySelected.length === 0) continue;
      const timesStr = daySelected.map(formatTime12h).join(", ");
      lines.push(`📅 ${formatDayLabel(day.date)}: ${timesStr}`);
    }

    lines.push("", "¿En cuál de estos horarios desearía reservar?");
    return lines.join("\n");
  }, [data, selected]);

  const handleCopy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Mensaje copiado al portapapeles");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Mensaje copiado al portapapeles");
    }
  };

  const totalAvailable = data?.days.reduce((acc, d) => acc + d.slots.length, 0) ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Share2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Compartir horarios disponibles</h3>
                  <p className="text-xs text-muted-foreground">
                    Selecciona los horarios y cópialos para enviar por WhatsApp
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 border-b border-border px-5 py-3 bg-muted/30">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
                  Doctor
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm min-w-[200px]"
                >
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
                  Días
                </label>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {DAY_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setDays(n)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        days === n
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wide">
                  Intervalo
                </label>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {DURATION_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setDuration(n)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        duration === n
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {n}m
                    </button>
                  ))}
                </div>
              </div>

              {data && totalAvailable > 0 && (
                <div className="ml-auto flex items-end">
                  <button
                    onClick={selectAll}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    {selected.size === totalAvailable ? "Limpiar todo" : "Seleccionar todo"}
                  </button>
                </div>
              )}
            </div>

            {/* Slots grid */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !data ? (
                <p className="text-center text-sm text-muted-foreground py-10">
                  Selecciona un doctor para ver horarios
                </p>
              ) : totalAvailable === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">
                  No hay horarios disponibles en el rango seleccionado
                </p>
              ) : (
                data.days.map((day) => {
                  if (day.slots.length === 0) return null;
                  const allDaySelected = day.slots.every((s) =>
                    selected.has(`${day.date}|${s}`)
                  );
                  return (
                    <div key={day.date}>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-semibold capitalize">
                          {formatDayLabel(day.date)}
                        </h4>
                        <button
                          onClick={() => selectAllForDay(day)}
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {allDaySelected ? "Limpiar día" : "Todos"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {day.slots.map((time) => {
                          const key = `${day.date}|${time}`;
                          const isSel = selected.has(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleSlot(day.date, time)}
                              className={cn(
                                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                                isSel
                                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "border-border bg-background text-foreground hover:bg-accent"
                              )}
                            >
                              {formatTime12h(time)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Preview + copy */}
            {selected.size > 0 && message && (
              <div className="border-t border-border bg-muted/30 p-4 space-y-3">
                <div className="rounded-lg border border-border bg-background p-3 max-h-36 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs text-foreground font-sans leading-relaxed">
                    {message}
                  </pre>
                </div>
                <button
                  onClick={handleCopy}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-primary text-primary-foreground hover:opacity-90"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      ¡Copiado al portapapeles!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar mensaje ({selected.size} horario{selected.size !== 1 ? "s" : ""})
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
