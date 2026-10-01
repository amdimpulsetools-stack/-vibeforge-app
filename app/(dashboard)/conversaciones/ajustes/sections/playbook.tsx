"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { DEFAULT_PLAYBOOK, PlaybookSchema, isDefaultPlaybook, parsePlaybook, playbookPrompt, type Playbook } from "@/lib/inbox/playbook";
import { inboxKeys, useInboxSettings } from "../../use-inbox";
import { GhostButton, Hint, input, linesToList, listToLines, Loading, LoadFailed, SaveButton, SectionHeader } from "./shared";

/**
 * Guía de conversación: la "fórmula" de la clínica. Viene precargada con
 * una fórmula cálida y orientada a cerrar sin presionar; la clínica la
 * ajusta a su voz. Entra al prompt de Yendy después de las reglas fijas.
 */
export default function PlaybookSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const settings = useInboxSettings(organizationId);
  const [p, setP] = useState<Playbook | null>(null);
  const [alwaysText, setAlwaysText] = useState("");
  const [avoidText, setAvoidText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    const parsed = parsePlaybook(settings.data.ai_playbook);
    setP(parsed);
    setAlwaysText(listToLines(parsed.always));
    setAvoidText(listToLines(parsed.avoid));
  }, [settings.data]);

  const usingDefault = isDefaultPlaybook(settings.data?.ai_playbook);
  const preview = useMemo(() => {
    if (!p) return [];
    return playbookPrompt({ ...p, always: linesToList(alwaysText), avoid: linesToList(avoidText) }).slice(1);
  }, [p, alwaysText, avoidText]);

  if (settings.error) return <LoadFailed error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!p || !settings.data) return <Loading />;

  function restore() {
    setP(DEFAULT_PLAYBOOK);
    setAlwaysText(listToLines(DEFAULT_PLAYBOOK.always));
    setAvoidText(listToLines(DEFAULT_PLAYBOOK.avoid));
  }

  async function save() {
    if (!p || !settings.data) return;
    const candidate = { ...p, always: linesToList(alwaysText), avoid: linesToList(avoidText), objections: p.objections.filter((o) => o.objection.trim() || o.response.trim()) };
    const parsed = PlaybookSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return void toast.error(first ? `Revisa: ${first.path.join(".")} — ${first.message}` : "Hay un campo inválido");
    }
    setSaving(true);
    const { error } = await createClient()
      .from("wa_inbox_settings")
      .upsert({ ...settings.data, organization_id: organizationId, ai_playbook: parsed.data, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar la guía");
    toast.success("Guía guardada. Pruébala en “Probar Yendy”.");
    qc.invalidateQueries({ queryKey: inboxKeys.settings(organizationId) });
  }

  const area = (v: string, set: (s: string) => void, placeholder: string, max: number) => (
    <textarea className={`${input} min-h-[90px]`} maxLength={max} value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Guía de conversación"
        description="La fórmula con la que Yendy encauza cada chat: responder primero, entender con una sola pregunta, orientar con el dato exacto y cerrar siempre con el siguiente paso, en cálido y sin presionar."
        action={
          <GhostButton onClick={restore} className="inline-flex items-center gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar fórmula sugerida
          </GhostButton>
        }
      />
      {usingDefault && (
        <Hint>
          Estás usando la <strong className="text-foreground">fórmula sugerida</strong>. Ajusta lo que quieras y guarda: desde entonces Yendy usará tu versión.
          Las reglas fijas de seguridad (no diagnosticar, no inventar precios, derivar urgencias) siguen por encima de esta guía.
        </Hint>
      )}

      <section className="space-y-2">
        <p className="text-sm font-medium">¿A dónde quieres llevar cada conversación?</p>
        {area(p.goal, (v) => setP({ ...p, goal: v }), "Ej. Que la paciente agende una consulta de evaluación con tranquilidad.", 300)}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium">Cómo abrir y entender</p>
        {area(p.opening, (v) => setP({ ...p, opening: v }), "Saludar por su nombre, responder primero lo que preguntó, una sola pregunta si falta un dato…", 500)}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium">Cómo cerrar (el “closer” cálido)</p>
        {area(p.closing, (v) => setP({ ...p, closing: v }), "Proponer el siguiente paso concreto y fácil; pedir día o franja; dejar la puerta abierta si no está lista…", 500)}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Si la paciente dice…</p>
            <p className="text-xs text-muted-foreground">Objeciones frecuentes y cómo responderlas. Yendy las usa cuando reconoce la situación.</p>
          </div>
          <button
            type="button"
            onClick={() => p.objections.length < 20 && setP({ ...p, objections: [...p.objections, { objection: "", response: "" }] })}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary"
          >
            <Plus className="h-4 w-4" /> Agregar
          </button>
        </div>
        <div className="space-y-2">
          {p.objections.map((o, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[220px_1fr_auto]">
              <input
                className={input}
                maxLength={120}
                placeholder="“Está caro”"
                value={o.objection}
                onChange={(e) => setP({ ...p, objections: p.objections.map((x, j) => (j === i ? { ...x, objection: e.target.value } : x)) })}
              />
              <textarea
                className={`${input} min-h-[60px]`}
                maxLength={500}
                placeholder="Cómo responder: validar, explicar qué incluye, ofrecer la opción más accesible…"
                value={o.response}
                onChange={(e) => setP({ ...p, objections: p.objections.map((x, j) => (j === i ? { ...x, response: e.target.value } : x)) })}
              />
              <button
                type="button"
                onClick={() => setP({ ...p, objections: p.objections.filter((_, j) => j !== i) })}
                className="self-start text-muted-foreground hover:text-red-600"
                aria-label="Quitar objeción"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {p.objections.length === 0 && <p className="text-xs text-muted-foreground">Sin objeciones cargadas.</p>}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2">
          <p className="text-sm font-medium">Siempre</p>
          <p className="text-xs text-muted-foreground">Una por línea.</p>
          <textarea className={`${input} min-h-[110px]`} value={alwaysText} onChange={(e) => setAlwaysText(e.target.value)} placeholder={"Responder primero la pregunta\nUna sola pregunta por mensaje"} />
        </section>
        <section className="space-y-2">
          <p className="text-sm font-medium">Nunca</p>
          <p className="text-xs text-muted-foreground">Una por línea.</p>
          <textarea className={`${input} min-h-[110px]`} value={avoidText} onChange={(e) => setAvoidText(e.target.value)} placeholder={"Prometer resultados\nTono de vendedor"} />
        </section>
      </div>

      <SaveButton saving={saving} onClick={() => void save()}>
        Guardar guía
      </SaveButton>

      <details className="rounded-lg border border-border p-3 text-xs">
        <summary className="cursor-pointer font-medium">Así se lo explicamos a Yendy (vista previa del texto)</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-muted-foreground">{preview.join("\n")}</pre>
      </details>
    </div>
  );
}
