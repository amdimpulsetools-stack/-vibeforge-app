"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { PostgrestLoadError } from "../../../scheduler/data-load-error";
import { inboxKeys } from "../../use-inbox";
import { GhostButton, input, Loading, LoadFailed, SectionHeader } from "./shared";

/**
 * Brechas: preguntas reales que Yendy no supo responder. Responderlas crea
 * una ficha (dato de la clínica) o un caso (ejemplo de cómo responder).
 */
export default function GapsSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const gaps = useQuery({
    queryKey: inboxKeys.gaps(organizationId),
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("wa_kb_gaps")
        .select("id, question, created_at")
        .eq("organization_id", organizationId as string)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new PostgrestLoadError("Brechas", error);
      return (data ?? []) as Array<{ id: string; question: string; created_at: string }>;
    },
  });
  const [answering, setAnswering] = useState<string | null>(null);
  const [mode, setMode] = useState<"entry" | "case">("entry");
  const [answer, setAnswer] = useState("");
  const [guidance, setGuidance] = useState("");

  async function resolve(id: string, question: string, withAnswer: boolean) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let kbId: string | null = null;
    if (withAnswer) {
      if (!answer.trim()) return void toast.error("Escribe la respuesta");
      if (mode === "entry") {
        const { data, error } = await supabase
          .from("wa_kb_entries")
          .insert({ organization_id: organizationId, kind: "faq", title: question.slice(0, 120), content: answer.trim(), updated_by: user?.id ?? null })
          .select("id")
          .single();
        if (error || !data) return void toast.error("No se pudo crear la ficha");
        kbId = data.id as string;
      } else {
        const { error } = await supabase.from("wa_kb_cases").insert({
          organization_id: organizationId,
          intent: "otro",
          title: question.slice(0, 120),
          patient_message: question,
          ideal_reply: answer.trim(),
          guidance: guidance.trim() || null,
          created_by: user?.id ?? null,
          updated_by: user?.id ?? null,
        });
        if (error) return void toast.error("No se pudo crear el caso");
      }
    }
    const { error } = await supabase
      .from("wa_kb_gaps")
      .update({ status: withAnswer ? "answered" : "dismissed", kb_entry_id: kbId, resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
      .eq("id", id);
    if (error) return void toast.error("No se pudo actualizar");
    setAnswering(null);
    setAnswer("");
    setGuidance("");
    qc.invalidateQueries({ queryKey: inboxKeys.gaps(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.kb(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.cases(organizationId) });
    if (withAnswer) toast.success(mode === "entry" ? "Agregado a la base de conocimientos" : "Guardado como caso");
  }

  if (gaps.error) return <LoadFailed error={gaps.error} onRetry={() => void gaps.refetch()} />;
  if (gaps.isPending) return <Loading />;
  const rows = gaps.data ?? [];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Brechas"
        description="Preguntas reales de pacientes que Yendy no pudo responder con la base. Respóndelas una vez y la IA ya las sabrá. Revisar esto 10 minutos a la semana es todo el “entrenamiento” que necesita."
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay brechas abiertas. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((g) => (
            <li key={g.id} className="rounded-lg border border-border p-3">
              <p className="text-sm">“{g.question}”</p>
              {answering === g.id ? (
                <div className="mt-2 space-y-2">
                  <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                    {(
                      [
                        ["entry", "Guardar como ficha (un dato)"],
                        ["case", "Guardar como caso (cómo responder)"],
                      ] as const
                    ).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setMode(k)} className={cn("rounded-md px-2.5 py-1 font-medium", mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={`${input} min-h-[80px]`}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={mode === "entry" ? "La respuesta, tal como quieres que la use Yendy" : "La respuesta ideal, como la daría tu equipo (cálida y con el siguiente paso)"}
                  />
                  {mode === "case" && <input className={input} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="Hacia dónde encauzar después (opcional)" />}
                  <div className="flex gap-2">
                    <GhostButton onClick={() => setAnswering(null)} className="px-3 py-1 text-xs">
                      Cancelar
                    </GhostButton>
                    <button type="button" onClick={() => void resolve(g.id, g.question, true)} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      <Check className="h-3.5 w-3.5" /> Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex gap-3 text-xs">
                  <button type="button" onClick={() => setAnswering(g.id)} className="font-medium text-primary">
                    Responder
                  </button>
                  <button type="button" onClick={() => void resolve(g.id, g.question, false)} className="text-muted-foreground">
                    Descartar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
