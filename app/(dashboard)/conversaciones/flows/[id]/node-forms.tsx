"use client";

import { Plus, Trash2 } from "lucide-react";
import { TRIGGER_KINDS, TRIGGER_LABEL, type NodeType, type Trigger } from "@/lib/inbox/flows/schema";
import type { ApprovedTemplate, OrgTag } from "../../use-inbox";

/** Formularios del panel derecho del editor: uno por tipo de nodo + el del disparador. */

const input = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60";
const label = "mb-1 block text-xs font-medium";

export function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24) || "opcion";

export function TriggerForm({ trigger, onChange, readOnly }: { trigger: Trigger; onChange: (t: Trigger) => void; readOnly: boolean }) {
  const set = (patch: Partial<Trigger>) => onChange({ ...trigger, ...patch });
  return (
    <div className="space-y-3">
      <Field title="Cuándo arranca">
        <select className={input} disabled={readOnly} value={trigger.kind} onChange={(e) => set({ kind: e.target.value as Trigger["kind"] })}>
          {TRIGGER_KINDS.map((k) => (
            <option key={k} value={k}>
              {TRIGGER_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      {trigger.kind === "keyword" && (
        <>
          <Field title="Palabras clave" hint="Una por línea. Se comparan sin mayúsculas ni tildes.">
            <textarea className={`${input} min-h-[70px]`} disabled={readOnly} value={trigger.keywords.join("\n")} onChange={(e) => set({ keywords: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30) })} placeholder={"precio\ncita\nhorario"} />
          </Field>
          <Field title="Coincidencia">
            <select className={input} disabled={readOnly} value={trigger.match} onChange={(e) => set({ match: e.target.value as Trigger["match"] })}>
              <option value="contains">El mensaje contiene la palabra</option>
              <option value="exact">El mensaje es exactamente la palabra</option>
            </select>
          </Field>
        </>
      )}
      {trigger.kind === "new_conversation" && (
        <Field title="También si vuelve a escribir tras (días de silencio)">
          <input type="number" min={1} max={365} className={input} disabled={readOnly} value={trigger.silence_days} onChange={(e) => set({ silence_days: Number(e.target.value) || 30 })} />
        </Field>
      )}
      {trigger.kind === "no_reply" && (
        <>
          <Field title="Minutos sin respuesta del equipo">
            <input type="number" min={5} max={1440} className={input} disabled={readOnly} value={trigger.minutes} onChange={(e) => set({ minutes: Number(e.target.value) || 30 })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={readOnly} checked={trigger.only_business_hours} onChange={(e) => set({ only_business_hours: e.target.checked })} /> Solo en horario de atención
          </label>
        </>
      )}
      {trigger.kind === "template_button" && (
        <Field title="Botones (payload) que lo disparan" hint="Uno por línea, tal como está en la plantilla (ej. confirmar, reagendar).">
          <textarea className={`${input} min-h-[60px]`} disabled={readOnly} value={trigger.payloads.join("\n")} onChange={(e) => set({ payloads: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20) })} />
        </Field>
      )}
      {trigger.kind === "manual" && <p className="text-xs text-muted-foreground">Recepción lo inicia desde la conversación (“Iniciar flow”).</p>}
      <Field title="No repetir en el mismo chat antes de (horas)" hint="0 = sin límite.">
        <input type="number" min={0} max={720} className={input} disabled={readOnly} value={trigger.cooldown_hours} onChange={(e) => set({ cooldown_hours: Math.max(0, Number(e.target.value) || 0) })} />
      </Field>
    </div>
  );
}

export interface FormProps {
  type: NodeType;
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  readOnly: boolean;
  tags: OrgTag[];
  templates: ApprovedTemplate[];
  members: Array<{ user_id: string; full_name: string; role: string }>;
}

export function NodeForm(p: FormProps) {
  const { type, data, onChange, readOnly } = p;
  const varsHint = "Variables: {{nombre}} (de la paciente) y {{clinica}}.";
  switch (type) {
    case "send_text":
      return (
        <Field title="Mensaje" hint={varsHint}>
          <textarea className={`${input} min-h-[120px]`} maxLength={4096} disabled={readOnly} value={(data.text as string) ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      );
    case "ask_buttons": {
      const buttons = ((data.buttons as Array<{ id: string; title: string }>) ?? []).slice(0, 3);
      return (
        <div className="space-y-3">
          <Field title="Pregunta" hint={varsHint}>
            <textarea className={`${input} min-h-[80px]`} maxLength={1024} disabled={readOnly} value={(data.text as string) ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <OptionsEditor
            title="Botones (máx. 3, 20 letras)"
            items={buttons}
            max={3}
            maxLen={20}
            readOnly={readOnly}
            onChange={(items) => onChange({ buttons: items })}
          />
          <Field title="Si no responde en (minutos)">
            <input type="number" min={1} max={10080} className={input} disabled={readOnly} value={(data.timeout_minutes as number) ?? 60} onChange={(e) => onChange({ timeout_minutes: Number(e.target.value) || 60 })} />
          </Field>
        </div>
      );
    }
    case "ask_list": {
      const rows = ((data.rows as Array<{ id: string; title: string; description?: string }>) ?? []).slice(0, 10);
      return (
        <div className="space-y-3">
          <Field title="Pregunta" hint={varsHint}>
            <textarea className={`${input} min-h-[80px]`} maxLength={4096} disabled={readOnly} value={(data.text as string) ?? ""} onChange={(e) => onChange({ text: e.target.value })} />
          </Field>
          <Field title="Texto del botón que abre la lista (20 letras)">
            <input className={input} maxLength={20} disabled={readOnly} value={(data.button_label as string) ?? "Ver opciones"} onChange={(e) => onChange({ button_label: e.target.value })} />
          </Field>
          <OptionsEditor title="Opciones (máx. 10, 24 letras)" items={rows} max={10} maxLen={24} readOnly={readOnly} onChange={(items) => onChange({ rows: items })} />
          <Field title="Si no responde en (minutos)">
            <input type="number" min={1} max={10080} className={input} disabled={readOnly} value={(data.timeout_minutes as number) ?? 60} onChange={(e) => onChange({ timeout_minutes: Number(e.target.value) || 60 })} />
          </Field>
        </div>
      );
    }
    case "wait":
      return (
        <div className="space-y-3">
          <Field title="Qué esperar">
            <select className={input} disabled={readOnly} value={(data.mode as string) ?? "delay"} onChange={(e) => onChange({ mode: e.target.value })}>
              <option value="delay">Un tiempo fijo</option>
              <option value="reply">A que la paciente escriba</option>
            </select>
          </Field>
          <Field title={data.mode === "reply" ? "Tiempo máximo (minutos)" : "Minutos"}>
            <input type="number" min={1} max={10080} className={input} disabled={readOnly} value={(data.minutes as number) ?? 30} onChange={(e) => onChange({ minutes: Number(e.target.value) || 30 })} />
          </Field>
        </div>
      );
    case "condition":
      return (
        <div className="space-y-3">
          <Field title="Comprobar">
            <select className={input} disabled={readOnly} value={(data.check as string) ?? "business_hours"} onChange={(e) => onChange({ check: e.target.value })}>
              <option value="business_hours">Estamos dentro del horario de atención</option>
              <option value="window_open">La ventana de 24 h está abierta</option>
              <option value="has_patient">El chat tiene ficha de paciente</option>
              <option value="has_tag">El chat tiene una etiqueta</option>
              <option value="keyword">La última respuesta contiene una palabra</option>
            </select>
          </Field>
          {data.check === "keyword" && (
            <Field title="Palabras" hint="Una por línea.">
              <textarea className={`${input} min-h-[60px]`} disabled={readOnly} value={((data.keywords as string[]) ?? []).join("\n")} onChange={(e) => onChange({ keywords: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30) })} />
            </Field>
          )}
          {data.check === "has_tag" && (
            <Field title="Etiqueta">
              <select className={input} disabled={readOnly} value={(data.tag_id as string) ?? ""} onChange={(e) => onChange({ tag_id: e.target.value || null })}>
                <option value="">— Elige —</option>
                {p.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      );
    case "send_template": {
      const tpl = p.templates.find((t) => t.id === data.template_id);
      const varNums = tpl ? [...new Set([...(tpl.body_text ?? "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))] : [];
      const vars = (data.vars as Record<string, string>) ?? {};
      return (
        <div className="space-y-3">
          <Field title="Plantilla aprobada por Meta" hint="Es lo único que puede salir fuera de la ventana de 24 h (tiene costo).">
            <select className={input} disabled={readOnly} value={(data.template_id as string) ?? ""} onChange={(e) => onChange({ template_id: e.target.value })}>
              <option value="">— Elige —</option>
              {p.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.meta_template_name} ({t.language})
                </option>
              ))}
            </select>
          </Field>
          {tpl && <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">{tpl.body_text}</p>}
          {varNums.map((n) => (
            <Field key={n} title={`Variable {{${n}}}`} hint={tpl?.variable_mapping?.[n] ? `Sugerido: ${tpl.variable_mapping[n]}` : undefined}>
              <input className={input} maxLength={500} disabled={readOnly} value={vars[n] ?? ""} onChange={(e) => onChange({ vars: { ...vars, [n]: e.target.value } })} placeholder="{{nombre}} o un texto fijo" />
            </Field>
          ))}
        </div>
      );
    }
    case "tag":
      return (
        <div className="space-y-3">
          <Field title="Acción">
            <select className={input} disabled={readOnly} value={(data.action as string) ?? "add"} onChange={(e) => onChange({ action: e.target.value })}>
              <option value="add">Poner etiqueta</option>
              <option value="remove">Quitar etiqueta</option>
            </select>
          </Field>
          <Field title="Etiqueta" hint="Las etiquetas se crean desde el panel derecho de un chat.">
            <select className={input} disabled={readOnly} value={(data.tag_id as string) ?? ""} onChange={(e) => onChange({ tag_id: e.target.value })}>
              <option value="">— Elige —</option>
              {p.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      );
    case "notify":
      return (
        <div className="space-y-3">
          <Field title="Avisar a">
            <select className={input} disabled={readOnly} value={(data.target as string) ?? "reception"} onChange={(e) => onChange({ target: e.target.value, user_id: e.target.value === "user" ? (data.user_id ?? null) : null })}>
              <option value="reception">Recepción (todo el equipo de la bandeja)</option>
              <option value="user">Una persona concreta (y se le asigna el chat)</option>
            </select>
          </Field>
          {data.target === "user" && (
            <Field title="Persona">
              <select className={input} disabled={readOnly} value={(data.user_id as string) ?? ""} onChange={(e) => onChange({ user_id: e.target.value || null })}>
                <option value="">— Elige —</option>
                {p.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name} · {m.role}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field title="Nota para el equipo (opcional)" hint="Se guarda como nota interna en el chat; la paciente no la ve.">
            <input className={input} maxLength={300} disabled={readOnly} value={(data.note as string) ?? ""} onChange={(e) => onChange({ note: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={readOnly} checked={data.pause_bot !== false} onChange={(e) => onChange({ pause_bot: e.target.checked })} /> Pausar el bot: la persona toma el chat
          </label>
        </div>
      );
    case "handoff":
      return (
        <Field title="Nota para el equipo (opcional)" hint="El bot termina aquí y el chat queda en manos de una persona. Todo flow debe poder llegar a este nodo o a “Avisar y asignar”.">
          <input className={input} maxLength={300} disabled={readOnly} value={(data.note as string) ?? ""} onChange={(e) => onChange({ note: e.target.value })} />
        </Field>
      );
    case "end":
      return <p className="text-xs text-muted-foreground">El flow termina sin pausar el bot: si la paciente vuelve a escribir, los disparadores se evalúan de nuevo.</p>;
    case "trigger":
      return null;
  }
}

function OptionsEditor({
  title,
  items,
  max,
  maxLen,
  readOnly,
  onChange,
}: {
  title: string;
  items: Array<{ id: string; title: string; description?: string }>;
  max: number;
  maxLen: number;
  readOnly: boolean;
  onChange: (items: Array<{ id: string; title: string; description?: string }>) => void;
}) {
  const update = (i: number, title: string) => {
    const next = items.map((it, j) => (j === i ? { ...it, title } : it));
    onChange(next);
  };
  const add = () => {
    if (items.length >= max) return;
    const base = `op${items.length + 1}`;
    let id = base;
    let n = 1;
    while (items.some((it) => it.id === id)) id = `${base}_${n++}`;
    onChange([...items, { id, title: "" }]);
  };
  return (
    <div>
      <span className={label}>{title}</span>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-1.5">
            <input
              className={input}
              maxLength={maxLen}
              disabled={readOnly}
              value={it.title}
              placeholder={`Opción ${i + 1}`}
              onChange={(e) => update(i, e.target.value)}
              onBlur={(e) => {
                // El id sale del título (estable una vez conectado: solo si aún es automático).
                if (/^op\d+(_\d+)?$/.test(it.id) && e.target.value.trim()) {
                  const want = slug(e.target.value);
                  if (!items.some((o, j) => j !== i && o.id === want)) onChange(items.map((o, j) => (j === i ? { ...o, id: want } : o)));
                }
              }}
            />
            {!readOnly && (
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded-md p-1 text-muted-foreground hover:text-red-600" aria-label="Quitar opción">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && items.length < max && (
        <button type="button" onClick={add} className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary">
          <Plus className="h-3.5 w-3.5" /> Añadir opción
        </button>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">La paciente también puede escribir el número de la opción.</p>
    </div>
  );
}
