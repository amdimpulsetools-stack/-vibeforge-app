"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { inboxKeys, useQuickReplies } from "../../use-inbox";
import { input, LoadFailed, SectionHeader } from "./shared";

export default function QuickRepliesSection() {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const q = useQuickReplies(organizationId);
  const rows = q.data ?? [];
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  async function add() {
    const sc = shortcut.trim().toLowerCase().replace(/^\//, "");
    if (!/^[a-z0-9_-]{1,30}$/.test(sc)) return void toast.error("El atajo usa solo minúsculas, números, - o _ (ej. precios)");
    if (!title.trim() || !body.trim()) return void toast.error("Completa título y mensaje");
    const { error } = await createClient()
      .from("wa_quick_replies")
      .insert({ organization_id: organizationId, shortcut: sc, title: title.trim(), body: body.trim() });
    if (error) return void toast.error(error.code === "23505" ? "Ese atajo ya existe" : "No se pudo guardar");
    setShortcut("");
    setTitle("");
    setBody("");
    qc.invalidateQueries({ queryKey: inboxKeys.quickReplies(organizationId) });
  }
  async function remove(id: string) {
    const { error } = await createClient().from("wa_quick_replies").delete().eq("id", id);
    if (error) return void toast.error("No se pudo borrar");
    qc.invalidateQueries({ queryKey: inboxKeys.quickReplies(organizationId) });
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Respuestas rápidas"
        description={`Escribe “/atajo” en el cuadro de texto para usarlas. Puedes poner {{nombre}} y {{clinica}}: se completan solos.`}
      />
      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <input className={input} placeholder="/atajo" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
        <input className={input} placeholder="Título (ej. Formas de pago)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <textarea className={`${input} min-h-[80px]`} placeholder="Hola {{nombre}}, aceptamos…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="button" onClick={() => void add()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
        <Plus className="h-4 w-4" /> Agregar
      </button>
      {q.error ? (
        <LoadFailed error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  /{r.shortcut} · {r.title}
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{r.body}</p>
              </div>
              <button type="button" onClick={() => void remove(r.id)} className="text-muted-foreground hover:text-red-600" aria-label="Borrar">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">Sin respuestas rápidas.</li>}
        </ul>
      )}
    </div>
  );
}
