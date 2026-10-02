"use client";

/**
 * Editor de Flows (fase 2): lienzo React Flow a pantalla completa, paleta
 * a la izquierda, panel de propiedades a la derecha, validación en vivo,
 * deshacer / rehacer propios (sin plan Pro), Guardar borrador, Publicar,
 * Pausar / Reanudar y cajón Probar (motor puro vía API: no envía nada).
 *
 * 60 fps: las tarjetas son memo y solo reciben su data; la validación se
 * recalcula por cambios estructurales (no al arrastrar); el canvas lo
 * dibuja React Flow con transform en GPU.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type OnBeforeDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, ArrowLeft, Check, Copy, FlaskConical, Loader2, Pause, Play, Redo2, Save, Trash2, Undo2, X, Send, Clock, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { useOrganization } from "@/components/organization-provider";
import { validateFlow, type ValidationIssue } from "@/lib/inbox/flows/validate";
import { NODE_LABEL, TriggerSchema, type FlowDefinition, type NodeType, type Trigger } from "@/lib/inbox/flows/schema";
import { inboxFetch, useApprovedTemplates, useOrgTags } from "../../use-inbox";
import { flowKeys, useFlowRuns, useOrgMembers, type FlowDetail } from "../use-flows";
import { EditorCtx, NODE_STYLE, NODE_TYPES, type EditorNode } from "./flow-nodes";
import { NodeForm, TriggerForm } from "./node-forms";

const PALETTE: NodeType[] = ["send_text", "typing", "ask_buttons", "ask_list", "condition", "wait", "send_template", "tag", "notify", "handoff", "end"];

const DEFAULT_DATA: Record<NodeType, Record<string, unknown>> = {
  trigger: {},
  send_text: { text: "" },
  ask_buttons: { text: "", buttons: [{ id: "si", title: "Sí" }, { id: "no", title: "No" }], timeout_minutes: 60 },
  ask_list: { text: "", button_label: "Ver opciones", rows: [{ id: "op1", title: "" }], timeout_minutes: 60 },
  wait: { mode: "delay", minutes: 0, seconds: 5 },
  typing: { seconds: 3 },
  condition: { check: "business_hours", keywords: [], tag_id: null },
  send_template: { template_id: "", vars: {} },
  tag: { action: "add", tag_id: "" },
  notify: { target: "reception", user_id: null, note: "", pause_bot: true },
  handoff: { note: "" },
  end: {},
};

function toDefinition(nodes: EditorNode[], edges: Edge[]): FlowDefinition {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: n.type as NodeType, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: n.data })) as FlowDefinition["nodes"],
    edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? "next", target: e.target })),
  };
}
function fromDefinition(def: FlowDefinition | Record<string, unknown>): { nodes: EditorNode[]; edges: Edge[] } {
  const d = def as FlowDefinition;
  return {
    nodes: (d.nodes ?? []).map((n) => ({ id: n.id, type: n.type, position: n.position ?? { x: 0, y: 0 }, data: (n.data ?? {}) as Record<string, unknown> })),
    edges: (d.edges ?? []).map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? "next", target: e.target, type: "smoothstep" })),
  };
}
/** Llave estructural: lo que afecta la validación (no las posiciones). */
function structuralKey(nodes: EditorNode[], edges: Edge[], trigger: Trigger): string {
  return JSON.stringify({ n: nodes.map((n) => [n.id, n.type, n.data]), e: edges.map((e) => [e.source, e.sourceHandle, e.target]), t: trigger });
}

export default function FlowEditor({ flow, readOnly }: { flow: FlowDetail; readOnly: boolean }) {
  return (
    <ReactFlowProvider>
      <Editor flow={flow} readOnly={readOnly} />
    </ReactFlowProvider>
  );
}

function Editor({ flow, readOnly }: { flow: FlowDetail; readOnly: boolean }) {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const { theme } = useTheme();
  const rf = useReactFlow();
  const initial = useMemo(() => fromDefinition(flow.definition), [flow.definition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [trigger, setTrigger] = useState<Trigger>(() => TriggerSchema.safeParse(flow.trigger).data ?? TriggerSchema.parse({ kind: "keyword" }));
  const [name, setName] = useState(flow.name);
  const [status, setStatus] = useState(flow.status);
  const [version, setVersion] = useState(flow.version);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { data: tags = [] } = useOrgTags(organizationId);
  const { data: templates = [] } = useApprovedTemplates(organizationId);
  const { data: members = [] } = useOrgMembers(organizationId);
  const runs = useFlowRuns(flow.id);

  // ── Deshacer / rehacer: pila propia de instantáneas estructurales ──
  const history = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const snapshot = useCallback(() => JSON.stringify({ nodes, edges, trigger }), [nodes, edges, trigger]);
  const lastSnap = useRef<string>(JSON.stringify({ nodes: initial.nodes, edges: initial.edges, trigger }));
  const pushHistory = useCallback(() => {
    const s = snapshot();
    if (s === lastSnap.current) return;
    history.current.past.push(lastSnap.current);
    if (history.current.past.length > 60) history.current.past.shift();
    history.current.future = [];
    lastSnap.current = s;
    setDirty(true);
  }, [snapshot]);
  const restore = (s: string) => {
    const parsed = JSON.parse(s) as { nodes: EditorNode[]; edges: Edge[]; trigger: Trigger };
    setNodes(parsed.nodes);
    setEdges(parsed.edges);
    setTrigger(parsed.trigger);
    lastSnap.current = s;
    setDirty(true);
  };
  const undo = () => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(lastSnap.current);
    restore(prev);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(lastSnap.current);
    restore(next);
  };
  // Cambios estructurales (data, aristas, disparador) → historial, con un pequeño debounce para tecleo.
  const key = useMemo(() => structuralKey(nodes, edges, trigger), [nodes, edges, trigger]);
  const firstKey = useRef(key);
  useEffect(() => {
    if (key === firstKey.current) return;
    const t = setTimeout(pushHistory, 350);
    return () => clearTimeout(t);
  }, [key, pushHistory]);

  // ── Validación en vivo (solo por cambios estructurales) ──
  const validation = useMemo(
    () => validateFlow(trigger, toDefinition(nodes, edges), { tagIds: new Set(tags.map((t) => t.id)), templateIds: new Set(templates.map((t) => t.id)), userIds: new Set(members.map((m) => m.user_id)) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, tags, templates, members],
  );
  const errorIds = useMemo(() => new Set(validation.issues.filter((i) => i.level === "error" && i.nodeId).map((i) => i.nodeId as string)), [validation]);
  const errors = validation.issues.filter((i) => i.level === "error");
  const warnings = validation.issues.filter((i) => i.level === "warning");

  // ── Edición ──
  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );
  const addNode = useCallback(
    (type: NodeType, at?: { x: number; y: number }) => {
      if (readOnly) return;
      const id = `${type}_${Math.random().toString(36).slice(2, 7)}`;
      const pos = at ?? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type, position: pos, data: structuredClone(DEFAULT_DATA[type]), selected: true }]);
      setSelectedId(id);
    },
    [readOnly, rf, setNodes],
  );
  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target || c.source === c.target) return;
      const handle = c.sourceHandle ?? "next";
      setEdges((es) => addEdge({ ...c, sourceHandle: handle, id: `e_${c.source}_${handle}_${c.target}`, type: "smoothstep" }, es.filter((e) => !(e.source === c.source && (e.sourceHandle ?? "next") === handle))));
    },
    [readOnly, setEdges],
  );
  const deleteNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      const n = nodes.find((x) => x.id === id);
      if (!n || n.type === "trigger") return;
      setNodes((ns) => ns.filter((x) => x.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [nodes, readOnly, setEdges, setNodes],
  );
  const duplicateNode = useCallback(
    (id: string) => {
      if (readOnly) return;
      const n = nodes.find((x) => x.id === id);
      if (!n || n.type === "trigger") return;
      const copyId = `${n.type}_${Math.random().toString(36).slice(2, 7)}`;
      setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...n, id: copyId, position: { x: n.position.x + 40, y: n.position.y + 40 }, data: structuredClone(n.data), selected: true }]);
      setSelectedId(copyId);
    },
    [nodes, readOnly, setNodes],
  );
  const onBeforeDelete: OnBeforeDelete<EditorNode, Edge> = useCallback(async ({ nodes: ns, edges: es }) => {
    if (readOnly) return false;
    return { nodes: ns.filter((n) => n.type !== "trigger"), edges: es };
  }, [readOnly]);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/yenda-flow-node") as NodeType;
      if (!type || !(type in DEFAULT_DATA)) return;
      addNode(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [addNode, rf],
  );

  // ── Guardar / publicar / estado ──
  async function save(silent = false): Promise<boolean> {
    if (readOnly) return false;
    setSaving(true);
    const res = await inboxFetch(`/api/inbox/flows/${flow.id}`, { method: "PATCH", body: { name: name.trim() || flow.name, trigger, definition: toDefinition(nodes, edges) } });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setDirty(false);
    if (!silent) toast.success("Borrador guardado");
    qc.invalidateQueries({ queryKey: flowKeys.list(organizationId) });
    qc.invalidateQueries({ queryKey: flowKeys.one(flow.id) });
    return true;
  }
  async function publish() {
    if (errors.length) {
      setShowIssues(true);
      return void toast.error("Corrige los errores antes de publicar");
    }
    if (!(await save(true))) return;
    setPublishing(true);
    const res = await inboxFetch<{ version: { version: number }; issues: ValidationIssue[] }>(`/api/inbox/flows/${flow.id}/publish`, { method: "POST" });
    setPublishing(false);
    if (!res.ok) return void toast.error(res.error);
    setStatus("active");
    setVersion(res.data.version.version);
    toast.success(`Publicado v${res.data.version.version}: el bot ya responde con esta versión`);
    qc.invalidateQueries({ queryKey: flowKeys.list(organizationId) });
  }
  async function setFlowStatus(next: "active" | "paused") {
    const res = await inboxFetch(`/api/inbox/flows/${flow.id}`, { method: "PATCH", body: { status: next } });
    if (!res.ok) return void toast.error(res.error);
    setStatus(next);
    qc.invalidateQueries({ queryKey: flowKeys.list(organizationId) });
  }

  // Atajos y aviso al salir con cambios.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s") {
        e.preventDefault();
        void save();
      } else if (e.key === "z" && !e.shiftKey) {
        if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, trigger, name]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const ctxValue = useMemo(() => ({ errorIds, trigger, counts: runs.data?.node_counts ?? {} }), [errorIds, trigger, runs.data]);

  return (
    <div className="-mx-4 -mt-4 flex h-[calc(100dvh-5rem)] flex-col md:-mx-7 md:-mb-7 md:-mt-7 md:h-[calc(100dvh-4rem)]">
      {/* ── Barra superior ── */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-2 md:px-4">
        <Link href="/conversaciones/flows" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Flows
        </Link>
        <input
          value={name}
          readOnly={readOnly}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="min-w-[160px] flex-1 rounded-md bg-transparent px-2 py-1 text-base font-bold tracking-tight outline-none focus:bg-muted/50 md:max-w-sm"
          aria-label="Nombre del flow"
        />
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
            status === "active" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : status === "paused" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground",
          )}
        >
          {status === "active" ? `Activo · v${version}` : status === "paused" ? `Pausado · v${version}` : version > 0 ? `Borrador · publicado v${version}` : "Borrador"}
        </span>
        {dirty && <span className="text-[10px] text-amber-600 dark:text-amber-400">sin guardar</span>}
        <button
          type="button"
          onClick={() => setShowIssues(!showIssues)}
          className={cn("ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", errors.length ? "bg-red-500/10 text-red-700 dark:text-red-400" : warnings.length ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400")}
        >
          {errors.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {errors.length ? `${errors.length} error${errors.length === 1 ? "" : "es"}` : warnings.length ? `${warnings.length} aviso${warnings.length === 1 ? "" : "s"}` : "Listo para publicar"}
        </button>
        {!readOnly && (
          <>
            <button type="button" onClick={undo} title="Deshacer (Ctrl+Z)" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={redo} title="Rehacer (Ctrl+Shift+Z)" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setTestOpen(!testOpen)} className={cn("inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted", testOpen && "bg-muted")}>
              <FlaskConical className="h-3.5 w-3.5" /> Probar
            </button>
            <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </button>
            {status === "active" ? (
              <button type="button" onClick={() => void setFlowStatus("paused")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                <Pause className="h-3.5 w-3.5" /> Pausar
              </button>
            ) : status === "paused" ? (
              <button type="button" onClick={() => void setFlowStatus("active")} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                <Play className="h-3.5 w-3.5" /> Reanudar
              </button>
            ) : null}
            <button type="button" disabled={publishing} onClick={() => void publish()} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Publicar
            </button>
          </>
        )}
        {readOnly && (
          <button type="button" onClick={() => setTestOpen(!testOpen)} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
            <FlaskConical className="h-3.5 w-3.5" /> Probar
          </button>
        )}
      </header>
      {showIssues && validation.issues.length > 0 && (
        <div className="max-h-40 overflow-y-auto border-b border-border bg-muted/30 px-4 py-2 text-xs">
          <ul className="space-y-0.5">
            {validation.issues.map((i, k) => (
              <li key={k} className={cn("flex items-start gap-1.5", i.level === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => {
                    if (!i.nodeId) return;
                    setSelectedId(i.nodeId);
                    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === i.nodeId })));
                    const n = nodes.find((x) => x.id === i.nodeId);
                    if (n) rf.setCenter(n.position.x + 116, n.position.y + 60, { zoom: 1, duration: 300 });
                  }}
                >
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative min-h-0 flex-1 md:grid md:grid-cols-[200px_minmax(0,1fr)_320px]">
        {/* ── Paleta ── */}
        {!readOnly && (
          <aside className="hidden overflow-y-auto border-r border-border bg-card/60 p-2 md:block">
            <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Nodos</p>
            <ul className="space-y-0.5">
              {PALETTE.map((t) => {
                const Icon = NODE_STYLE[t].icon;
                return (
                  <li key={t}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/yenda-flow-node", t);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => addNode(t)}
                      className="flex w-full cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-muted active:cursor-grabbing"
                      title="Clic para añadir o arrastra al lienzo"
                    >
                      <span className={cn("grid h-6 w-6 place-items-center rounded-md", NODE_STYLE[t].chip)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {NODE_LABEL[t]}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 px-2 text-[10.5px] leading-snug text-muted-foreground">Conecta cada salida arrastrando desde su punto. Para borrar un nodo: selecciónalo y usa el tacho del panel derecho o la tecla Supr. Una conexión se borra igual: clic y Supr.</p>
          </aside>
        )}

        {/* ── Lienzo ── */}
        <div className="h-full min-h-[50vh]" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
          <EditorCtx.Provider value={ctxValue}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={onBeforeDelete}
              onNodeDragStop={pushHistory}
              onSelectionChange={({ nodes: sel }) => setSelectedId(sel[0]?.id ?? null)}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable
              deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={1.75}
              colorMode={theme === "dark" ? "dark" : "light"}
              defaultEdgeOptions={{ type: "smoothstep" }}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!bg-card" nodeStrokeWidth={2} />
            </ReactFlow>
          </EditorCtx.Provider>
        </div>

        {/* ── Panel de propiedades ── */}
        <aside className="absolute inset-x-0 bottom-0 max-h-[55%] overflow-y-auto border-t border-border bg-card p-3 md:static md:max-h-none md:border-l md:border-t-0">
          {selected ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold">{NODE_LABEL[selected.type as NodeType]}</h2>
                <div className="flex items-center gap-0.5">
                  {!readOnly && selected.type !== "trigger" && (
                    <>
                      <button type="button" onClick={() => duplicateNode(selected.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Duplicar nodo" title="Duplicar nodo">
                        <Copy className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => deleteNode(selected.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600" aria-label="Eliminar nodo" title="Eliminar nodo (Supr)">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => { setSelectedId(null); setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); }} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {selected.type === "trigger" ? (
                <TriggerForm trigger={trigger} onChange={setTrigger} readOnly={readOnly} />
              ) : (
                <NodeForm type={selected.type as NodeType} data={selected.data} onChange={(patch) => updateNodeData(selected.id, patch)} readOnly={readOnly} tags={tags} templates={templates} members={members} />
              )}
              {errorIds.has(selected.id) && (
                <ul className="mt-3 space-y-0.5 text-[11px] text-red-700 dark:text-red-400">
                  {validation.issues.filter((i) => i.nodeId === selected.id).map((i, k) => <li key={k}>· {i.message}</li>)}
                </ul>
              )}
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Selecciona un nodo</p>
              <p className="mt-1">Aquí se edita lo que dice y hacia dónde sigue. El Disparador define cuándo arranca el flow.</p>
              <p className="mt-3">Reglas que el bot cumple siempre: un solo bot por chat; si alguien del equipo escribe, el bot se pausa; fuera de la ventana de 24 h solo sale una plantilla; STOP o BAJA lo apagan; una alarma pasa a una persona.</p>
              {runs.data && runs.data.runs.length > 0 && (
                <p className="mt-3">
                  <span className="font-semibold text-foreground">{runs.data.runs.length} ejecuciones recientes.</span> Los números en cada tarjeta son cuántas veces pasó por ese nodo.
                </p>
              )}
            </div>
          )}
        </aside>

        {testOpen && <TestDrawer flowId={flow.id} trigger={trigger} definition={toDefinition(nodes, edges)} onClose={() => setTestOpen(false)} />}
      </div>
    </div>
  );
}

// ── Probar: burbujas estilo WhatsApp sobre el motor puro ─────────
type TestEvent = { type: "start" } | { type: "inbound"; text: string | null; interactiveId?: string | null } | { type: "timer" };
interface TestStep {
  event: TestEvent;
  effects: Array<Record<string, unknown> & { kind: string; nodeId: string }>;
  trace: Array<{ nodeId: string; type: string; out?: string; note?: string }>;
  status: string;
  endReason: string | null;
}

function TestDrawer({ flowId, trigger, definition, onClose }: { flowId: string; trigger: Trigger; definition: FlowDefinition; onClose: () => void }) {
  const [events, setEvents] = useState<TestEvent[]>([{ type: "start" }]);
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState({ windowOpen: true, businessHoursOpen: true, hasPatient: false, quiet: false });
  const bottom = useRef<HTMLDivElement>(null);

  const run = useCallback(
    async (evs: TestEvent[]) => {
      setBusy(true);
      const res = await inboxFetch<{ steps: TestStep[] }>(`/api/inbox/flows/${flowId}/test`, { method: "POST", body: { trigger, definition, events: evs, env } });
      setBusy(false);
      if (!res.ok) return void toast.error(res.error);
      setSteps(res.data.steps);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
    },
    [definition, env, flowId, trigger],
  );
  useEffect(() => {
    void run(events);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env]);

  const push = (ev: TestEvent) => {
    const next = [...events, ev];
    setEvents(next);
    void run(next);
  };
  const last = steps[steps.length - 1];
  const ended = last && ["done", "handed_off", "failed"].includes(last.status);
  const END_LABEL: Record<string, string> = { fin: "Fin del flow", persona: "Pasó a una persona", ventana_cerrada: "Terminó: ventana de 24 h cerrada", tiempo_agotado: "Terminó: sin respuesta a tiempo", sin_salida_otra_respuesta: "Terminó: respuesta distinta y sin salida", tope_pasos: "Terminó: tope de pasos", alarma: "Alarma: pasó a una persona" };

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl md:w-[360px]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="flex items-center gap-1.5 text-sm font-bold"><FlaskConical className="h-4 w-4" /> Probar</p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { setEvents([{ type: "start" }]); void run([{ type: "start" }]); }} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">Reiniciar</button>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1"><input type="checkbox" checked={env.windowOpen} onChange={(e) => setEnv({ ...env, windowOpen: e.target.checked })} /> ventana 24 h</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={env.businessHoursOpen} onChange={(e) => setEnv({ ...env, businessHoursOpen: e.target.checked })} /> en horario</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={env.hasPatient} onChange={(e) => setEnv({ ...env, hasPatient: e.target.checked })} /> con ficha</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={env.quiet} onChange={(e) => setEnv({ ...env, quiet: e.target.checked })} /> silencio</label>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/20 p-3 text-[12.5px]">
        {steps.map((s, i) => (
          <div key={i} className="space-y-1.5">
            {s.event.type === "inbound" && (
              <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm bg-emerald-100 px-3 py-1.5 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-50">
                <User className="mr-1 inline h-3 w-3" /> {s.event.text ?? "(botón)"}
              </p>
            )}
            {s.event.type === "timer" && <p className="text-center text-[10.5px] text-muted-foreground"><Clock className="mr-1 inline h-3 w-3" /> pasó el tiempo</p>}
            {s.effects.map((ef, k) => (
              <div key={k}>
                {(ef.kind === "send_text" || ef.kind === "send_buttons" || ef.kind === "send_list") && (
                  <div className="w-fit max-w-[90%] rounded-xl rounded-tl-sm bg-card px-3 py-1.5 shadow-sm">
                    <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground"><Bot className="mr-1 inline h-3 w-3" />Bot</p>
                    <p className="whitespace-pre-wrap">{ef.text as string}</p>
                    {(ef.buttons as Array<{ id: string; title: string }> | undefined)?.map((b) => (
                      <button key={b.id} type="button" disabled={ended || i !== steps.length - 1} onClick={() => push({ type: "inbound", text: b.title, interactiveId: `${ef.nodeId}:${b.id}` })} className="mt-1 mr-1 rounded-md border border-primary/40 px-2 py-0.5 text-[11px] text-primary disabled:opacity-50">
                        {b.title}
                      </button>
                    ))}
                    {(ef.rows as Array<{ id: string; title: string }> | undefined)?.map((r, n) => (
                      <button key={r.id} type="button" disabled={ended || i !== steps.length - 1} onClick={() => push({ type: "inbound", text: r.title, interactiveId: `${ef.nodeId}:${r.id}` })} className="mt-1 mr-1 rounded-md border border-primary/40 px-2 py-0.5 text-[11px] text-primary disabled:opacity-50">
                        {n + 1}. {r.title}
                      </button>
                    ))}
                  </div>
                )}
                {ef.kind === "typing" && <p className="text-[11px] italic text-muted-foreground">⌨️ escribiendo… {ef.seconds as number} s</p>}
                {ef.kind === "sleep" && <p className="text-[11px] italic text-muted-foreground">⏱ espera {ef.seconds as number} s</p>}
                {ef.kind === "send_template" && <p className="text-[11px] italic text-muted-foreground">📄 Enviaría la plantilla</p>}
                {ef.kind === "tag" && <p className="text-[11px] italic text-muted-foreground">🏷 {ef.action === "remove" ? "Quita" : "Pone"} etiqueta</p>}
                {ef.kind === "notify" && <p className="text-[11px] italic text-muted-foreground">🔔 Avisa: {(ef.note as string) || "(sin nota)"}</p>}
                {ef.kind === "pause" && <p className="text-[11px] italic text-muted-foreground">⏸ El bot se pausa</p>}
              </div>
            ))}
            {i === steps.length - 1 && ended && <p className="text-center text-[10.5px] font-semibold text-muted-foreground">{END_LABEL[s.endReason ?? ""] ?? s.endReason}</p>}
          </div>
        ))}
        {busy && <p className="text-center text-[10.5px] text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /></p>}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-center gap-1.5 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || ended) return;
          push({ type: "inbound", text: text.trim() });
          setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} disabled={ended} placeholder={ended ? "El flow terminó" : "Escribe como la paciente…"} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none" />
        <button type="button" disabled={ended || !last || !["waiting_reply", "waiting_delay"].includes(last.status)} onClick={() => push({ type: "timer" })} title="Pasar el tiempo de espera" className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"><Clock className="h-4 w-4" /></button>
        <button type="submit" disabled={ended || !text.trim()} className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-40" aria-label="Enviar"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
