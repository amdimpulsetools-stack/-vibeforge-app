"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { inboxFetch } from "../../use-inbox";
import { Chip, input, SectionHeader } from "./shared";

interface TestDraft {
  reply: string;
  alarm: boolean;
  needs_human: boolean;
  intent?: string;
  sources: string[];
  gap_question: string | null;
  price_issues: string[];
}

const SAMPLES = [
  "Hola, ¿cuánto cuesta la consulta y atienden los sábados?",
  "Está un poco caro, lo voy a pensar",
  "¿Qué incluye el tratamiento? ¿Duele?",
  "Quiero reprogramar mi cita de mañana",
];

export default function TestSection() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<TestDraft | null>(null);

  async function run(text = message) {
    if (text.trim().length < 2) return;
    setLoading(true);
    setDraft(null);
    const res = await inboxFetch<TestDraft>("/api/inbox/ai/suggest", { method: "POST", body: { test_message: text.trim() } });
    setLoading(false);
    if (!res.ok) return void toast.error(res.error);
    setDraft(res.data);
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Probar Yendy"
        description="Escribe una pregunta como la haría una paciente y mira qué respondería Yendy con tu guía, tus fichas, tus casos y tus reglas actuales. No se envía nada. Úsalo cada vez que cambies algo."
      />
      <div className="flex flex-wrap gap-1.5">
        {SAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setMessage(s);
              void run(s);
            }}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
      <textarea className={`${input} min-h-[90px]`} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ej. Hola, ¿cuánto cuesta la consulta y atienden los sábados?" />
      <button
        type="button"
        onClick={() => void run()}
        disabled={loading || message.trim().length < 2}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Probar
      </button>
      {draft && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
          <p className="whitespace-pre-wrap text-sm">{draft.reply}</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.alarm && <Chip tone="red">Alarma: borrador fijo, sin IA</Chip>}
            {draft.needs_human && <Chip tone="amber">Pide revisión humana</Chip>}
            {draft.intent && <Chip tone="primary">intención: {draft.intent}</Chip>}
            {draft.price_issues.length > 0 && <Chip tone="red">Precio fuera del catálogo: {draft.price_issues.join(", ")}</Chip>}
            {draft.sources.map((src) => (
              <Chip key={src} tone="muted">
                {src}
              </Chip>
            ))}
          </div>
          {draft.gap_question && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Falta en la base: “{draft.gap_question}”. Créala en “Base de conocimientos” o guárdala como caso.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
