"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { Switch } from "@/components/ui/switch";
import { PostgrestLoadError } from "../../../scheduler/data-load-error";
import { DEFAULT_DISCLOSURE_TEXT } from "@/lib/inbox/flows/schema";
import { input, Hint, Loading, LoadFailed, SaveButton, SectionHeader, SettingRow } from "./shared";

/**
 * Ajustes de Flows (mig 281): interruptor general, horas de pausa cuando
 * una persona escribe, horario silencioso y aviso de asistente virtual.
 * Los flows en sí se editan en /conversaciones/flows.
 */

interface FlowSettings {
  flows_enabled: boolean;
  flows_pause_hours: number;
  flows_quiet_start: string | null;
  flows_quiet_end: string | null;
  flows_disclosure: string | null;
}

function useFlowSettings(orgId: string | null) {
  return useQuery({
    queryKey: ["inbox", "flow-settings", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<FlowSettings> => {
      const { data, error } = await createClient()
        .from("wa_inbox_settings")
        .select("flows_enabled, flows_pause_hours, flows_quiet_start, flows_quiet_end, flows_disclosure")
        .eq("organization_id", orgId as string)
        .maybeSingle();
      if (error) {
        if (error.code === "42703") throw new PostgrestLoadError("Flows", { ...error, message: "Falta aplicar la migración 281" });
        throw new PostgrestLoadError("Flows", error);
      }
      return {
        flows_enabled: (data?.flows_enabled as boolean | undefined) ?? true,
        flows_pause_hours: (data?.flows_pause_hours as number | undefined) ?? 12,
        flows_quiet_start: ((data?.flows_quiet_start as string | null | undefined) ?? null)?.slice(0, 5) ?? null,
        flows_quiet_end: ((data?.flows_quiet_end as string | null | undefined) ?? null)?.slice(0, 5) ?? null,
        flows_disclosure: (data?.flows_disclosure as string | null | undefined) ?? null,
      };
    },
  });
}

export default function FlowsSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const q = useFlowSettings(organizationId);
  const [s, setS] = useState<FlowSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);
  if (q.error) return <LoadFailed error={q.error} onRetry={() => void q.refetch()} />;
  if (!s) return <Loading />;

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await createClient()
      .from("wa_inbox_settings")
      .upsert(
        {
          organization_id: organizationId,
          flows_enabled: s.flows_enabled,
          flows_pause_hours: Math.max(1, Math.min(168, s.flows_pause_hours || 12)),
          flows_quiet_start: s.flows_quiet_start || null,
          flows_quiet_end: s.flows_quiet_end || null,
          flows_disclosure: s.flows_disclosure?.trim() ? s.flows_disclosure.trim().slice(0, 300) : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Ajustes de Flows guardados");
    qc.invalidateQueries({ queryKey: ["inbox", "flow-settings", organizationId] });
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Flows"
        description="Lo que Yenda hace sola cuando una paciente escribe. Aquí van las reglas generales; cada flow se dibuja con nodos en su editor."
        action={
          <Link href="/conversaciones/flows" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Workflow className="h-4 w-4" /> Abrir Flows
          </Link>
        }
      />
      <SettingRow title="Flows activos" hint="Apagado: ningún flow arranca (los que están en curso terminan). Útil en una emergencia." control={<Switch checked={s.flows_enabled} onCheckedChange={(v) => setS({ ...s, flows_enabled: v })} />} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1 block font-medium">Cuando alguien del equipo escribe, el bot se pausa (horas)</span>
          <input type="number" min={1} max={168} className={input} value={s.flows_pause_hours} onChange={(e) => setS({ ...s, flows_pause_hours: Number(e.target.value) || 12 })} />
          <span className="mt-1 block text-[11px] text-muted-foreground">Vale para mensajes desde Yenda y desde la app del celular. También se puede pausar o reanudar en cada chat.</span>
        </label>
        <div className="text-xs">
          <span className="mb-1 block font-medium">Horario silencioso (hora de la clínica)</span>
          <div className="flex items-center gap-2">
            <input type="time" className={input} value={s.flows_quiet_start ?? ""} onChange={(e) => setS({ ...s, flows_quiet_start: e.target.value || null })} />
            <span className="text-muted-foreground">a</span>
            <input type="time" className={input} value={s.flows_quiet_end ?? ""} onChange={(e) => setS({ ...s, flows_quiet_end: e.target.value || null })} />
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">El bot no escribe en ese tramo; lo pendiente sale al terminar. Vacío = sin silencio.</span>
        </div>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block font-medium">Aviso de asistente virtual (primer mensaje de cada bot)</span>
        <textarea className={`${input} min-h-[60px]`} maxLength={300} value={s.flows_disclosure ?? ""} onChange={(e) => setS({ ...s, flows_disclosure: e.target.value })} placeholder={DEFAULT_DISCLOSURE_TEXT} />
        <span className="mt-1 block text-[11px] text-muted-foreground">Meta exige que la paciente sepa que habla con un bot y pueda pedir una persona. Vacío = el texto sugerido. {"{{clinica}}"} se reemplaza por el nombre de la clínica.</span>
      </label>
      <Hint>
        Reglas que el bot cumple siempre: un solo bot por chat; la palabra <em>persona</em> lo corta; STOP o BAJA apagan los automáticos para esa paciente; una señal de alarma pasa a una persona; fuera de la ventana de 24 h solo sale una plantilla aprobada.
      </Hint>
      <SaveButton saving={saving} onClick={() => void save()} />
    </div>
  );
}
