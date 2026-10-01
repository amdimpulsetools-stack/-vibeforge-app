"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { inboxKeys, useOrgTags } from "../../use-inbox";
import { LoadFailed, SectionHeader } from "./shared";

export default function TagsSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const q = useOrgTags(organizationId);
  const tags = q.data ?? [];
  async function remove(id: string) {
    const { error } = await createClient().from("org_tags").delete().eq("id", id);
    if (error) return void toast.error(error.code === "23514" ? error.message : "No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.tags(organizationId) });
    qc.invalidateQueries({ queryKey: inboxKeys.conversations(organizationId) });
  }
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Etiquetas"
        description="Las etiquetas se crean desde el panel derecho de cada chat. Aquí puedes borrarlas. “Agendó” y “Asistió” las pone la agenda sola cuando la paciente del chat agenda y llega a su cita: no se borran."
      />
      {q.error ? (
        <LoadFailed error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.id} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium" style={{ backgroundColor: `${t.color}22`, color: t.color }}>
              {t.system_key && <Sparkles className="h-3 w-3" aria-label="automática" />}
              {t.name}
              {t.system_key ? (
                <span className="text-[10px] font-normal opacity-70">automática</span>
              ) : (
                <button type="button" onClick={() => void remove(t.id)} aria-label={`Borrar ${t.name}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
          {tags.length === 0 && <li className="text-sm text-muted-foreground">Sin etiquetas.</li>}
        </ul>
      )}
    </div>
  );
}
