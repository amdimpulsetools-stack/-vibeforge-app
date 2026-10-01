"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { Switch } from "@/components/ui/switch";
import { inboxKeys, useInboxSettings, type InboxSettingsRow } from "../../use-inbox";
import { input, Loading, LoadFailed, SaveButton, SectionHeader, SettingRow } from "./shared";

export default function GeneralSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const settings = useInboxSettings(organizationId);
  const [s, setS] = useState<InboxSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (settings.data) setS(settings.data);
  }, [settings.data]);
  if (settings.error) return <LoadFailed error={settings.error} onRetry={() => void settings.refetch()} />;
  if (!s) return <Loading />;

  async function save() {
    if (!s) return;
    setSaving(true);
    const { error } = await createClient()
      .from("wa_inbox_settings")
      .upsert({ organization_id: organizationId, ...s, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
    setSaving(false);
    if (error) return void toast.error("No se pudo guardar");
    toast.success("Ajustes guardados");
    qc.invalidateQueries({ queryKey: inboxKeys.settings(organizationId) });
    qc.invalidateQueries({ queryKey: ["inbox-doctor-access"] });
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="General" description="Quién ve la bandeja y con qué modelo y voz trabaja Yendy IA." />
      <SettingRow
        title="Doctores pueden ver Conversaciones"
        hint="Por defecto solo administración y recepción ven la bandeja."
        control={<Switch checked={s.doctors_enabled} onCheckedChange={(v) => setS({ ...s, doctors_enabled: v })} />}
      />
      <SettingRow
        title="Yendy IA (sugerencias de respuesta)"
        hint="La IA sugiere borradores con la base de conocimientos; siempre envía una persona."
        control={<Switch checked={s.ai_enabled} onCheckedChange={(v) => setS({ ...s, ai_enabled: v })} />}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Modelo</span>
          <select className={input} value={s.ai_model} onChange={(e) => setS({ ...s, ai_model: e.target.value as InboxSettingsRow["ai_model"] })}>
            <option value="claude-haiku-4-5">Haiku 4.5 — rápido y económico</option>
            <option value="claude-sonnet-5-5">Sonnet 5.5 — más preciso</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Trato</span>
          <select className={input} value={s.ai_tone} onChange={(e) => setS({ ...s, ai_tone: e.target.value as InboxSettingsRow["ai_tone"] })}>
            <option value="calido">Cálido (tutea)</option>
            <option value="formal">Formal (de usted)</option>
          </select>
        </label>
      </div>
      <SettingRow
        title="Usar emojis"
        hint="Como máximo uno por mensaje."
        control={<Switch checked={s.ai_use_emojis} onCheckedChange={(v) => setS({ ...s, ai_use_emojis: v })} />}
      />
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Firma (opcional)</span>
        <input
          className={input}
          maxLength={60}
          value={s.ai_signature ?? ""}
          placeholder="Ej. Equipo de Clínica Vitra"
          onChange={(e) => setS({ ...s, ai_signature: e.target.value || null })}
        />
      </label>
      <SaveButton saving={saving} onClick={() => void save()} />
    </div>
  );
}
