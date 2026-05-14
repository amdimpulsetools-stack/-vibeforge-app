"use client";

import { useState } from "react";
import { Laptop, Smartphone, MapPin, Clock, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface ExistingSession {
  id: string;
  device_label: string | null;
  ip_city: string | null;
  ip_country: string | null;
  last_seen_at: string;
  created_at: string;
}

interface Props {
  open: boolean;
  limit: number;
  sessions: ExistingSession[];
  onConfirm: (sessionIds: string[]) => Promise<void> | void;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function deviceIconFor(label: string | null) {
  const l = (label ?? "").toLowerCase();
  if (l.includes("iphone") || l.includes("android")) return Smartphone;
  return Laptop;
}

export function DeviceLimitDialog({ open, limit, sessions, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm([...selected]);
    } finally {
      // The parent will unmount us on success. If it didn't (e.g.
      // a transient error), allow retry.
      setSubmitting(false);
      setSelected(new Set());
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        // Prevent close-on-overlay-click — this is a hard block, the
        // user has to make a choice to continue.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Demasiados dispositivos activos</DialogTitle>
          <DialogDescription>
            Tu plan permite hasta {limit} {limit === 1 ? "dispositivo" : "dispositivos"} a la vez.
            Cerrá uno para iniciar sesión en este.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {sessions.map((s) => {
            const Icon = deviceIconFor(s.device_label);
            const isSelected = selected.has(s.id);
            const location = [s.ip_city, s.ip_country].filter(Boolean).join(", ") || "Ubicación desconocida";
            return (
              <li
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/5"
                    : "border-border/60 hover:border-border"
                }`}
              >
                <Checkbox checked={isSelected} onCheckedChange={() => toggle(s.id)} className="mt-0.5" />
                <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {s.device_label ?? "Dispositivo desconocido"}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Última actividad {relativeTime(s.last_seen_at)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0 || submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cerrando sesión…
              </>
            ) : (
              `Cerrar ${selected.size > 0 ? `${selected.size} ` : ""}${selected.size === 1 ? "sesión" : "sesiones"} y continuar`
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center">
            Las sesiones cerradas tendrán que volver a iniciar sesión en sus dispositivos.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
