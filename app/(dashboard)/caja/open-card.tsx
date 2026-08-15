"use client";

/**
 * Estado "sin caja abierta": abrir, y ver cómo cerraron las últimas.
 *
 * Los cinco turnos previos están aquí a propósito. Es el momento del día en
 * que alguien se para frente al cajón; si ayer hubo un faltante, este es el
 * sitio donde tiene que verlo, no un reporte que nadie abre.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, LockOpen } from "lucide-react";
import {
  DIFFERENCE_TONE_CLASS,
  differenceTone,
  fmtDate,
  formatPEN,
  formatSignedPEN,
  type CashShift,
} from "./types";

interface Props {
  defaultFloat: number;
  tolerance: number;
  canOpen: boolean;
  recentClosed: CashShift[];
  authors: Record<string, string>;
  onOpen: (float: number, notes: string | null) => Promise<boolean>;
}

const labelCls =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export function OpenCard({
  defaultFloat,
  tolerance,
  canOpen,
  recentClosed,
  authors,
  onOpen,
}: Props) {
  const [float, setFloat] = useState(String(defaultFloat ?? 0));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // El fondo por defecto llega con los ajustes, que cargan después del primer
  // render: sin esto el campo se queda en "0" aunque la org tenga fondo fijo.
  useEffect(() => {
    setFloat(String(defaultFloat ?? 0));
  }, [defaultFloat]);

  const value = Number(float.replace(",", "."));
  const valid = Number.isFinite(value) && value >= 0;

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    await onOpen(value, notes.trim() || null);
    setSaving(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <LockOpen className="h-4 w-4 text-primary" /> Abrir caja
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuenta el fondo con el que arrancas. Es el punto de partida del
          arqueo: todo lo que entre y salga después se mide contra este número.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className={labelCls}>Fondo inicial</label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">S/</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.10"
                value={float}
                onChange={(e) => setFloat(e.target.value)}
                disabled={!canOpen}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notas (opcional)</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. turno tarde, recibo el cajón de Ana"
              maxLength={200}
              disabled={!canOpen}
            />
          </div>

          {canOpen ? (
            <Button
              className="w-full"
              onClick={() => void submit()}
              disabled={!valid || saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Abrir caja con {formatPEN(valid ? value : 0)}
            </Button>
          ) : (
            <p className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
              Tu rol no abre caja. Puede hacerlo recepción o un administrador.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card">
        <div className="border-b border-border/40 px-4 py-3">
          <h2 className="text-sm font-bold">Últimos cierres</h2>
        </div>
        {recentClosed.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            Todavía no hay turnos cerrados.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {recentClosed.map((s) => {
              const tone = differenceTone(s.difference_cash, tolerance);
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {fmtDate(s.closed_at)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {authors[s.opened_by] ?? "—"}
                      {s.force_closed ? " · cierre forzado" : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${DIFFERENCE_TONE_CLASS[tone]}`}>
                      {formatSignedPEN(s.difference_cash ?? 0)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      esperado {formatPEN(s.expected_cash ?? 0)} · contado{" "}
                      {formatPEN(s.counted_cash ?? 0)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
