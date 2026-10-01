"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { inboxKeys, useInboxSettings, useOrgServices } from "../../use-inbox";
import { input, Loading, LoadFailed, SaveButton, SectionHeader } from "./shared";

const RULE_EXAMPLES = [
  "No ofrecer descuentos ni promociones.",
  "Para FIV, ofrecer primero una consulta de evaluación.",
  "No confirmar horarios: siempre decir que recepción confirma.",
  "Si preguntan por resultados, pedir que llamen al consultorio.",
];

export default function RulesSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const settings = useInboxSettings(organizationId);
  const services = useOrgServices(organizationId);
  const [rules, setRules] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (settings.data) {
      setRules(settings.data.ai_rules ?? "");
      setHidden(settings.data.ai_hidden_service_ids ?? []);
    }
  }, [settings.data]);
  if (settings.error) return <LoadFailed error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!settings.data) return <Loading />;
  const data = settings.data;

  async function save() {
    setSaving(true);
    const { error } = await createClient()
      .from("wa_inbox_settings")
      .upsert(
        { ...data, organization_id: organizationId, ai_rules: rules.trim() || null, ai_hidden_service_ids: hidden, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" },
      );
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Reglas guardadas");
    qc.invalidateQueries({ queryKey: inboxKeys.settings(organizationId) });
  }

  const q = filter.trim().toLowerCase();
  const list = services.data ?? [];
  const visible = q ? list.filter((sv) => sv.name.toLowerCase().includes(q)) : list;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Reglas de Yendy"
        description="Límites propios de la clínica. Se suman a las reglas fijas de seguridad (no diagnosticar, no inventar precios, derivar urgencias), que no se pueden desactivar."
      />
      <section className="space-y-2">
        <p className="text-sm font-medium">Reglas que Yendy no puede romper</p>
        <p className="text-xs text-muted-foreground">Una por línea, en lenguaje simple.</p>
        <textarea className={`${input} min-h-[140px]`} maxLength={2000} value={rules} onChange={(e) => setRules(e.target.value)} placeholder={RULE_EXAMPLES.join("\n")} />
        <p className="text-right text-[11px] text-muted-foreground">{rules.length}/2000</p>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium">Servicios que Yendy no ofrece por chat</p>
        <p className="text-xs text-muted-foreground">
          Marcados = Yendy no los menciona ni da su precio. Si la paciente pregunta, responde que una persona del equipo le escribe y marca el borrador para revisión.
        </p>
        <input className={input} placeholder="Buscar servicio" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {services.error ? (
            <LoadFailed error={services.error} onRetry={() => void services.refetch()} />
          ) : services.isPending ? (
            <p className="p-2 text-xs text-muted-foreground">Cargando servicios…</p>
          ) : visible.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">Sin servicios.</p>
          ) : (
            visible.map((sv) => {
              const on = hidden.includes(sv.id);
              return (
                <label key={sv.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                  <input type="checkbox" checked={on} onChange={() => setHidden(on ? hidden.filter((h) => h !== sv.id) : [...hidden, sv.id])} />
                  <span className={on ? "text-muted-foreground line-through" : ""}>{sv.name}</span>
                </label>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{hidden.length} servicio(s) oculto(s) para Yendy.</p>
      </section>

      <SaveButton saving={saving} onClick={() => void save()}>
        Guardar reglas
      </SaveButton>
    </div>
  );
}
