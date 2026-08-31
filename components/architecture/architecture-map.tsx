"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { NeonNode } from "./neon-node";
import {
  initialNodes,
  initialEdges,
  crossEdges,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type ArchNodeData,
  type NodeCategory,
} from "./architecture-data";

type ArchFlowNode = Node<ArchNodeData>;

/** Fuera del componente: si se define dentro, React Flow re-registra los
 *  tipos en cada render y avisa por consola en cada movimiento. */
const nodeTypes = { neon: NeonNode };

/** Estilo de las aristas del árbol vs. las de relación (punteadas). */
const TREE_EDGE_STYLE = { stroke: "#334155", strokeWidth: 1.5 };
const CROSS_EDGE_STYLE = {
  stroke: "#475569",
  strokeWidth: 1,
  strokeDasharray: "4 4",
};

/**
 * Índice padre → hijos directos, construido UNA vez a partir de las
 * aristas del árbol. Sin esto, cada doble clic recorrería el array de
 * aristas por cada nivel de profundidad.
 */
function buildChildIndex(edges: { source: string; target: string }[]) {
  const index = new Map<string, string[]>();
  for (const e of edges) {
    const children = index.get(e.source) ?? [];
    children.push(e.target);
    index.set(e.source, children);
  }
  return index;
}

/**
 * Descendientes de un nodo, en profundidad (hijos, nietos, …).
 *
 * Recorrido iterativo con `visited`: un grafo mal editado a mano puede
 * tener un ciclo, y una versión recursiva ingenua se colgaría. `visited`
 * también evita repetir ramas cuando dos padres comparten un hijo.
 */
function collectDescendants(
  rootId: string,
  childIndex: Map<string, string[]>
): Set<string> {
  const found = new Set<string>();
  const stack = [...(childIndex.get(rootId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (found.has(current)) continue;
    found.add(current);
    stack.push(...(childIndex.get(current) ?? []));
  }
  return found;
}

export function ArchitectureMap() {
  const [nodes, setNodes, onNodesChange] = useNodesState<ArchFlowNode>(
    initialNodes as ArchFlowNode[]
  );

  // Las dos familias de aristas se mezclan aquí: las del árbol (sólidas,
  // mandan en el colapso) y las de relación (punteadas, informativas).
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([
    ...initialEdges.map((e) => ({
      ...e,
      type: "smoothstep" as const,
      style: TREE_EDGE_STYLE,
    })),
    ...crossEdges.map((e) => ({
      ...e,
      type: "smoothstep" as const,
      animated: true,
      style: CROSS_EDGE_STYLE,
    })),
  ]);

  /** Nodos actualmente plegados — solo para pintar el contador de la UI. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const childIndex = useMemo(() => buildChildIndex(initialEdges), []);

  /**
   * Doble clic = plegar / desplegar la rama.
   *
   * Regla clave: el estado lo manda el PADRE, no cada hijo. Al plegar se
   * ocultan TODOS los descendientes (no solo los hijos directos); al
   * desplegar se muestran los descendientes salvo los que cuelgan de otro
   * nodo que sigue plegado — así, plegar A, plegar B (dentro de A) y
   * desplegar A no resucita la rama de B, que es lo que el usuario espera.
   */
  const onNodeDoubleClick: NodeMouseHandler<ArchFlowNode> = useCallback(
    (_event, node) => {
      const descendants = collectDescendants(node.id, childIndex);
      if (descendants.size === 0) return; // hoja: no hay nada que plegar

      const willCollapse = !collapsed.has(node.id);

      // 1. Nuevo conjunto de plegados (se calcula antes para reutilizarlo).
      const nextCollapsed = new Set(collapsed);
      if (willCollapse) nextCollapsed.add(node.id);
      else nextCollapsed.delete(node.id);

      // 2. Un nodo queda oculto si CUALQUIER ancestro suyo está plegado.
      const hiddenIds = new Set<string>();
      for (const collapsedId of nextCollapsed) {
        for (const id of collectDescendants(collapsedId, childIndex)) {
          hiddenIds.add(id);
        }
      }

      setNodes((prev) =>
        prev.map((n) => ({ ...n, hidden: hiddenIds.has(n.id) }))
      );

      // 3. Las aristas siguen a los nodos: se oculta la que toque un nodo
      //    oculto en cualquiera de sus dos extremos. Incluye las punteadas
      //    de relación, que si no quedarían colgando en el vacío.
      setEdges((prev) =>
        prev.map((e) => ({
          ...e,
          hidden: hiddenIds.has(e.source) || hiddenIds.has(e.target),
        }))
      );

      setCollapsed(nextCollapsed);
    },
    [collapsed, childIndex, setNodes, setEdges]
  );

  /** Restablece el mapa completo (útil tras plegar media docena de ramas). */
  const expandAll = useCallback(() => {
    setNodes((prev) => prev.map((n) => ({ ...n, hidden: false })));
    setEdges((prev) => prev.map((e) => ({ ...e, hidden: false })));
    setCollapsed(new Set());
  }, [setNodes, setEdges]);

  return (
    <div className="relative h-full w-full bg-[#080b11]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={1.6}
        proOptions={{ hideAttribution: false }}
        // Mapa de lectura: se navega y se pliega, no se rediseña el grafo
        // arrastrando cajas (las posiciones son documentación).
        nodesDraggable={false}
        nodesConnectable={false}
        className="[&_.react-flow\_\_attribution]:!bg-transparent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1}
          color="#1e293b"
        />
        <Controls
          className="!border-slate-700 !bg-[#0d1117] [&_button]:!border-slate-700 [&_button]:!bg-[#0d1117] [&_button]:!fill-slate-400 [&_button:hover]:!bg-slate-800"
          showInteractive={false}
        />
        <MiniMap
          pannable
          zoomable
          className="!bg-[#0d1117]"
          maskColor="rgba(8, 11, 17, 0.75)"
          style={{ border: "1px solid #1e293b", borderRadius: 8 }}
          nodeColor={(n) =>
            CATEGORY_COLORS[(n.data as ArchNodeData).category].base
          }
          nodeStrokeWidth={0}
        />
      </ReactFlow>

      {/* Leyenda + ayuda. Fuera del lienzo de React Flow para que no se
          escale con el zoom. */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border border-slate-800 bg-[#0d1117]/90 px-4 py-3 backdrop-blur">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Arquitectura de Yenda
        </p>
        <div className="mb-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
          {(Object.keys(CATEGORY_LABELS) as NodeCategory[]).map((cat) => (
            <span key={cat} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  background: CATEGORY_COLORS[cat].base,
                  boxShadow: `0 0 8px rgba(${CATEGORY_COLORS[cat].glow}, 0.8)`,
                }}
              />
              <span className="text-[10px] text-slate-400">
                {CATEGORY_LABELS[cat]}
              </span>
            </span>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          Doble clic para plegar una rama · cursor encima para el detalle
          <br />
          Línea punteada = quién habla con quién
        </p>
      </div>

      {/* Solo aparece cuando hay algo plegado: un botón permanente que casi
          nunca aplica es ruido. */}
      {collapsed.size > 0 && (
        <button
          type="button"
          onClick={expandAll}
          className="absolute right-4 top-4 z-10 rounded-lg border border-slate-700 bg-[#0d1117]/90 px-3 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur transition-colors hover:border-slate-500 hover:text-white"
        >
          Desplegar todo ({collapsed.size})
        </button>
      )}
    </div>
  );
}
