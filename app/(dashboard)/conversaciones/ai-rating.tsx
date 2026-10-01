"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { inboxFetch } from "./use-inbox";

/**
 * Pulgar arriba / abajo sobre una sugerencia de Yendy (mig 278). Guarda al
 * instante; con pulgar abajo pide, opcionalmente, qué estuvo mal. Volver a
 * pulsar el mismo pulgar quita la valoración.
 */
export function AiRating({ suggestionId, className }: { suggestionId: string | null; className?: string }) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [note, setNote] = useState("");
  const [askNote, setAskNote] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRating(null);
    setNote("");
    setAskNote(false);
  }, [suggestionId]);

  if (!suggestionId) return null;

  async function save(next: 1 | -1 | null, withNote?: string) {
    if (busy) return;
    setBusy(true);
    const res = await inboxFetch("/api/inbox/ai/feedback", {
      method: "POST",
      body: { suggestion_id: suggestionId, rating: next, note: withNote?.trim() || null },
    });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setRating(next);
    if (next === -1 && withNote === undefined) setAskNote(true);
    else setAskNote(false);
    if (withNote !== undefined) toast.success("Gracias, queda registrado para mejorar a Yendy");
  }

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="flex items-center gap-0.5" role="group" aria-label="¿Te sirvió la sugerencia?">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(rating === 1 ? null : 1)}
          aria-pressed={rating === 1}
          aria-label="Buena sugerencia"
          title="Buena sugerencia"
          className={cn(
            "rounded-md p-1 text-muted-foreground transition hover:text-foreground",
            rating === 1 && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(rating === -1 ? null : -1)}
          aria-pressed={rating === -1}
          aria-label="Mala sugerencia"
          title="Mala sugerencia"
          className={cn(
            "rounded-md p-1 text-muted-foreground transition hover:text-foreground",
            rating === -1 && "bg-red-500/15 text-red-600 dark:text-red-400",
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {askNote && rating === -1 && (
        <form
          className="flex w-full max-w-xs items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save(-1, note);
          }}
        >
          <input
            autoFocus
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="¿Qué estuvo mal? (opcional)"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] outline-none"
          />
          <button type="submit" disabled={busy} className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
