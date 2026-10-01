"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { inboxKeys, useOrgServices } from "./use-inbox";

const INTENTS: Array<[string, string]> = [
  ["precio", "Precio"],
  ["agendar", "Quiere agendar"],
  ["reprogramar", "Reprogramar"],
  ["informacion", "Información"],
  ["resultado", "Resultados"],
  ["queja", "Queja / reclamo"],
  ["saludo", "Saludo"],
  ["objecion", "Objeción"],
  ["otro", "Otro"],
];
const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30";

/**
 * "Guardar como caso" desde el chat: el mensaje real de la paciente y la
 * respuesta real del equipo pasan a la base de casos de Yendy (mig 276).
 * Lo puede hacer cualquier miembro con acceso a la bandeja (RLS INSERT);
 * editar o borrar después es de administración.
 */
export function SaveCaseDialog({
  open,
  onOpenChange,
  conversationId,
  messageId,
  patientMessage,
  suggestedReply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  messageId: string;
  patientMessage: string;
  suggestedReply: string | null;
}) {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { data: services = [] } = useOrgServices(open ? organizationId : null);
  const [intent, setIntent] = useState("otro");
  const [serviceId, setServiceId] = useState("");
  const [msg, setMsg] = useState(patientMessage);
  const [reply, setReply] = useState(suggestedReply ?? "");
  const [guidance, setGuidance] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMsg(patientMessage);
      setReply(suggestedReply ?? "");
      setGuidance("");
      setIntent("otro");
      setServiceId("");
    }
  }, [open, patientMessage, suggestedReply]);

  async function save() {
    if (!msg.trim() || !reply.trim()) return void toast.error("Completa el mensaje y la respuesta ideal");
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("wa_kb_cases").insert({
      organization_id: organizationId,
      intent,
      service_id: serviceId || null,
      title: msg.trim().slice(0, 120),
      patient_message: msg.trim(),
      ideal_reply: reply.trim(),
      guidance: guidance.trim() || null,
      source_conversation_id: conversationId,
      source_message_id: messageId,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return void toast.error(error.code === "42P01" ? "Falta aplicar la migración 276" : "No se pudo guardar el caso");
    toast.success("Caso guardado: Yendy lo usará como ejemplo.");
    qc.invalidateQueries({ queryKey: inboxKeys.cases(organizationId) });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Guardar como caso para Yendy</DialogTitle>
        <DialogDescription>Quita nombres, DNI o datos personales antes de guardar: el caso es un ejemplo de cómo responde la clínica.</DialogDescription>
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Situación</span>
              <select className={input} value={intent} onChange={(e) => setIntent(e.target.value)}>
                {INTENTS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium">Servicio (opcional)</span>
              <select className={input} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">— Ninguno —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Lo que escribió la paciente</span>
            <textarea className={`${input} min-h-[70px]`} maxLength={1500} value={msg} onChange={(e) => setMsg(e.target.value)} />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">La mejor respuesta</span>
            <textarea
              className={`${input} min-h-[90px]`}
              maxLength={2000}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={suggestedReply ? undefined : "Aún no respondiste este mensaje: escribe aquí la respuesta ideal."}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Hacia dónde encauzar después (opcional)</span>
            <input className={input} maxLength={600} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="Ej. Ofrecer dos horarios; si duda, escribirle en 3 días" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
              Cancelar
            </button>
            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar caso
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
